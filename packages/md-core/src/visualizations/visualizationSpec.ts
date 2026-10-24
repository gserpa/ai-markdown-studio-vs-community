/** Shared, dependency-free validation for the supported visualization subset. */
export const VISUALIZATION_LIMITS = Object.freeze({
  maxSourceBytes: 128 * 1024,
  maxDepth: 12,
  maxNodes: 50_000,
  maxDataRows: 5_000,
  maxFieldsPerRow: 32,
  maxStringLength: 2_048,
  maxDimension: 4_096,
});

type DataValue = string | number | boolean | null;
type FieldType = 'quantitative' | 'ordinal' | 'nominal' | 'temporal';
export type VegaLiteFieldDefinition = {
  field: string;
  type: FieldType;
  title?: string | null;
  format?: string;
  sort?: 'ascending' | 'descending' | DataValue[] | null;
  axis?: { title?: string | null; labelAngle?: number; format?: string; grid?: boolean; labels?: boolean; ticks?: boolean; tickCount?: number; labelLimit?: number } | null;
  scale?: { zero?: boolean; nice?: boolean; reverse?: boolean };
  legend?: null;
};
export type VegaLiteSpec = {
  $schema?: string;
  title?: string;
  description?: string;
  width?: number | 'container';
  height?: number;
  autosize?: 'fit' | 'fit-x' | 'fit-y' | 'pad' | 'none' | { type: 'fit' | 'fit-x' | 'fit-y' | 'pad' | 'none'; contains?: 'padding' | 'content'; resize?: boolean };
  data: { values: Record<string, DataValue>[] };
  mark: 'line' | 'bar' | { type: 'line' | 'bar'; point?: boolean; tooltip?: boolean; color?: string; opacity?: number; strokeWidth?: number };
  encoding: {
    x: VegaLiteFieldDefinition;
    y: VegaLiteFieldDefinition;
    color?: VegaLiteFieldDefinition;
    tooltip?: VegaLiteFieldDefinition | VegaLiteFieldDefinition[] | null;
  };
};
export type MetricSpec = {
  title: string;
  value: number;
  unit?: string;
  subtitle?: string;
  trend?: { value: number; direction: 'up' | 'down' | 'flat'; unit?: string; period?: string };
};
export type VisualizationKind = 'vega-lite' | 'metric';
export type VisualizationBlock = { kind: 'vega-lite'; spec: VegaLiteSpec } | { kind: 'metric'; spec: MetricSpec };
export type VisualizationParseResult = { valid: true; block: VisualizationBlock } | { valid: false; error: string };

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
const autosizeTypes = ['fit', 'fit-x', 'fit-y', 'pad', 'none'];

/** Reuse at every trust boundary; HTML data attributes do not establish validity. */
export function parseVisualizationBlock(kind: VisualizationKind, source: string): VisualizationParseResult {
  if (source.length > VISUALIZATION_LIMITS.maxSourceBytes || new TextEncoder().encode(source).length > VISUALIZATION_LIMITS.maxSourceBytes) {
    return { valid: false, error: `Visualization source exceeds ${VISUALIZATION_LIMITS.maxSourceBytes} UTF-8 bytes.` };
  }
  let value: unknown;
  try { value = JSON.parse(source); }
  catch { return { valid: false, error: 'Invalid JSON. Use a JSON object without comments or trailing commas.' }; }
  try {
    inspectTree(value);
    if (kind === 'vega-lite') {
      validateVegaLite(value);
      return { valid: true, block: { kind, spec: value as VegaLiteSpec } };
    }
    if (kind === 'metric') {
      validateMetric(value);
      return { valid: true, block: { kind, spec: value as MetricSpec } };
    }
    return { valid: false, error: 'Unsupported visualization kind.' };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Invalid visualization specification.' };
  }
}

function inspectTree(value: unknown): void {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++nodes > VISUALIZATION_LIMITS.maxNodes) fail('Visualization has too many values.');
    if (entry.depth > VISUALIZATION_LIMITS.maxDepth) fail('Visualization is nested too deeply.');
    if (typeof entry.value === 'number' && !Number.isFinite(entry.value)) fail('Numbers must be finite.');
    if (typeof entry.value === 'string' && entry.value.length > VISUALIZATION_LIMITS.maxStringLength) fail('A visualization string is too long.');
    if (entry.value && typeof entry.value === 'object') {
      for (const [key, child] of Object.entries(entry.value)) {
        if (forbiddenKeys.has(key)) fail(`Property "${key}" is not supported.`);
        if (key.length > 120) fail('A visualization property name is too long.');
        pending.push({ value: child, depth: entry.depth + 1 });
      }
    }
  }
}

