import { isMap, isScalar, type Document } from 'yaml';

const MAX_COLUMNS = 64;
const MAX_ROWS = 100;
const MAX_CELLS = 1000;

export type MatrixGroup = { label: string; span: number };
export type MatrixProgress = { text: string; fraction: number };
export type MatrixCell = { status: string | null; progress?: MatrixProgress };
export type Matrix = { columns: string[]; groups?: MatrixGroup[]; rows: { label: string; detail?: string; indicator?: { label: string; style: string }; note?: string; cells: (string | null)[]; progress?: (MatrixProgress | undefined)[] }[]; statuses?: Record<string, string>; rowHeader?: string };
export class MatrixError extends Error { constructor(message: string, readonly fragment?: string) { super(message); } }
function fail(message: string, fragment?: string): never { throw new MatrixError(message, fragment); }
function mapping(value: unknown, path: string, keys?: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be a mapping.`);
  const result = value as Record<string, unknown>;
  if (keys) for (const key of Object.keys(result)) if (!keys.includes(key)) fail(`${path}.${key} is not supported.`);
  return result;
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) fail(`${path} must be a non-empty text value of at most 160 characters; quote values if necessary.`);
  return value;
}
function parseProgress(value: unknown, path: string): MatrixProgress {
  const raw = text(value, path).trim();
  const percent = /^(\d+(?:\.\d+)?)%$/u.exec(raw);
  const ratio = /^(\d+)\/(\d+)$/u.exec(raw);
  let fraction: number;
  if (percent) fraction = Number(percent[1]) / 100;
  else if (ratio && Number(ratio[2]) > 0) fraction = Number(ratio[1]) / Number(ratio[2]);
  else fail(`${path} must be a percentage or fraction such as "50%" or "1/2".`, raw);
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) fail(`${path} must be between 0% and 100%.`, raw);
  return { text: raw, fraction };
}
function parseCell(value: unknown, path: string, table = false): MatrixCell {
  if (value === undefined || value === null || (table && value === '')) return { status: null };
  if (table && typeof value === 'string') {
    const delimiter = value.lastIndexOf(' :: ');
    if (delimiter >= 0) return { status: text(value.slice(0, delimiter).trim(), path), progress: parseProgress(value.slice(delimiter + 4).trim(), path) };
    if (/^(?:[+-]?\d+(?:\.\d+)?%|[+-]?\d+\/[+-]?\d+)$/u.test(value)) return { status: null, progress: parseProgress(value, path) };
  }
  if (typeof value === 'string') return { status: text(value, path) };
  const cell = mapping(value, path, ['status', 'progress']);
  const status = cell.status === undefined || cell.status === null ? null : text(cell.status, `${path}.status`);
  const progress = cell.progress === undefined ? undefined : parseProgress(cell.progress, `${path}.progress`);
  if (status === null && !progress) fail(`${path} needs a status or progress.`);
  return { status, ...(progress ? { progress } : {}) };
}

/** Split raw Markdown table cells without padding or dropping escaped pipes. */
export function splitMatrixRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) fail('Each matrix table row must start and end with |.');
  const cells: string[] = []; let current = ''; let escaped = false;
  for (const character of trimmed.slice(1, -1)) {
    if (escaped) { current += '\\' + character; escaped = false; }
    else if (character === '\\') escaped = true;
    else if (character === '|') { cells.push(current.trim()); current = ''; }
    else current += character;
  }
  if (escaped) current += '\\';
  cells.push(current.trim());
  return cells;
}
function unescapeCell(value: string): string { return value.replace(/\\([|{}\\])/gu, '$1'); }
function rejectUnexpectedSpan(value: string): void {
  if (/(?<!\\)\{\d+\}$/u.test(value)) fail('Group spans are only supported in the first header row; escape literal braces.');
}
export function parseMatrixTable(source: string): { rowHeader: string; groups?: MatrixGroup[]; columns: string[]; rows: { label: string; cells: MatrixCell[] }[]; rawRows: string[][]; grouped: boolean } {
  const lines = source.replace(/\r\n/gu, '\n').trim().split('\n');
  if (lines.length < 3) fail('The matrix table needs headers, a separator and at least one row.');
  const rawRows = lines.map(splitMatrixRow);
  const separator = (row: string[]) => row.every(cell => /^:?-{3,}:?$/u.test(cell));
  const grouped = !separator(rawRows[1]) && rawRows.length >= 4 && separator(rawRows[2]);
  const separatorIndex = grouped ? 2 : 1;
  if (!separator(rawRows[separatorIndex])) fail('The matrix table needs a Markdown separator row.');
  const leaf = rawRows[grouped ? 1 : 0];
  const width = leaf.length;
  if (width < 2 || width > MAX_COLUMNS + 1) fail('The matrix table needs 1–64 columns.');
  if (rawRows[separatorIndex].length !== width) fail('The separator width must match the leaf headers.');
  const columns = leaf.slice(1).map((value, i) => { rejectUnexpectedSpan(value); return text(unescapeCell(value), `Column ${i + 1}`); });
  if (new Set(columns).size !== columns.length) fail('Column labels must be unique.');
  let groups: MatrixGroup[] | undefined;
  let rowHeader: string;
  if (grouped) {
    if (leaf[0] !== '') fail('The first leaf-header cell must be empty for grouped tables.');
    rowHeader = text(unescapeCell(rawRows[0][0]), 'Row header');
    groups = rawRows[0].slice(1).map(value => {
      const span = /(?<!\\)\s+\{(\d+)\}$/u.exec(value);
      const label = unescapeCell(span ? value.slice(0, span.index).trim() : value);
      if (!span && /(?<!\\)\{[^{}]*\}$/u.test(value)) fail('Use a positive integer group span such as {2}; escape literal braces.');
      const count = span ? Number(span[1]) : 1;
      if (!Number.isSafeInteger(count) || count < 1 || count > MAX_COLUMNS) fail('A group span must be between 1 and 64.');
      return { label: text(label, 'Group label'), span: count };
    });
    if (groups.reduce((sum, group) => sum + group.span, 0) !== columns.length) fail('Group spans must match the number of leaf columns.');
  } else rowHeader = text(unescapeCell(leaf[0]), 'Row header');
  const body = rawRows.slice(separatorIndex + 1);
  if (!body.length || body.length > MAX_ROWS) fail('The matrix table needs 1–100 rows.');
  if (body.length * columns.length > MAX_CELLS) fail('The matrix may contain at most 1,000 data cells.');
  const rows = body.map((row, index) => {
    if (row.length !== width) fail(`Matrix table row ${index + 1} has ${row.length} cells; expected ${width}.`);
    row.forEach(rejectUnexpectedSpan);
    return { label: text(unescapeCell(row[0]), `Row ${index + 1}`), cells: row.slice(1).map((cell, column) => parseCell(unescapeCell(cell), `Row ${index + 1}, column ${column + 1}`, true)) };
  });
  return { rowHeader, groups, columns, rows, rawRows, grouped };
}
function orderedGroupKeys(doc: Document): string[] {
  const node = doc.getIn(['data', 'columns'], true);
  return isMap(node) ? node.items.map(pair => isScalar(pair.key) ? String(pair.key.value) : '') : [];
}
export function parseMatrix(value: unknown, doc: Document): Matrix {
  const data = mapping(value, 'data', ['columns', 'rows', 'markdown-table', 'statuses']);
  const hasTable = Object.hasOwn(data, 'markdown-table');
  if (hasTable && (Object.hasOwn(data, 'columns') || Object.hasOwn(data, 'rows'))) fail('Choose either markdown-table or columns and rows, not both.');
  let columns: string[], groups: MatrixGroup[] | undefined, rowHeader: string | undefined;
  let parsedRows: { label: string; detail?: string; indicator?: { label: string; style: string }; note?: string; cells: MatrixCell[] }[];
  if (hasTable) {
    if (typeof data['markdown-table'] !== 'string') fail('data.markdown-table must be a YAML literal table.');
    const table = parseMatrixTable(data['markdown-table']);
    ({ columns, groups, rowHeader } = table); parsedRows = table.rows;
  } else {
    if (Array.isArray(data.columns)) columns = data.columns.map((column, index) => text(column, `data.columns[${index + 1}]`));
    else {
      const tree = mapping(data.columns, 'data.columns');
      const ordered = orderedGroupKeys(doc);
      groups = ordered.map(label => {
        const children = tree[label];
        if (!Array.isArray(children) || !children.length) fail(`Group ${label} needs a non-empty list of columns.`);
        text(label, 'Group label');
        return { label, span: children.length };
      });
      columns = ordered.flatMap(label => (tree[label] as unknown[]).map(child => text(child, `Group ${label} column`)));
    }
    if (!columns.length || columns.length > MAX_COLUMNS) fail('data.columns must contain 1–64 column labels.');
    if (new Set(columns).size !== columns.length) fail('Column labels must be unique.');
    if (!Array.isArray(data.rows) || !data.rows.length || data.rows.length > MAX_ROWS) fail('data.rows must contain 1–100 rows.');
    if (data.rows.length * columns.length > MAX_CELLS) fail('The matrix may contain at most 1,000 data cells.');
    parsedRows = data.rows.map((entry, index) => {
      const row = mapping(entry, `data.rows[${index + 1}]`, ['label', 'detail', 'indicator', 'note', 'cells']);
      const label = text(row.label, `data.rows[${index + 1}].label`);
      const detail = row.detail === undefined ? undefined : text(row.detail, `data.rows[${index + 1}].detail`);
      const note = row.note === undefined ? undefined : text(row.note, `data.rows[${index + 1}].note`);
      let indicator: { label: string; style: string } | undefined;
      if (row.indicator !== undefined) {
        const item = mapping(row.indicator, `data.rows[${index + 1}].indicator`, ['label', 'style']);
        const label = text(item.label, `data.rows[${index + 1}].indicator.label`);
        if (typeof item.style !== 'string' || !['neutral', 'info', 'success', 'warning', 'danger'].includes(item.style)) fail('A row indicator needs an approved style: neutral, info, success, warning or danger.');
        indicator = { label, style: item.style };
      }
      const cells = row.cells === undefined ? {} : mapping(row.cells, `data.rows[${index + 1}].cells`, columns);
      return { label, ...(detail ? { detail } : {}), ...(indicator ? { indicator } : {}), ...(note ? { note } : {}), cells: columns.map(column => parseCell(Object.hasOwn(cells, column) ? cells[column] : null, `Cell ${label} / ${column}`)) };
    });
  }
  let statuses: Record<string, string> | undefined;
  if (data.statuses !== undefined) {
    const supplied = mapping(data.statuses, 'data.statuses');
    statuses = Object.create(null) as Record<string, string>;
    for (const [label, value] of Object.entries(supplied)) {
      text(label, 'Status label');
      if (typeof value !== 'string' || !['neutral', 'info', 'success', 'warning', 'danger'].includes(value)) fail(`Status ${label} needs an approved style: neutral, info, success, warning or danger.`);
      statuses[label] = value;
    }
    for (const row of parsedRows) for (const cell of row.cells) if (cell.status && !Object.hasOwn(statuses, cell.status)) fail(`Unknown status ${cell.status}; add it to data.statuses.`);
  }
  const rows = parsedRows.map(row => ({ label: row.label, ...(row.detail ? { detail: row.detail } : {}), ...(row.indicator ? { indicator: row.indicator } : {}), ...(row.note ? { note: row.note } : {}), cells: row.cells.map(cell => cell.status), ...(row.cells.some(cell => cell.progress) ? { progress: row.cells.map(cell => cell.progress) } : {}) }));
  return { columns, ...(groups ? { groups } : {}), rows, ...(statuses ? { statuses } : {}), ...(rowHeader && rowHeader !== 'Item' ? { rowHeader } : {}) };
}
