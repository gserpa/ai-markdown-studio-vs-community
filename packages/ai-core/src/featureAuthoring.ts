import { bundledComponents } from '@mfo/bundled-components';
import { createVisualizationAuthoringInstructions } from './visualizationAuthoring';

const selectionGuidance = [
  'Choose features by reader intent, even if the brief names no Markdown features.',
  'Before drafting, silently identify what each major section or slide must help the reader understand or decide. Consider the options below, then choose the simplest format that does the job. Respect requests for plain Markdown, the audience, available evidence, and the intended export.',
  'Before delivery, silently review the draft for material opportunities missed (for example, a process hidden in bullets or a trend buried in a table). Add a feature only if it improves comprehension. Remove decorative or redundant features; do not output the checklist.',
];

const promptChoices = [
  'Explain relationships with Mermaid: decisions/process → flowchart; messages → sequence; lifecycle → state; entities → ER; schedule → Gantt; milestones → timeline; two-criteria prioritization → quadrantChart; causes → Ishikawa; flows with quantities → Sankey.',
  'Show quantitative evidence with Vega-Lite: compare → bar/grouped bar; trend → line/area; correlation → scatter; distribution → histogram/boxplot/tick; two-axis intensity → heatmap; geography → geoshape. Use a metric for one key number; use a table for exact lookup.',
  'Consider combined Vega-Lite charts: actuals vs target → bar + rule; observations vs trend → line + points; uncertainty → line + band; aligned group comparisons → facet/repeat; related measures on different scales → separate aligned views, not dual axes by default.',
  'Show definitions, equations or derivations with KaTeX ($...$ inline, $$ on separate lines for display). Use emoji sparingly for tone or scanning; keep semantic labels in text and avoid emoji in formal materials unless requested.',
  'For structured material, consider status-matrix for cross-item status/progress, record-list for records with metadata, and fact-cards for a small set of supplied facts. Do not infer missing values. Prefer lists, prose, callouts or ordinary tables when clearer.',
];

const mermaidChoices = [
  ['Decisions, branching, handoffs or cause-and-effect paths', '`flowchart`; use subgraphs for ownership lanes where helpful'],
  ['Messages, API calls or interactions over time', '`sequenceDiagram` with participants and ordered events'],
  ['Lifecycle, transitions, terminal states', '`stateDiagram-v2`'],
  ['Entities, relationships and cardinality / object structure', '`erDiagram` for entities; `classDiagram` for types and behavior'],
  ['Schedule with durations and dependencies / milestone narrative', '`gantt` for schedules; `timeline` for milestones'],
  ['Priority or positioning on two named criteria', '`quadrantChart` with meaningful axes and supplied placements; if placements are unknown, use a criteria table'],
  ['Causes grouped around a problem', 'Ishikawa (`ishikawa-beta`); use a cause tree if the target renderer lacks support'],
  ['Quantities moving between stages or categories', '`sankey-beta`; use flows and amounts supported by the data'],
  ['System boundaries and dependencies', 'C4 context, architecture or block diagram; use a flowchart for portability'],
  ['Cluster ideas / organize a tree / show overlap', '`mindmap` / tree view / Venn; use nested lists or a table for portability'],
  ['Trace requirements or show branching history', '`requirementDiagram` or `gitGraph`'],
  ['Show user experience stages or work queues', '`journey` or `kanban`; do not guess experience scores or work status'],
  ['Map a value chain by evolution / choose a response by decision context', 'Wardley map / Cynefin when the brief provides the necessary classifications and the target supports the syntax'],
  ['Show precise layout or syntax', 'Packet or railroad diagram when the target renderer supports it; use a table or code sample otherwise'],
];

const vegaChoices = [
  ['Compare or rank categories', 'Sorted bar; preserve units and start magnitude bars at zero'],
  ['Compare subgroups or show contributions to totals', 'Grouped bars with `xOffset` / `yOffset` for comparison; stacked bars for composition with a meaningful total'],
  ['Show change over time', 'Line for ordered trends; area when magnitude from a meaningful baseline matters'],
  ['Explore a relationship between two measures', 'Scatter; include one row per observation and do not imply causation'],
  ['Show spread, outliers or concentration', 'Histogram (`bar` with bin and count), tick plot for individual observations, or boxplot for group summaries'],
  ['Find hotspots or patterns across two dimensions', 'Heatmap (`rect` + color); define the aggregation when several rows share a cell'],
  ['Compare parts of a meaningful whole', 'Prefer sorted or stacked bars; use `arc` pie/donut only for a few non-negative shares of one total'],
  ['Show a spatial pattern', '`geoshape` with supplied inline GeoJSON; use ranked bars when location itself does not matter'],
  ['Report a single value with context', '`metric` with unit and period; include a change only when supported'],
  ['Support exact lookup or charting without sufficient data', 'Prefer a table for known values; describe missing data rather than inventing a visual'],
];

