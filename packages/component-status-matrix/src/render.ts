import type { Matrix } from './statusMatrix';
export type MatrixOptions = { showLegend: boolean };

function escape(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
export function renderMatrix(model: Matrix, options: MatrixOptions): string {
  const { columns, rows, groups, statuses, rowHeader } = model;
  const hasNotes = rows.some(row => row.note);
  const groupColumns = groups ? `<colgroup span="1"></colgroup>${groups.map(group => `<colgroup span="${group.span}"></colgroup>`).join('')}${hasNotes ? '<colgroup span="1"></colgroup>' : ''}` : '';
  const head = groups
    ? `<tr><th scope="col" rowspan="2">${escape(rowHeader ?? 'Item')}</th>${groups.map(group => `<th scope="colgroup" colspan="${group.span}">${escape(group.label)}</th>`).join('')}${hasNotes ? '<th class="md-matrix-note" scope="col" rowspan="2">Note</th>' : ''}</tr><tr>${columns.map(column => `<th scope="col">${escape(column)}</th>`).join('')}</tr>`
    : `<tr><th scope="col">${escape(rowHeader ?? 'Item')}</th>${columns.map(column => `<th scope="col">${escape(column)}</th>`).join('')}${hasNotes ? '<th class="md-matrix-note" scope="col">Note</th>' : ''}</tr>`;
  const body = rows.map(row => `<tr><th scope="row">${escape(row.label)}${row.indicator ? `<span class="md-matrix-detail md-matrix-indicator md-matrix-${row.indicator.style}">${escape(row.indicator.label)}</span>` : ''}${row.detail ? `<span class="md-matrix-detail">${escape(row.detail)}</span>` : ''}</th>${row.cells.map((cell, index) => {
    const progress = row.progress?.[index];
    const color = cell && statuses?.[cell] ? ` md-matrix-${statuses[cell]}` : '';
    const label = cell === null && !progress ? '<span aria-label="Unknown">—</span>' : cell === null ? '' : `<span class="md-matrix-status">${escape(cell)}</span>`;
    if (!progress) return `<td class="md-matrix-cell${color}">${label}</td>`;
    const percentage = Math.round(progress.fraction * 10000) / 100;
    return `<td class="md-matrix-cell${color}">${label}<span class="md-matrix-progress" role="progressbar" aria-label="${escape(row.label + ', ' + columns[index] + ': ' + progress.text)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}"><span class="md-matrix-progress-fill" style="width: ${percentage}%"></span></span><span class="md-matrix-progress-text">${escape(progress.text)}</span></td>`;
  }).join('')}${hasNotes ? `<td class="md-matrix-note">${row.note ? escape(row.note) : ''}</td>` : ''}</tr>`).join('');
  const legend = options.showLegend && statuses ? `<p class="md-matrix-legend">${Object.entries(statuses).map(([label, style]) => `<span class="md-matrix-${style}">${escape(label)}</span>`).join('')}</p>` : '';
  return `<table class="md-status-matrix" data-table-style="plain" data-component-fit="required">${groupColumns}<thead>${head}</thead><tbody>${body}</tbody></table>${legend}\n`;
}
