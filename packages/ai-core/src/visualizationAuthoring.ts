import { createMarkdownRenderer, stripMarkdownFrontMatter } from '@mfo/core';
import { parseVisualizationBlock, VISUALIZATION_LIMITS, VEGA_LITE_MARKS, VEGA_LITE_COMPOSITIONS, type VisualizationBlock, type VisualizationKind } from '@mfo/core/visualizations';

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
    '- Supported chart marks: ' + VEGA_LITE_MARKS.join(', ') + '. Use the native mark and encoding properties for each chart form. Charts are validated against the installed Vega-Lite schema, not a short example allowlist.',
    '- Supply data.values or inherit inline data from a parent composition. Use scalar fields for ordinary charts, or valid inline GeoJSON features/geometries for geoshape. Encodings follow native Vega-Lite: secondary positions may omit type, rule can have one positional channel, arc uses theta, text uses text, trail can use order/detail/size, and constant encodings use value. Field names must resolve to supplied data; safe dotted paths may reference nested GeoJSON properties.',
    '- Supported composition forms: ' + VEGA_LITE_COMPOSITIONS.join(', ') + '. Use parent data and shared layer encodings, spec for facet/repeat, and field: {"repeat":"column"} for repeated fields. Compositions are bounded to ' + VISUALIZATION_LIMITS.maxViews + ' rendered views after facet/repeat expansion.',
    '- Grouped bars use xOffset or yOffset with a categorical field. A categorical axis can sort by "-y" or "-x". Histograms use bin: true or bin: {"maxbins":20} on a quantitative axis and aggregate: "count" on the other. Native field aggregates and sorting objects are supported; count can omit field.',
    '- Native static mark properties are supported, including text/font options, stroke styles, image width/height, and composite uncertainty options. Do not use expression objects for mark properties. For geoshape use inline GeoJSON and projection; for image use supplied HTTPS or PNG/JPEG/GIF/WebP data URLs. Remote chart images follow allowRemoteResources; inline raster images work offline.',
    '- Optional chart properties: title, description, width ("container" or 40-4096), height (40-4096), autosize. Use native encoding channels. Use explicit tooltip fields for concise values. Omit fixed dimensions to use responsive defaults.',
    '- Do not emit data.url, external datasets, expressions, transforms, params, filters, selectors, sliders, config, hyperlink encodings, SVG/HTML image data, or executable properties. Remote chart data stays disabled; only approved image marks may load remote images.',
    '- Metric JSON requires title (up to 200 characters) and a finite numeric value. Optional properties: unit, subtitle, and trend. Trend requires a finite numeric value and direction: up for positive values, down for negative values, flat for zero; optional unit and period describe the change. Directions have neutral styling; do not assume a decrease is favorable or unfavorable.',
    `- Use strict JSON without comments or trailing commas. Each fence is limited to ${VISUALIZATION_LIMITS.maxSourceBytes / 1024} KiB UTF-8, ${VISUALIZATION_LIMITS.maxDepth} levels of nesting, and ${VISUALIZATION_LIMITS.maxNodes} JSON values. Charts allow 1-${VISUALIZATION_LIMITS.maxDataRows} rows and 1-${VISUALIZATION_LIMITS.maxFieldsPerRow} scalar fields per row; strings are limited to ${VISUALIZATION_LIMITS.maxStringLength} characters, except inline raster images bounded by the total source limit. Unknown properties and prototype-related names are rejected.`,
    '- Compose dashboards with ordinary headings, paragraphs, charts, and separate metric fences. Native Vega-Lite composition provides grids within a chart; there is no separate Markdown dashboard directive. On presentations, prefer a default slide with one chart and a short takeaway; split dense dashboards across slides. Keep chart fences in the slide body rather than an image-only media slot.',
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
