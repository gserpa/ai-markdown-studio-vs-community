import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createMarkdownRenderer, sanitizeRenderedHtml } from '../../md-core/src/render/markdownRenderer';
import { parseComponent, prepareComponentsForPptx, getComponentPptxWarnings } from '../../md-core/src/components/components';
import { validateMpsSource } from '../../md-core/src/presentation/mpsLanguageService';

const decisions = `type: record-list
version: 1
data:
  heading: Open items
  groups:
    - label: Decisions
      records:
        - title: Choose a route
          id: D-1
          detail: Confirm by Friday
          metadata: { Owner: Alex, "10": Later, "2": Earlier }
          status: { label: Waiting, style: warning }
    - label: Issues
      records:
        - title: Access pending
          ordinal: 2
          tags: [Operations, Review]
          scale: { value: 2, max: 4, label: Stage }
options:
  variant: compact
`;
function html(source: string) { return new JSDOM(sanitizeRenderedHtml(createMarkdownRenderer().render('Before\n\n~~~component\n'+source+'~~~\n\nAfter'))).window.document; }
describe('record-list component', () => {
  it('renders grouped records, supplied metadata, status and scale in authored order', () => {
    const doc=html(decisions);
    expect([...doc.querySelectorAll('[data-record-group-label]')].map(e=>e.textContent)).toEqual(['Decisions','Issues']);
    const items=[...doc.querySelectorAll('[data-record-item]')];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('D-1 Choose a route');
    expect(items[0].textContent).toContain('Owner: Alex · 10: Later · 2: Earlier');
    expect(items[1].textContent).toContain('Stage: 2/4');
    expect(doc.querySelector('section.md-record-list')?.getAttribute('data-component-fit')).toBe('required');
    expect(doc.body.textContent).toContain('Before'); expect(doc.body.textContent).toContain('After');
  });
  it('works for an unrelated ungrouped collection without inferring optional fields', () => {
    const doc=html('type: record-list\nversion: 1\ndata:\n  records:\n    - title: Water seedlings\n    - title: Prepare soil\n');
    expect([...doc.querySelectorAll('[data-record-item]')].map(e=>e.textContent?.trim())).toEqual(['Water seedlings','Prepare soil']);
    expect(doc.querySelector('.md-record-status, .md-record-scale')).toBeNull();
  });
  it('escapes authored markup and does not execute it', () => {
    const doc=html('type: record-list\nversion: 1\ndata:\n  records:\n    - title: "<img src=x onerror=alert(1)>"\n');
    expect(doc.querySelector('img,script')).toBeNull(); expect(doc.body.textContent).toContain('<img src=x onerror=alert(1)>');
  });
  it('preserves all supplied values in the PowerPoint text fallback', () => {
    const doc=html(decisions); prepareComponentsForPptx(doc);
    const text=doc.body.textContent ?? '';
    for(const value of ['Open items','Decisions','D-1','Choose a route','Confirm by Friday','Owner: Alex','Issues','Access pending','Stage: 2/4']) expect(text).toContain(value);
    expect(doc.querySelector('.md-record-list')).toBeNull();
    expect(getComponentPptxWarnings('~~~component\n'+decisions+'~~~').join(' ')).toContain('record-list content as text');
  });
  it.each([
    decisions.replace('style: warning','style: invented'),
    decisions.replace('value: 2, max: 4','value: 5, max: 4'),
    decisions.replace('value: 2, max: 4','value: -1, max: 4'),
    decisions.replace('value: 2, max: 4','value: 0, max: 0'),
    decisions.replace('ordinal: 2','ordinal: 0'),
    decisions.replace('variant: compact','variant: unknown'),
    decisions.replace('  heading: Open items','  records: []\n  heading: Open items'),
    decisions.replace('title: Choose a route','title: Choose a route\n          title: Duplicate'),
    decisions.replace('title: Choose a route','title: &x Choose a route').replace('title: Access pending','title: *x'),
    decisions.replace('title: Choose a route','title: ""'),
  ])('reports invalid input without losing surrounding text: %#', source => {
    const result=parseComponent(source); expect(result.valid).toBe(false);
    const doc=html(source); expect(doc.querySelector('.md-component-error')).not.toBeNull(); expect(doc.body.textContent).toContain('After');
    expect(validateMpsSource('---\ndocument: presentation\n---\n\n~~~component\n'+source+'~~~').some(issue=>issue.code==='invalid-component')).toBe(true);
  });
});