const vegaCombinationChoices = [
  ['Actuals vs target', 'Layer bars and a rule on one scale for a shared target, ticks for per-category targets, or a target line when the target changes over time'],
  ['Trend with observed points', 'Layer line + point, or use `mark.point` when they represent the same series'],
  ['Trend or estimate with uncertainty', 'Layer line + band or points + error bars. Explain the interval and use supplied bounds or justified native summaries of supplied observations'],
  ['Call out a meaningful event or threshold', 'Layer a `rule` or concise label at the supplied position; avoid duplicate legends'],
  ['Show a rate alongside volume', 'Prefer aligned, concatenated views with the same time axis. Use a combo chart with independent axes only if units and scales are explicit and the comparison is not misleading'],
  ['Compare the same encodings across groups or fields', 'Use `facet` for group values and `repeat` for fields. Share scales when comparing absolute levels'],
  ['Show related but different views', 'Use `concat`, `hconcat`, or `vconcat`; use separate chart and metric fences when a dashboard would otherwise be dense'],
];

export function createFeatureSelectionInstructions(): string {
  return ['Feature selection:', ...[...selectionGuidance, ...promptChoices].map(line => '- ' + line)].join('\n');
}

export function createComponentAuthoringInstructions(): string {
  return ['Bundled component syntax (when selected):', ...bundledComponents.flatMap(component => component.authoringInstructions ?? [])].join('\n');
}

function intentTable(rows: readonly (readonly string[])[]): string[] {
  return ['| Reader intent | Consider |', '| --- | --- |', ...rows.map(([intent, option]) => `| ${intent} | ${option} |`)];
}

export function createFeatureAuthoringReference(): string {
  return [
    createFeatureSelectionInstructions(),
    '',
    '## Mermaid: explain structure or relationships',
    '',
    ...intentTable(mermaidChoices),
    '',
    'Use a `mermaid` fence. For flowcharts on wide slides, start with `LR`; choose other directions if they fit better. Do not force a flowchart when another diagram fits. Keep labels short and verify complex or beta types in the target preview/export; fall back to a simpler diagram or text when support is uncertain. Prefer Vega-Lite when the main task is quantitative comparison or analysis.',
    '',
    'Illustrative quadrant (positions are examples, not defaults):',
    '',
    '```mermaid',
    'quadrantChart',
    '    x-axis Low effort --> High effort',
    '    y-axis Low impact --> High impact',
    '    quadrant-1 Plan',
    '    quadrant-2 Prioritize',
    '    quadrant-3 Defer',
    '    quadrant-4 Reconsider',
    '    Example A: [0.25, 0.75]',
    '```',
    '',
    '## Vega-Lite and metrics: choose the encoding',
    '',
    ...intentTable(vegaChoices),
    '',
    '### Combined charts',
    '',
    ...intentTable(vegaCombinationChoices),
    '',
    createVisualizationAuthoringInstructions({ reference: true }),
    '',
    '## Formulas, emoji and structured components',
    '',
    ...intentTable([
      ['Explain a calculation, definition or notation', 'KaTeX; define variables and units in prose, preserve supplied assumptions, and distinguish an equation from a numeric result'],
      ['Add a friendly cue or make labels easier to scan', 'A small number of emoji alongside real text; skip decorative emoji, emoji-only status, and repeated icons'],
      ['Compare statuses or progress across dimensions', '`status-matrix` for supplied states and progress; use a simple table if the extra encoding adds little'],
      ['Scan or group similar entities with metadata', '`record-list`; use a plain list for records with only titles'],
      ['Surface several independent key facts', '`fact-cards` for a small collection of supplied facts; use `metric` for one numeric KPI with context'],
    ]),
    '',
    createComponentAuthoringInstructions(),
    '',
    'Some export targets simplify component styling. If appearance or accessibility is essential, verify the target or use equivalent text or a native table. Check labels, units, and readability independently of syntax validation.',
  ].join('\n');
}
