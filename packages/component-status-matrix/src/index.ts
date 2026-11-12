import type { Document as YamlDocument } from 'yaml';
import { parseMatrix, type Matrix } from './statusMatrix';
import { renderMatrix } from './render';
import { formatMatrixTables } from './format';
import { prepareMatrixForPptx } from './pptx';

export type MatrixComponentValue = { matrix: Matrix; showLegend: boolean };
export const statusMatrixComponent = {
  type: 'status-matrix',
  version: 1,
  stylesheet: '@mfo/component-status-matrix/style.css',
  completion: {
    label: 'status-matrix', detail: 'Insert a simple status matrix.',
    documentation: 'Use a column list or grouped columns; optional cells can provide explicit progress.',
    insertText: '~~~component\ntype: status-matrix\nversion: 1\ndata:\n  columns: [Scope, Design]\n  rows:\n    - label: Example\n      cells: { Scope: Complete, Design: Pending }\n~~~',
  },
  authoringInstructions: [
    '- For a generic status matrix, use a ~~~component YAML fence with type: status-matrix, version: 1, data.columns as a list or group-to-list mapping, and data.rows with label and cells keyed by column label. Optional data.statuses maps supplied labels to neutral, info, success, warning, or danger. Use { status: Active, progress: "1/2" } for explicit progress; do not infer it. Rows may optionally have indicator: { label: "At risk", style: warning } and note: "Next review". Optional data.rowHeader, data.indicatorHeader and data.noteHeader set the corresponding column labels. Keep matrices small enough to fit a slide.',
    '- Alternatively data.markdown-table is a YAML literal: use a group row such as | Item | Definition {2} | Build |, a leaf row | | Scope | Sign-off | Development |, a Markdown separator with four cells, and matching data rows. A cell Active :: 1/2 carries status and supplied progress; never mix this form with data.columns or data.rows.',
  ],
  parse(data: unknown, doc: YamlDocument, options: unknown): MatrixComponentValue {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('options must be a mapping.');
    const settings = options as Record<string, unknown>;
    for (const key of Object.keys(settings)) if (key !== 'showLegend') throw new Error(`options.${key} is not supported.`);
    if (settings.showLegend !== undefined && typeof settings.showLegend !== 'boolean') throw new Error('options.showLegend must be true or false.');
    return { matrix: parseMatrix(data, doc), showLegend: settings.showLegend === true };
  },
  render(value: MatrixComponentValue): string { return renderMatrix(value.matrix, { showLegend: value.showLegend }); },
  formatTables: formatMatrixTables,
  preparePptx: prepareMatrixForPptx,
  pptxWarning(value: MatrixComponentValue): string | undefined {
    return value.matrix.groups || value.matrix.statuses || value.matrix.rows.some(row => row.progress || row.indicator)
      ? 'PowerPoint simplifies matrix styling: grouped headers become column labels, progress remains as text, and visual bars and colors are not retained where present.' : undefined;
  },
  templateWarning: 'Component placement in PowerPoint templates depends on the template. Check exported slides for content and fit.',
};
