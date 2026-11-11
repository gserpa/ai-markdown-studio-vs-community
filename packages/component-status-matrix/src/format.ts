import MarkdownIt from 'markdown-it';
import { isScalar, parseDocument } from 'yaml';
import { parseMatrixTable } from './statusMatrix';

/** Format only validated literal tables inside top-level component fences. */
export function formatMatrixTables(source: string, validate: (source: string) => boolean): string {
  if (!source.includes('markdown-table')) return source;
  const lines = source.split('\n');
  const starts = [0];
  for (let index = 0; index < source.length; index++) if (source[index] === '\n') starts.push(index + 1);
  const replacements: { start: number; end: number; value: string }[] = [];
  const tokens = new MarkdownIt().parse(source, {});
  for (const token of tokens) {
    if (token.type !== 'fence' || token.level !== 0 || !token.map || token.info.trim().toLowerCase() !== 'component') continue;
    if (!/^(?:`{3,}|~{3,})/u.test(lines[token.map[0]])) continue;
    if (!validate(token.content)) continue;
    const node = parseDocument(token.content).getIn(['data', 'markdown-table'], true);
    if (!isScalar(node) || node.type !== 'BLOCK_LITERAL' || typeof node.value !== 'string' || !node.range) continue;
    const table = parseMatrixTable(node.value);
    const bodyStart = token.content.indexOf('\n', node.range[0]) + 1;
    if (!bodyStart) continue;
    const toSource = (offset: number) => {
      const parts = token.content.slice(0, offset).split('\n');
      return (starts[token.map![0] + parts.length] ?? source.length) + parts[parts.length - 1].length;
    };
    const start = toSource(bodyStart), end = toSource(node.range[1]);
    const original = source.slice(start, end);
    const bodyLines = original.split(/\r?\n/u);
    const first = bodyLines.findIndex(line => line.trim());
    let last = bodyLines.length - 1;
    while (last >= 0 && !bodyLines[last].trim()) last--;
    if (first < 0) continue;
    const indent = /^\s*/u.exec(bodyLines[first])?.[0] ?? '';
    const formatted = formatRows(table.rawRows, table.grouped, table.groups?.map(group => group.span));
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    const value = [...bodyLines.slice(0, first), ...formatted.map(line => indent + line), ...bodyLines.slice(last + 1)].join(newline);
    replacements.push({ start, end, value });
  }
  let output = source;
  for (const item of replacements.reverse()) output = output.slice(0, item.start) + item.value + output.slice(item.end);
  return output;
}

function formatRows(rows: string[][], grouped: boolean, spans?: number[]): string[] {
  const leafIndex = grouped ? 1 : 0;
  const separatorIndex = grouped ? 2 : 1;
  const width = rows[leafIndex].length;
  const widths = Array.from({ length: width }, (_, index) => Math.max(3, ...rows.filter((_, row) => row !== separatorIndex && (!grouped || row !== 0)).map(row => [...(row[index] ?? '')].length)));
  const render = (row: string[], sizes: number[]) => '| ' + row.map((cell, index) => cell + ' '.repeat(Math.max(0, sizes[index] - [...cell].length))).join(' | ') + ' |';
  const output: string[] = [];
  if (grouped) {
    let column = 1;
    const sizes = [widths[0]];
    for (const span of spans ?? []) { sizes.push(widths.slice(column, column + span).reduce((sum, n) => sum + n, 0) + 3 * (span - 1)); column += span; }
    output.push(render(rows[0], sizes));
  }
  output.push(render(rows[leafIndex], widths));
  output.push(render(rows[separatorIndex].map((cell, index) => {
    const left = cell.startsWith(':'), right = cell.endsWith(':');
    return (left ? ':' : '') + '-'.repeat(Math.max(3, widths[index] - Number(left) - Number(right))) + (right ? ':' : '');
  }), widths));
  for (const row of rows.slice(separatorIndex + 1)) output.push(render(row, widths));
  return output;
}
