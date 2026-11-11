import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createMarkdownRenderer, sanitizeRenderedHtml } from '../../md-core/src/render/markdownRenderer';
import { parseComponent, prepareComponentsForPptx, getComponentPptxWarnings } from '../../md-core/src/components/components';
import { validateMpsSource } from '../../md-core/src/presentation/mpsLanguageService';
const facts=`type: fact-cards
version: 1
data:
  heading: Snapshot
  cards:
    - label: Reviewed
      value: { numerator: 6, denominator: 8 }
      detail: Supplied ratio
      accent: info
    - label: Next report
      value: "20 November"
      icon: calendar
    - label: Folder
      value: "F:/reports/current"
      icon: folder
    - label: Items
      value: 21
      unit: tasks
      secondValue: 4
      accent: success
`;
function html(source:string) { return new JSDOM(sanitizeRenderedHtml(createMarkdownRenderer().render('Before\n\n~~~component\n'+source+'~~~\n\nAfter'))).window.document; }
describe('fact-cards component',()=>{
  it('renders mixed values in source order without deriving extra values',()=>{
    const doc=html(facts), cards=[...doc.querySelectorAll('[data-fact-card]')];
    expect(cards).toHaveLength(4); expect(cards[0].textContent).toContain('6/8');
    expect(cards[1].textContent).toContain('20 November');expect(cards[2].textContent).toContain('F:/reports/current');
    expect(cards[3].textContent).toContain('21 tasks 4');expect(doc.body.textContent).not.toContain('75%');
    expect(doc.querySelector('.md-fact-cards')?.getAttribute('data-component-fit')).toBe('required');
  });
  it('works for an unrelated topic and treats path-like values as text',()=>{
    const doc=html('type: fact-cards\nversion: 1\ndata:\n  cards:\n    - label: Greenhouse\n      value: "C:/plants/seeds"\n    - label: Temperature\n      value: 18\n      unit: C\n');
    expect(doc.querySelector('a')).toBeNull();expect(doc.body.textContent).toContain('C:/plants/seeds');expect(doc.body.textContent).toContain('18 C');
  });
  it('escapes authored content and preserves neighboring content',()=>{
    const doc=html('type: fact-cards\nversion: 1\ndata:\n  cards:\n    - label: "<img src=x onerror=alert(1)>"\n      value: "<script>alert(1)</script>"\n');
    expect(doc.querySelector('img,script')).toBeNull();expect(doc.body.textContent).toContain('<script>alert(1)</script>');expect(doc.body.textContent).toContain('After');
  });
  it('preserves values in the PowerPoint fallback without decorative symbols',()=>{
    const doc=html(facts);prepareComponentsForPptx(doc);const content=doc.body.textContent??'';
    for(const value of ['Snapshot','Reviewed','6/8','20 November','F:/reports/current','21 tasks 4']) expect(content).toContain(value);
    expect(content).not.toContain('▣');expect(doc.querySelector('.md-fact-cards')).toBeNull();
    expect(getComponentPptxWarnings('~~~component\n'+facts+'~~~').join(' ')).toContain('fact-card content as text');
  });
  it.each([
    facts.replace('denominator: 8','denominator: 0'),
    facts.replace('numerator: 6','numerator: .inf'),
    facts.replace('accent: info','accent: custom'),
    facts.replace('icon: calendar','icon: arbitrary'),
    facts.replace('value: 21','value: true'),
    facts.replace('label: Items','label: Items\n      label: Duplicate'),
    facts.replace('label: Items','label: &x Items').replace('label: Folder','label: *x'),
    facts.replace('heading: Snapshot','heading: Snapshot\n  unknown: yes'),
    facts.replace('value: 21','value: ""'),
  ])('reports invalid values and preserves surrounding text: %#',source=>{
    expect(parseComponent(source).valid).toBe(false);const doc=html(source);expect(doc.querySelector('.md-component-error')).not.toBeNull();expect(doc.body.textContent).toContain('After');
    expect(validateMpsSource('---\ndocument: presentation\n---\n\n~~~component\n'+source+'~~~').some(issue=>issue.code==='invalid-component')).toBe(true);
  });
});
