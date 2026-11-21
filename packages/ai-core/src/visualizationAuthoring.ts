import { createMarkdownRenderer, stripMarkdownFrontMatter } from '@mfo/core';
import { parseVisualizationBlock, VISUALIZATION_LIMITS, VEGA_LITE_MARKS, VEGA_LITE_COMPOSITIONS, type VisualizationBlock, type VisualizationKind } from '@mfo/core/visualizations';

/** Native examples shared by prompts and the portable agent references. */
export const VISUALIZATION_AUTHORING_EXAMPLES: readonly VisualizationBlock[] = [
  {
    kind: 'vega-lite',
    spec: {
      title: 'Illustrative revenue vs target',
      data: { values: [{ quarter: 'Q1', revenue: 100, target: 110 }, { quarter: 'Q2', revenue: 120, target: 110 }] },
      encoding: {
        x: { field: 'quarter', type: 'ordinal' },
        y: { field: 'revenue', type: 'quantitative', title: 'Revenue (example units)' },
        tooltip: [{ field: 'quarter', type: 'ordinal' }, { field: 'revenue', type: 'quantitative' }],
      },
      layer: [
        { mark: 'bar' },
        { mark: { type: 'tick', color: '#c45300', thickness: 3 }, encoding: {
          y: { field: 'target', type: 'quantitative' },
          tooltip: [{ field: 'quarter', type: 'ordinal' }, { field: 'target', type: 'quantitative' }],
        } },
      ],
    },
  },
  { kind: 'metric', spec: { title: 'Illustrative Q2 revenue', value: 120, unit: 'example units', subtitle: 'Q2', trend: { value: 20, unit: 'example units', period: 'since Q1', direction: 'up' } } },
];

export function createVisualizationAuthoringInstructions({ reference = false }: { reference?: boolean } = {}): string {
  const shared = [
    'Declarative visualization syntax (when selected):',
    '- Preserve supplied values, labels, units, and dates; do not invent or silently fill missing data. Put native Vega-Lite JSON in a vega-lite fence, or metric JSON in a metric fence.',
    '- Use inline data.values (or inherit parent data), strict JSON, and valid Vega-Lite marks and encodings. Do not emit data.url, external datasets, expressions, transforms, params, filters, selectors, config, hyperlink encodings, SVG/HTML image data, or executable properties. Remote chart data stays disabled; HTTPS chart image marks obey the workspace policy.',
    `- Keep charts within ${VISUALIZATION_LIMITS.maxDataRows} data rows and ${VISUALIZATION_LIMITS.maxViews} composed views. Use xOffset or yOffset for grouped bars, bin and count for histograms, and explicit labels, units, and tooltips.`,
    '- Metric JSON requires title and a finite numeric value. Optional: unit, subtitle, trend {value, direction, unit?, period?}. Direction is up for positive, down for negative, flat for zero; add trend only when supported by the data.',
    '- Charts preview and export to interactive HTML. Do not promise native chart conversion in DOCX or PPTX; use a table or text when the destination cannot carry the visualization.',
  ];
  const examples = [
    '',
    'Illustrative syntax only; use the brief’s own data and chart choice:',
    ...VISUALIZATION_AUTHORING_EXAMPLES.flatMap(block => [
      '', '```' + block.kind, JSON.stringify(block.spec, null, reference ? 2 : undefined), '```',
    ]),
  ];
  if (!reference) return [...shared, ...examples].join('\n');

  return [
    ...shared,
    '- Do not use chart fences, Chart.js datasets, HTML widgets, JavaScript, or new slide directives.',
    '- Supported chart marks: ' + VEGA_LITE_MARKS.join(', ') + '. Use the native mark and encoding properties for each chart form. Charts are validated against the installed Vega-Lite schema, not a short example allowlist.',
    '- Supply data.values or inherit inline data from a parent composition. Use scalar fields for ordinary charts, or valid inline GeoJSON features/geometries for geoshape. Encodings follow native Vega-Lite: secondary positions may omit type, rule can have one positional channel, arc uses theta, text uses text, trail can use order/detail/size, and constant encodings use value. Field names must resolve to supplied data; safe dotted paths may reference nested GeoJSON properties.',
    '- Supported composition forms: ' + VEGA_LITE_COMPOSITIONS.join(', ') + '. Use parent data and shared layer encodings, spec for facet/repeat, and field: {"repeat":"column"} for repeated fields. Compositions are bounded to ' + VISUALIZATION_LIMITS.maxViews + ' rendered views after facet/repeat expansion.',
    '- Grouped bars use xOffset or yOffset with a categorical field. A categorical axis can sort by "-y" or "-x". Histograms use bin: true or bin: {"maxbins":20} on a quantitative axis and aggregate: "count" on the other. Native field aggregates and sorting objects are supported; count can omit field.',
    '- Native static mark properties are supported, including text/font options, stroke styles, image width/height, and composite uncertainty options. Do not use expression objects for mark properties. For geoshape use inline GeoJSON and projection; for image use supplied HTTPS or PNG/JPEG/GIF/WebP data URLs. Remote chart images follow allowRemoteResources; inline raster images work offline.',
    '- Optional chart properties: title, description, width ("container" or 40-4096), height (40-4096), autosize. Use native encoding channels. Use explicit tooltip fields for concise values. Omit fixed dimensions to use responsive defaults.',
    '- On presentation content slides, omit top-level width and height for single-view and layered charts unless fixed dimensions are explicitly requested. Charts use the available content area; slide fitting scales them proportionally with text. Do not add an arbitrary fixed height.',
    '- Metric JSON requires title (up to 200 characters) and a finite numeric value. Optional properties: unit, subtitle, and trend. Trend requires a finite numeric value and direction: up for positive values, down for negative values, flat for zero; optional unit and period describe the change. Directions have neutral styling; do not assume a decrease is favorable or unfavorable.',
    `- Use strict JSON without comments or trailing commas. Each fence is limited to ${VISUALIZATION_LIMITS.maxSourceBytes / 1024} KiB UTF-8, ${VISUALIZATION_LIMITS.maxDepth} levels of nesting, and ${VISUALIZATION_LIMITS.maxNodes} JSON values. Charts allow 1-${VISUALIZATION_LIMITS.maxDataRows} rows and 1-${VISUALIZATION_LIMITS.maxFieldsPerRow} scalar fields per row; strings are limited to ${VISUALIZATION_LIMITS.maxStringLength} characters, except inline raster images bounded by the total source limit. Unknown properties and prototype-related names are rejected.`,
    '- Compose dashboards with ordinary headings, paragraphs, charts, and separate metric fences. Native Vega-Lite composition provides grids within a chart; there is no separate Markdown dashboard directive. On presentations, prefer a content slide with one chart and a short takeaway; split dense dashboards across slides. Keep chart fences in the slide body rather than an image-only media slot.',
    '- Markdown viewers without Studio visualization support show the JSON source.',
    ...examples,
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