function validateMetric(value: unknown): void {
  const spec = object(value, 'metric', ['title', 'value', 'unit', 'subtitle', 'trend']);
  text(spec.title, 'metric.title', 200, true);
  number(spec.value, 'metric.value');
  optionalText(spec.unit, 'metric.unit', 120);
  optionalText(spec.subtitle, 'metric.subtitle', 300);
  if (spec.trend !== undefined) {
    const trend = object(spec.trend, 'metric.trend', ['value', 'unit', 'period', 'direction']);
    number(trend.value, 'metric.trend.value');
    choice(trend.direction, 'metric.trend.direction', ['up', 'down', 'flat']);
    optionalText(trend.unit, 'metric.trend.unit', 120);
    optionalText(trend.period, 'metric.trend.period', 200);
    if ((trend.direction === 'up' && (trend.value as number) <= 0)
      || (trend.direction === 'down' && (trend.value as number) >= 0)
      || (trend.direction === 'flat' && trend.value !== 0)) {
      fail('metric.trend.direction must match the sign of metric.trend.value.');
    }
  }
}

function validateVegaLite(value: unknown): void {
  const spec = object(value, 'vega-lite', ['$schema', 'title', 'description', 'width', 'height', 'autosize', 'data', 'mark', 'encoding']);
  if (spec.$schema !== undefined && spec.$schema !== 'https://vega.github.io/schema/vega-lite/v6.json') fail('Only the Vega-Lite v6 schema is supported.');
  optionalText(spec.title, 'title', 200);
  optionalText(spec.description, 'description', VISUALIZATION_LIMITS.maxStringLength);
  if (spec.width !== undefined && spec.width !== 'container') number(spec.width, 'width', 40, VISUALIZATION_LIMITS.maxDimension);
  if (spec.height !== undefined) number(spec.height, 'height', 40, VISUALIZATION_LIMITS.maxDimension);
  if (spec.autosize !== undefined) {
    if (typeof spec.autosize === 'string') choice(spec.autosize, 'autosize', autosizeTypes);
    else {
      const autosize = object(spec.autosize, 'autosize', ['type', 'contains', 'resize']);
      choice(autosize.type, 'autosize.type', autosizeTypes);
      if (autosize.contains !== undefined) choice(autosize.contains, 'autosize.contains', ['padding', 'content']);
      optionalBoolean(autosize.resize, 'autosize.resize');
    }
  }
  const data = object(spec.data, 'data', ['values']);
  if (!Array.isArray(data.values) || data.values.length === 0 || data.values.length > VISUALIZATION_LIMITS.maxDataRows) fail(`data.values must contain 1–${VISUALIZATION_LIMITS.maxDataRows} inline rows.`);
  const fields = new Set<string>();
  for (const row of data.values as unknown[]) {
    const record = object(row, 'data.values row');
    const entries = Object.entries(record);
    if (!entries.length || entries.length > VISUALIZATION_LIMITS.maxFieldsPerRow) fail(`Each data row must contain 1–${VISUALIZATION_LIMITS.maxFieldsPerRow} fields.`);
    for (const [key, item] of entries) {
      if (!key.trim() || ['.', '[', ']', '\\'].some(character => key.includes(character))) {
        fail('Data field names must be nonempty literal names without dots, brackets, or backslashes.');
      }
      if (!scalar(item)) fail('Data rows must contain only strings, finite numbers, booleans, or null.');
      fields.add(key);
    }
  }
  if (typeof spec.mark === 'string') choice(spec.mark, 'mark', ['line', 'bar']);
  else {
    const mark = object(spec.mark, 'mark', ['type', 'point', 'tooltip', 'color', 'opacity', 'strokeWidth']);
    choice(mark.type, 'mark.type', ['line', 'bar']);
    optionalBoolean(mark.point, 'mark.point');
    if (mark.point !== undefined && mark.type !== 'line') fail('mark.point is supported only for line charts.');
    optionalBoolean(mark.tooltip, 'mark.tooltip');
    if (mark.color !== undefined && (typeof mark.color !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/iu.test(mark.color))) fail('mark.color must be a hexadecimal CSS color.');
    if (mark.opacity !== undefined) number(mark.opacity, 'mark.opacity', 0, 1);
    if (mark.strokeWidth !== undefined) number(mark.strokeWidth, 'mark.strokeWidth', 0, 20);
  }
  const encoding = object(spec.encoding, 'encoding', ['x', 'y', 'color', 'tooltip']);
  for (const channel of ['x', 'y', 'color'] as const) {
    if (channel !== 'color' || encoding[channel] !== undefined) validateField(encoding[channel], `encoding.${channel}`, fields, channel);
  }
  if (encoding.tooltip !== undefined && encoding.tooltip !== null) {
    const definitions = Array.isArray(encoding.tooltip) ? encoding.tooltip : [encoding.tooltip];
    if (!definitions.length || definitions.length > 16) fail('encoding.tooltip must contain 1–16 field definitions.');
    for (const definition of definitions) validateField(definition, 'encoding.tooltip', fields, 'tooltip');
  }
}

