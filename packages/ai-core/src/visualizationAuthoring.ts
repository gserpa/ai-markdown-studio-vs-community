import { createMarkdownRenderer, stripMarkdownFrontMatter } from '@mfo/core';
import { parseVisualizationBlock, VISUALIZATION_LIMITS, type VisualizationBlock, type VisualizationKind } from '@mfo/core/visualizations';

/** Native examples shared by prompts and the portable agent references. */
export const VISUALIZATION_AUTHORING_EXAMPLES: readonly VisualizationBlock[] = [
  {
    kind: 'vega-lite',
    spec: {
      title: 'Illustrative quarterly revenue',
      mark: { type: 'line', point: true },
      data: { values: [{ quarter: 'Q1', revenue: 100 }, { quarter: 'Q2', revenue: 120 }] },
      encoding: {
        x: { field: 'quarter', type: 'ordinal' },
        y: { field: 'revenue', type: 'quantitative', title: 'Revenue (example units)' },
        tooltip: [{ field: 'quarter', type: 'ordinal' }, { field: 'revenue', type: 'quantitative' }],
      },
    },
  },
  { kind: 'metric', spec: { title: 'Illustrative Q2 revenue', value: 120, unit: 'example units', subtitle: 'Q2', trend: { value: 20, unit: 'example units', period: 'since Q1', direction: 'up' } } },
];

export function createVisualizationAuthoringInstructions(): string {
  return [
    'Declarative visualizations (optional):',
    '- Use visualization fences when the user requests a chart, metric, or dashboard and supplies the data. Preserve the supplied values, labels, units, and dates; do not invent or silently fill missing data.',
    '- Use a vega-lite fence containing native Vega-Lite JSON, or a metric fence containing metric JSON. Do not use chart fences, Chart.js datasets, HTML widgets, JavaScript, or new slide directives.',
    '- Supported chart marks are line and bar only. Use line for ordered trends and bar for category comparisons. A line mark may use {"type":"line","point":true}; for bar charts use mark: "bar" and omit point.',
    '- Every chart requires data.values with flat inline objects and encoding.x and encoding.y with field and type. Fields must name actual data keys; types are quantitative, ordinal, nominal, or temporal. Data keys must not contain dots, brackets, or backslashes.',
    '- Optional chart properties: title, description, width ("container" or 40-4096), height (40-4096), autosize. Optional encoding channels: color and tooltip. Use explicit tooltip fields for concise values. Omit fixed dimensions to use responsive defaults.',
    '- Do not emit data.url, external datasets, expressions, transforms, params, filters, selectors, sliders, config, layer, concat, repeat, facet, image marks, or arbitrary unsupported properties. Remote chart data is disabled even when remote document images are allowed.',
    '- Metric JSON requires title (up to 200 characters) and a finite numeric value. Optional properties: unit, subtitle, and trend. Trend requires a finite numeric value and direction: up for positive values, down for negative values, flat for zero; optional unit and period describe the change. Directions have neutral styling; do not assume a decrease is favorable or unfavorable.',
    `- Use strict JSON without comments or trailing commas. Each fence is limited to ${VISUALIZATION_LIMITS.maxSourceBytes / 1024} KiB UTF-8, ${VISUALIZATION_LIMITS.maxDepth} levels of nesting, and ${VISUALIZATION_LIMITS.maxNodes} JSON values. Charts allow 1-${VISUALIZATION_LIMITS.maxDataRows} rows and 1-${VISUALIZATION_LIMITS.maxFieldsPerRow} scalar fields per row; strings are limited to ${VISUALIZATION_LIMITS.maxStringLength} characters. Unknown properties and prototype-related names are rejected.`,
    '- Compose dashboards with ordinary headings, paragraphs, charts, and separate metric fences. There is no dashboard grid syntax. On presentations, prefer a default slide with one chart and a short takeaway; split dense dashboards across slides. Keep chart fences in the slide body rather than an image-only media slot.',
    '- Interactive charts work in document/presentation previews and HTML exports. Other Markdown viewers show the JSON source. Do not promise native chart conversion in DOCX or PPTX.',
    '',
    'Examples below use illustrative data only. Replace every example value with the supplied data in the requested output:',
    ...VISUALIZATION_AUTHORING_EXAMPLES.flatMap(block => ['', '```' + block.kind, JSON.stringify(block.spec, null, 2), '```']),
  ].join('\n');
}

export function createVisualizationRepairPrompt(markdown: string, issues: readonly string[]): string {
  return [
    'Repair the visualization definitions in this Markdown file. Return the complete raw Markdown file only, without an outer code fence.',
    'Preserve its front matter, structure, intended content, and original data. Fix invalid definitions without inventing values or unsupported features.',
    createVisualizationAuthoringInstructions(),
    '',
    'Validation errors:',
    ...issues.map(issue => '- ' + issue),
    '',
    'Markdown to repair:',
    markdown,
  ].join('\n');
}

/** Validate actual Markdown fences, including nested blocks, without rendering. */
export function validateVisualizationFences(markdown: string): string[] {
  const renderer = createMarkdownRenderer();
  const issues: string[] = [];
  for (const token of renderer.parse(stripMarkdownFrontMatter(markdown), {})) {
    if (token.type !== 'fence') continue;
    const kind = token.info.trim().split(/\s+/u)[0].toLowerCase();
    if (kind !== 'vega-lite' && kind !== 'metric') continue;
    const result = parseVisualizationBlock(kind as VisualizationKind, token.content);
    if (!result.valid) issues.push(`${kind} block at body line ${(token.map?.[0] ?? 0) + 1}: ${result.error}`);
  }
  return issues;
}
