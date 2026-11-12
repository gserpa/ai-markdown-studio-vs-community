import type { Matrix } from './statusMatrix';
export type MatrixOptions = { showLegend: boolean };

function escape(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
export function renderMatrix(model: Matrix, options: MatrixOptions): string {
  const { columns, rows, groups, statuses, rowHeader } = model;
  const hasNotes = rows.some(row => row.note);
  const stageTones = groups?.flatMap((group, index) => Array<number>(group.span).fill(index % 5));
  const stageAttr = (index: number) => ' data-matrix-stage="' + (stageTones?.[index] ?? 0) + '"';
  const leafHeaders = columns.map((column, index) =>
    '<th scope="col"' + stageAttr(index) + '><span class="md-matrix-stage-label"' +
    (index === 0 ? ' data-matrix-first-stage' : '') + '>' + escape(column) + '</span></th>').join('');
  const groupColumns = groups ? '<colgroup span="1"></colgroup>' + groups.map(group => '<colgroup span="' + group.span + '"></colgroup>').join('') + (hasNotes ? '<colgroup span="1"></colgroup>' : '') : '';
  const noteHeader = hasNotes ? '<th class="md-matrix-note" scope="col"' + (groups ? ' rowspan="2"' : '') + '>Note</th>' : '';
  const groupHeaders = groups?.map((group, index) =>
    '<th scope="colgroup" colspan="' + group.span + '" data-matrix-stage="' + (index % 5) +
    '"><span class="md-matrix-group-label">' + escape(group.label) + '</span></th>').join('');
  const head = '<tr><th scope="col"' + (groups ? ' rowspan="2"' : '') + '>' + escape(rowHeader ?? 'Item') +
    '</th>' + (groupHeaders ?? leafHeaders) + noteHeader + '</tr>' + (groups ? '<tr>' + leafHeaders + '</tr>' : '');
  const body = rows.map(row => '<tr><th scope="row">' + escape(row.label) +
    (row.indicator ? '<span class="md-matrix-detail md-matrix-indicator md-matrix-' + row.indicator.style + '">' + escape(row.indicator.label) + '</span>' : '') +
    (row.detail ? '<span class="md-matrix-detail">' + escape(row.detail) + '</span>' : '') + '</th>' +
    row.cells.map((cell, index) => {
      const progress = row.progress?.[index];
      const color = cell && statuses?.[cell] ? ' md-matrix-' + statuses[cell] : '';
      const label = cell === null && !progress ? '<span aria-label="Unknown">—</span>' : cell === null ? '' : '<span class="md-matrix-status">' + escape(cell) + '</span>';
      let meter = '';
      if (progress) {
        const percentage = Math.round(progress.fraction * 10000) / 100;
        meter = '<span class="md-matrix-progress" role="progressbar" aria-label="' + escape(row.label + ', ' + columns[index] + ': ' + progress.text) +
          '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percentage + '"><span class="md-matrix-progress-fill" style="width: ' + percentage +
          '%"></span></span><span class="md-matrix-progress-text">' + escape(progress.text) + '</span>';
      }
      return '<td class="md-matrix-cell' + color + '"' + stageAttr(index) + '><span class="md-matrix-tile">' + label + meter + '</span></td>';
    }).join('') + (hasNotes ? '<td class="md-matrix-note">' + (row.note ? escape(row.note) : '') + '</td>' : '') + '</tr>').join('');
  const legend = options.showLegend && statuses ? '<p class="md-matrix-legend">' + Object.entries(statuses).map(([label, style]) => '<span class="md-matrix-' + style + '">' + escape(label) + '</span>').join('') + '</p>' : '';
  return '<table class="md-status-matrix" data-table-style="plain" data-component-fit="required">' + groupColumns + '<thead>' + head + '</thead><tbody>' + body + '</tbody></table>' + legend + '\n';
}