function validateField(value: unknown, path: string, fields: Set<string>, channel: 'x' | 'y' | 'color' | 'tooltip'): void {
  const keys = ['field', 'type', 'title'];
  if (channel === 'x' || channel === 'y') keys.push('axis', 'scale', 'sort');
  if (channel === 'color') keys.push('scale', 'sort', 'legend');
  if (channel === 'tooltip') keys.push('format');
  const field = object(value, path, keys);
  text(field.field, `${path}.field`, 120, true);
  if (!fields.has(field.field as string)) fail(`${path}.field must name an inline data field.`);
  choice(field.type, `${path}.type`, ['quantitative', 'ordinal', 'nominal', 'temporal']);
  if (field.title !== null) optionalText(field.title, `${path}.title`, 200);
  optionalText(field.format, `${path}.format`, 120);
  if (field.legend !== undefined && field.legend !== null) fail(`${path}.legend supports only null.`);
  if (field.sort !== undefined && field.sort !== null) {
    if (Array.isArray(field.sort)) {
      if (field.sort.length > 64 || !field.sort.every(scalar)) fail(`${path}.sort must contain at most 64 scalar values.`);
    } else choice(field.sort, `${path}.sort`, ['ascending', 'descending']);
  }
  if (field.scale !== undefined) {
    const scale = object(field.scale, `${path}.scale`, ['zero', 'nice', 'reverse']);
    for (const key of ['zero', 'nice', 'reverse']) optionalBoolean(scale[key], `${path}.scale.${key}`);
  }
  if (field.axis !== undefined && field.axis !== null) {
    const axis = object(field.axis, `${path}.axis`, ['title', 'labelAngle', 'format', 'grid', 'labels', 'ticks', 'tickCount', 'labelLimit']);
    if (axis.title !== null) optionalText(axis.title, `${path}.axis.title`, 200);
    optionalText(axis.format, `${path}.axis.format`, 120);
    for (const key of ['grid', 'labels', 'ticks']) optionalBoolean(axis[key], `${path}.axis.${key}`);
    if (axis.labelAngle !== undefined) number(axis.labelAngle, `${path}.axis.labelAngle`, -360, 360);
    if (axis.tickCount !== undefined) {
      number(axis.tickCount, `${path}.axis.tickCount`, 1, 100);
      if (!Number.isInteger(axis.tickCount)) fail(`${path}.axis.tickCount must be an integer.`);
    }
    if (axis.labelLimit !== undefined) number(axis.labelLimit, `${path}.axis.labelLimit`, 0, 500);
  }
}

function object(value: unknown, path: string, keys?: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be a JSON object.`);
  const record = value as Record<string, unknown>;
  if (keys) for (const key of Object.keys(record)) if (!keys.includes(key)) fail(`${path}.${key} is not supported.`);
  return record;
}
function scalar(value: unknown): boolean {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}
function text(value: unknown, path: string, maxLength: number, required = false): void {
  if (typeof value !== 'string' || value.length > maxLength || (required && !value.trim())) fail(`${path} must be ${required ? 'a nonempty' : 'a'} string of at most ${maxLength} characters.`);
}
function optionalText(value: unknown, path: string, maxLength: number): void {
  if (value !== undefined) text(value, path, maxLength);
}
function number(value: unknown, path: string, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path} must be a finite number.`);
  if (value < min || value > max) fail(`${path} must be between ${min} and ${max}.`);
}
function optionalBoolean(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== 'boolean') fail(`${path} must be a boolean.`);
}
function choice(value: unknown, path: string, values: string[]): void {
  if (typeof value !== 'string' || !values.includes(value)) fail(`${path} must be one of: ${values.join(', ')}.`);
}
function fail(message: string): never { throw new Error(message); }
