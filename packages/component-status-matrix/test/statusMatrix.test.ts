import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { getMpsCompletions, validateMpsSource } from '../../md-core/src/presentation/mpsLanguageService';
import { formatMarkdownTables } from '../../md-core/src/format/markdownTableFormatter';
import { prepareMatrixForPptx } from '../src/pptx';
import { parseComponent } from '../../md-core/src/components/components';
import { createMarkdownRenderer, sanitizeRenderedHtml } from '../../md-core/src/render/markdownRenderer';

const structured = `type: status-matrix
version: 1
data:
  columns:
    Definition: [Scope, Sign-off]
    Build: [Development]
  statuses: { Pending: neutral, Complete: success, Active: info }
  rows:
    - label: Alpha
      cells:
        Scope: Complete
        Sign-off: { status: Active, progress: "1/2" }
        Development: Pending
`;
const table = `type: status-matrix
version: 1
data:
  markdown-table: |
    | Item | Definition {2} | Build |
    |      | Scope | Sign-off | Development |
    | --- | --- | --- | --- |
    | Alpha | Complete | Active :: 1/2 | Pending |
  statuses: { Pending: neutral, Complete: success, Active: info }
`;
describe('expanded matrix', () => {
  it('normalizes structured and table input to the same model', () => {
    const a = parseComponent(structured), b = parseComponent(table);
    expect(a.valid).toBe(true); expect(b.valid).toBe(true);
    if (a.valid && b.valid) expect(a.value.matrix).toEqual(b.value.matrix);
  });
  it('renders grouped headers, styles and accessible half-filled bars without scripts', () => {
    const html = sanitizeRenderedHtml(createMarkdownRenderer().render('~~~component\n' + table + '~~~'));
    const doc = new JSDOM(html).window.document;
    expect(doc.querySelector('th[scope="colgroup"]')?.getAttribute('colspan')).toBe('2');
    expect(doc.querySelector('.md-matrix-info')?.textContent).toContain('Active');
    const bar = doc.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('50');
    expect(bar?.getAttribute('aria-label')).toContain('Alpha, Sign-off: 1/2');
    expect(bar?.querySelector('.md-matrix-progress-fill')?.getAttribute('style')).toContain('width:50%');
    expect(doc.querySelector('.md-matrix-progress-text')?.textContent).toBe('1/2');
  });
  it('formats literal tables idempotently without changing their meaning or neighboring fences', () => {
    const source = 'Before\r\n\r\n~~~component\r\n' + table.replace(/\n/g, '\r\n') + '~~~\r\n\r\n~~~yaml\r\n| unformatted | x |\r\n~~~\r\n';
    const formatted = formatMarkdownTables(source);
    expect(formatted).not.toBe(source);
    expect(formatMarkdownTables(formatted)).toBe(formatted);
    expect(formatted).toContain('~~~yaml\r\n| unformatted | x |\r\n~~~');
    const content = formatted.split('~~~component\r\n')[1].split('~~~')[0];
    const before = parseComponent(table), after = parseComponent(content);
    expect(before.valid && after.valid && before.value.matrix).toEqual(after.valid && after.value.matrix);
    expect(formatted).toContain('  statuses: { Pending: neutral, Complete: success, Active: info }');
  });
  it('leaves malformed component tables unchanged when formatting', () => {
    const invalid = '~~~component\n' + table.replace('Definition {2}', 'Definition {0}') + '~~~';
    expect(formatMarkdownTables(invalid)).toBe(invalid);
  });
  it('supports escaped pipes and literal terminal braces in grouped headers', () => {
    const input = table.replace('Definition {2}', String.raw`Def\|inition \{literal\} {2}`).replace('Alpha |', String.raw`Al\|pha |`);
    const result = parseComponent(input);
    expect(result.valid && result.value.matrix.groups?.[0].label).toBe('Def|inition {literal}');
    expect(result.valid && result.value.matrix.rows[0].label).toBe('Al|pha');
  });
  it('points editor diagnostics to the supplied invalid progress', () => {
    const source = '---\ndocument: presentation\n---\n\n~~~component\n' + table.replace('1/2', '3/2') + '~~~';
    const issue = validateMpsSource(source).find(item => item.code === 'invalid-component');
    expect(issue).toBeDefined();
    expect(source.slice(issue!.start, issue!.start + 3)).toBe('3/2');
  });
  it('offers the matrix snippet outside fenced examples only', () => {
    const header = '---\ndocument: presentation\n---\n\n';
    expect(getMpsCompletions(header, header.length).map(item => item.label)).toContain('status-matrix');
    const inside = header + '~~~yaml\n\n~~~';
    expect(getMpsCompletions(inside, inside.lastIndexOf('\n\n~~~') + 1).map(item => item.label)).not.toContain('status-matrix');
  });
  it('does not mistake a dash-only data row for a grouped table separator', () => {
    const source = `type: status-matrix
version: 1
data:
  markdown-table: |
    | Item | State |
    | --- | --- |
    | --- | --- |
`;
    const result = parseComponent(source);
    expect(result.valid && result.value.matrix.groups).toBeUndefined();
    expect(result.valid && result.value.matrix.rows[0].cells).toEqual(['---']);
  });
  it('retains readable row detail and status/progress text in PowerPoint fallback', () => {
    const withDetail = structured.replace('    - label: Alpha', '    - label: Alpha\n      detail: Team A');
    const doc = new JSDOM(sanitizeRenderedHtml(createMarkdownRenderer().render('~~~component\n' + withDetail + '~~~'))).window.document;
    prepareMatrixForPptx(doc);
    expect(doc.querySelector('tbody th')?.textContent).toBe('Alpha Team A');
    expect(doc.querySelector('.md-matrix-info')?.textContent).toBe('Active 1/2');
    expect([...doc.querySelectorAll('thead th')].map(node => node.textContent)).toEqual(['Item', 'Definition / Scope', 'Definition / Sign-off', 'Build / Development']);
  });

  it('preserves optional generic indicators and trailing notes, including PowerPoint fallback', () => {
    const source = structured.replace('    - label: Alpha', '    - label: Alpha\n      indicator: { label: "Check <now>", style: warning }\n      note: "Review & sign off"');
    const doc = new JSDOM(sanitizeRenderedHtml(createMarkdownRenderer().render('~~~component\n' + source + '~~~'))).window.document;
    expect(doc.querySelector('.md-matrix-indicator')?.textContent).toBe('Check <now>');
    expect(doc.querySelector('tbody td:last-child')?.textContent).toBe('Review & sign off');
    expect(doc.querySelector('thead tr:first-child th:last-child')?.textContent).toBe('Note');
    prepareMatrixForPptx(doc);
    expect([...doc.querySelectorAll('thead th')].map(node => node.textContent)).toEqual(['Item', 'Definition / Scope', 'Definition / Sign-off', 'Build / Development', 'Note']);
    expect(doc.querySelector('tbody th')?.textContent).toContain('Check <now>');
    expect(doc.querySelector('tbody td:last-child')?.textContent).toBe('Review & sign off');
    expect(parseComponent(source.replace('style: warning', 'style: custom')).valid).toBe(false);
  });
  it('keeps numeric group labels in source order', () => {
    const result = parseComponent(structured.replace('Definition:', '"10":').replace('Build:', '"2":'));
    expect(result.valid && result.value.matrix.groups?.map(g => g.label)).toEqual(['10', '2']);
  });
  it('accepts larger generic tables within the cell budget and rejects oversized tables', () => {
    const makeTable = (columnCount: number, rowCount: number) => {
      const columns = Array.from({ length: columnCount }, (_, i) => `C${i}`);
      const line = (cells: string[]) => `    | ${cells.join(' | ')} |`;
      return ['type: status-matrix', 'version: 1', 'data:', '  markdown-table: |',
        line(['Item', ...columns]), line(Array(columnCount + 1).fill('---')),
        ...Array.from({ length: rowCount }, (_, i) => line([`R${i}`, ...Array(columnCount).fill('OK')]))].join('\n');
    };
    const wide = parseComponent(makeTable(20, 50));
    expect(wide.valid && wide.value.matrix.columns).toHaveLength(20);
    expect(wide.valid && wide.value.matrix.rows).toHaveLength(50);
    expect(parseComponent(makeTable(20, 51)).valid).toBe(false);
    expect(parseComponent(makeTable(65, 1)).valid).toBe(false);
    expect(parseComponent(makeTable(1, 101)).valid).toBe(false);
  });
  it('applies the same cell budget to structured data', () => {
    const columns = Array.from({ length: 20 }, (_, i) => `C${i}`);
    const make = (rows: number) => `type: status-matrix\nversion: 1\ndata:\n  columns: [${columns.join(', ')}]\n  rows:\n` +
      Array.from({ length: rows }, (_, i) => `    - label: R${i}\n`).join('');
    expect(parseComponent(make(50)).valid).toBe(true);
    expect(parseComponent(make(51)).valid).toBe(false);
  });
  it('works for a different domain without imposing project-specific labels', () => {
    const source = `type: status-matrix
version: 1
data:
  columns:
    Kitchen: [Preparation, Service]
    Dining: [Welcome]
  rows:
    - label: Lunch
      detail: Weekdays
      cells:
        Preparation: Ready
        Service: { progress: "50%" }
        Welcome: Open
`;
    const result = parseComponent(source);
    expect(result.valid && result.value.matrix.columns).toEqual(['Preparation', 'Service', 'Welcome']);
    expect(result.valid && result.value.matrix.rows[0].detail).toBe('Weekdays');
    expect(result.valid && result.value.matrix.rows[0].progress?.[1]?.fraction).toBe(0.5);
  });
  it('escapes markup in valid labels and statuses', () => {
    const source = `type: status-matrix
version: 1
data:
  columns: [Place]
  rows:
    - label: "<img src=x onerror=alert(1)>"
      cells: { Place: "<script>alert(1)</script>" }
`;
    const doc = new JSDOM(sanitizeRenderedHtml(createMarkdownRenderer().render('~~~component\n' + source + '~~~'))).window.document;
    expect(doc.querySelector('table')).not.toBeNull();
    expect(doc.querySelector('img, script')).toBeNull();
    expect(doc.body.textContent).toContain('<script>alert(1)</script>');
  });
  it('keeps structured plain percentage strings as text for compatibility', () => {
    const result = parseComponent(structured.replace('Scope: Complete', 'Scope: "50%"').replace('statuses: { Pending: neutral, Complete: success, Active: info }', 'statuses: { Pending: neutral, "50%": success, Active: info }'));
    expect(result.valid && result.value.matrix.rows[0].cells[0]).toBe('50%');
  });
  it.each([
    table.replace('Definition {2}', 'Definition {0}'),
    table.replace('| Scope | Sign-off |', '| Scope {2} | Sign-off |'),
    table.replace('| Alpha | Complete |', '| Alpha | Complete {2} |'),
    table.replace('Definition {2}', 'Definition {3}'),
    table.replace('| Alpha | Complete | Active :: 1/2 | Pending |', '| Alpha | Complete | Pending |'),
    table.replace('Active :: 1/2', 'Active :: 2/1'),
    table.replace('Active :: 1/2', 'Active :: 1/0'),
    table.replace('Active :: 1/2', 'Active :: 101%'),
    table.replace('Complete | Active', 'Unknown | Active'),
    table.replace('  markdown-table: |', '  columns: [A]\n  markdown-table: |'),
    structured.replace('Scope, Sign-off', 'Scope, Scope'),
    structured.replace('Complete: success', 'Complete: [success]'),
    structured.replace('progress: "1/2"', 'progress: "-1%"'),
  ])('rejects invalid data and width or progress: %#', source => expect(parseComponent(source).valid).toBe(false));
});
