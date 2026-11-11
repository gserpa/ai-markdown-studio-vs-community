import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { validateMpsSource } from '../../md-core/src/presentation/mpsLanguageService';
import { parseComponent } from '../../md-core/src/components/components';
import { createMarkdownRenderer, sanitizeRenderedHtml } from '../../md-core/src/render/markdownRenderer';

const matrix = `type: status-matrix
version: 1
data:
  columns: [Scope, Design]
  rows:
    - label: Alpha
      cells:
        Scope: Complete
        Design: Pending
    - label: Beta
      cells:
        Scope: Pending
`;

describe('component status matrix', () => {
  it('renders an accessible static table in source order alongside ordinary content', () => {
    const markdown = `Before\n\n~~~component\n${matrix}~~~\n\nAfter`;
    const doc = new JSDOM(sanitizeRenderedHtml(createMarkdownRenderer().render(markdown))).window.document;
    expect(doc.body.textContent).toContain('Before');
    expect(doc.body.textContent).toContain('After');
    const table = doc.querySelector('table.md-status-matrix')!;
    expect([...table.querySelectorAll('thead th')].map(e => e.textContent)).toEqual(['Item', 'Scope', 'Design']);
    expect([...table.querySelectorAll('tbody th')].map(e => e.textContent)).toEqual(['Alpha', 'Beta']);
    expect(table.querySelector('tbody th')?.getAttribute('scope')).toBe('row');
    expect(table.querySelector('thead th')?.getAttribute('scope')).toBe('col');
    expect(table.textContent).toContain('Complete');
    expect(table.textContent).toContain('—');
  });
  it('escapes user text and reports invalid source without affecting neighbors', () => {
    const invalid = `type: status-matrix\nversion: 1\ndata:\n  columns: [A]\n  rows:\n    - label: "<img src=x onerror=alert(1)>"\n      cells: { B: x }\n`;
    const html = createMarkdownRenderer().render(`Before\n\n~~~component\n${invalid}~~~\n\nAfter`);
    const doc = new JSDOM(sanitizeRenderedHtml(html)).window.document;
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.querySelector('.md-component-error')?.textContent).toContain('component line 1');
    expect(doc.body.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(doc.body.textContent).toContain('After');
  });
  it.each([
    matrix.replace('version: 1', 'version: 2'),
    matrix.replace('status-matrix', 'other'),
    matrix.replace('columns: [Scope, Design]', 'columns: [Scope, Scope]'),
    matrix.replace('columns: [Scope, Design]', 'columns: { Group: [Scope] }'),
    matrix + 'other: true\n',
    matrix.replace('version: 1', 'version: 1\nversion: 1'),
    matrix.replace('Scope: Complete', 'Scope: &value Complete').replace('Scope: Pending', 'Scope: *value'),
    matrix.replace('Scope: Complete', 'Scope: !custom Complete'),
    matrix + '---\ntype: status-matrix\n',
    matrix.replace('Scope: Complete', '__proto__: Complete'),
    matrix.replace('Scope: Complete', 'Scope: .inf'),
    'x'.repeat(32_769),
  ])('rejects unsafe or unsupported input: %#', source => {
    expect(parseComponent(source).valid).toBe(false);
  });
  it('treats a missing cell as unknown even when its column resembles an inherited property', () => {
    const result = parseComponent('type: status-matrix\nversion: 1\ndata:\n  columns: [toString]\n  rows:\n    - label: One\n');
    expect(result.valid && result.value.matrix.rows[0].cells).toEqual([null]);
  });
  it('preserves simple authored statuses as text without inferring meaning', () => {
    const result = parseComponent(matrix.replace('Complete', '50%'));
    expect(result.valid && result.value.matrix.rows[0].cells[0]).toBe('50%');
  });
  it('locates YAML errors in the presentation source, including CRLF', () => {
    const source = ('---\ndocument: presentation\n---\n\n~~~component\n' + matrix.replace('version: 1', 'version: 1\nversion: 1') + '~~~').replace(/\n/g, '\r\n');
    const issue = validateMpsSource(source).find(item => item.code === 'invalid-component');
    expect(issue).toBeDefined();
    expect(source.slice(issue!.start, issue!.start + 7)).toBe('version');
  });
  it('does not interpret ordinary fences as components', () => {
    const doc = new JSDOM(createMarkdownRenderer().render('~~~yaml\n' + matrix + '~~~')).window.document;
    expect(doc.querySelector('table')).toBeNull();
    expect(doc.querySelector('code')?.textContent).toContain('status-matrix');
  });
});
