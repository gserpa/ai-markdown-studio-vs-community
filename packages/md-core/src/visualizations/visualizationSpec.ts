import { validate as validateNativeUnit, VEGA_LITE_MARKS } from './vegaLiteNativeValidator.cjs';
export { VEGA_LITE_MARKS, VEGA_LITE_COMPOSITIONS, VEGA_LITE_SCHEMA_VERSION, VEGA_LITE_SCHEMA_HASH } from './vegaLiteNativeValidator.cjs';

/** Precompiled native syntax validation followed by bounded application policy. */
export const VISUALIZATION_LIMITS = Object.freeze({
  maxSourceBytes: 128 * 1024,
  maxDepth: 12,
  maxNodes: 50_000,
  maxDataRows: 5_000,
  maxFieldsPerRow: 32,
  maxStringLength: 2_048,
  maxDimension: 4_096,
  maxViews: 32,
});

type DataValue = string | number | boolean | null;
type FieldType = 'quantitative' | 'ordinal' | 'nominal' | 'temporal' | 'geojson';
export type VegaLiteMarkType = typeof VEGA_LITE_MARKS[number];
type AggregateOperation = string;
export type VegaLiteFieldDefinition = {
  [key: string]: unknown;
  field?: string | { repeat: string };
  type?: FieldType;
  aggregate?: AggregateOperation;
  bin?: boolean | { maxbins: number };
  title?: string | null;
  format?: string;
  sort?: string | DataValue[] | Record<string, unknown> | null;
  axis?: { title?: string | null; labelAngle?: number; format?: string; grid?: boolean; labels?: boolean; ticks?: boolean; tickCount?: number; labelLimit?: number } | null;
  scale?: { zero?: boolean; nice?: boolean; reverse?: boolean };
  legend?: null;
};
export type VegaLiteSpec = {
  $schema?: string;
  title?: string | string[] | { text: string | string[]; [key: string]: unknown };
  description?: string;
  width?: number | 'container';
  height?: number;
  autosize?: 'fit' | 'fit-x' | 'fit-y' | 'pad' | 'none' | { type: 'fit' | 'fit-x' | 'fit-y' | 'pad' | 'none'; contains?: 'padding' | 'content'; resize?: boolean };
  data?: { values: Record<string, unknown>[] };
  projection?: Record<string, unknown>;
  layer?: VegaLiteSpec[];
  facet?: Record<string, unknown>;
  repeat?: Record<string, string[]> | string[];
  spec?: VegaLiteSpec;
  concat?: VegaLiteSpec[];
  hconcat?: VegaLiteSpec[];
  vconcat?: VegaLiteSpec[];
  mark?: VegaLiteMarkType | {
    [key: string]: unknown;
    type: VegaLiteMarkType; point?: boolean; line?: boolean; filled?: boolean;
    tooltip?: boolean; color?: string; opacity?: number; strokeWidth?: number;
    size?: number; thickness?: number; innerRadius?: number; outerRadius?: number; extent?: number | string;
  };
  encoding?: {
    [channel: string]: VegaLiteFieldDefinition | VegaLiteFieldDefinition[] | null | undefined;
    x?: VegaLiteFieldDefinition;
    y?: VegaLiteFieldDefinition;
    xOffset?: VegaLiteFieldDefinition;
    yOffset?: VegaLiteFieldDefinition;
    theta?: VegaLiteFieldDefinition;
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
    if (typeof entry.value === 'string' && entry.value.length > VISUALIZATION_LIMITS.maxStringLength
      && !/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/iu.test(entry.value)) fail('A visualization string is too long.');
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
  const spec = object(value, 'vega-lite');
  if (spec.$schema !== undefined && spec.$schema !== 'https://vega.github.io/schema/vega-lite/v6.json') fail('Only the Vega-Lite v6 schema is supported.');
  let viewCount = 0;
  function inspectView(view: Record<string, unknown>, inherited: Record<string, unknown>[] = [], repeats: Record<string, string[]> = {}, multiplier = 1, inheritedEncoding: Record<string, unknown> = {}): void {
    for (const key of ['config', 'params', 'transform', 'datasets', 'selection']) if (view[key] !== undefined) fail('vega-lite.' + key + ' is outside the supported chart resource/expression policy.');
    const rows = view.data === undefined ? inherited : (() => {
      const data = object(view.data, 'data', ['values']);
      if (!Array.isArray(data.values) || !data.values.length || data.values.length > VISUALIZATION_LIMITS.maxDataRows) fail('data.values must contain 1–' + VISUALIZATION_LIMITS.maxDataRows + ' inline rows.');
      return data.values as Record<string, unknown>[];
    })();
    if (typeof view.title === 'string') text(view.title, 'title', 200);
    if (view.width !== undefined && view.width !== 'container') number(view.width, 'width', 40, VISUALIZATION_LIMITS.maxDimension);
    if (view.height !== undefined && view.height !== 'container') number(view.height, 'height', 40, VISUALIZATION_LIMITS.maxDimension);
    const encoding = { ...inheritedEncoding, ...(view.encoding as Record<string, unknown> ?? {}) };
    const mark = view.mark === undefined ? undefined : typeof view.mark === 'string' ? { type: view.mark } : object(view.mark, 'mark');
    if (mark) for (const row of rows) validateDataRow(row, mark.type === 'geoshape' || row.type === 'Feature');
    inspectConfiguration(Object.fromEntries(Object.entries(view).filter(([key]) => !['data', 'spec', 'repeat', 'layer', 'concat', 'hconcat', 'vconcat'].includes(key))), 'vega-lite', rows, repeats);
    if (mark) {
      if (!rows.length) fail('Each chart view must provide or inherit inline data.values.');
      if (mark.type === 'image') {
        if (!chartImageUrls({ ...view, data: { values: rows }, encoding } as VegaLiteSpec, repeats).length) fail('Image charts require mark.url or encoding.url.');
      } else if (mark.url !== undefined || (view.encoding as Record<string, unknown> | undefined)?.url !== undefined) fail('Image URLs are supported only for image marks.');
      if (typeof mark.innerRadius === 'number' && typeof mark.outerRadius === 'number' && mark.innerRadius > mark.outerRadius) fail('mark.innerRadius cannot exceed mark.outerRadius.');
      viewCount += multiplier;
      if (viewCount > VISUALIZATION_LIMITS.maxViews) fail('Chart composition exceeds ' + VISUALIZATION_LIMITS.maxViews + ' rendered views.');
    }
    for (const key of ['layer', 'concat', 'hconcat', 'vconcat']) if (view[key] !== undefined) {
      if (!Array.isArray(view[key]) || !(view[key] as unknown[]).length) fail(key + ' must be a nonempty array.');
      for (const child of view[key] as unknown[]) inspectView(object(child, key + ' view'), rows, repeats, multiplier, key === 'layer' ? encoding : {});
    }
    if (view.spec !== undefined) {
      const context = { ...repeats };
      let copies = 1;
      if (view.repeat !== undefined) {
        const repeat = Array.isArray(view.repeat) ? { repeat: view.repeat } : object(view.repeat, 'repeat', ['row', 'column', 'layer']);
        for (const [key, fields] of Object.entries(repeat)) {
          if (!Array.isArray(fields) || !fields.length || fields.length > VISUALIZATION_LIMITS.maxViews) fail('Repeat fields must be a bounded nonempty array.');
          for (const field of fields) if (typeof field !== 'string' || !rows.some(row => readDataField(row, field) !== undefined)) fail('Repeat fields must name inline data fields.');
          context[key] = fields as string[];
          copies *= fields.length;
        }
      }
      if (view.facet !== undefined) {
        const fields: string[] = [];
        const gather = (entry: unknown): void => {
          if (!entry || typeof entry !== 'object') return;
          const item = entry as Record<string, unknown>;
          if (typeof item.field === 'string') fields.push(item.field);
          else for (const child of Object.values(item)) gather(child);
        };
        gather(view.facet);
        copies *= new Set(rows.map(row => JSON.stringify(fields.map(field => readDataField(row, field))))).size;
      }
      if (copies * multiplier > VISUALIZATION_LIMITS.maxViews) fail('Chart composition exceeds ' + VISUALIZATION_LIMITS.maxViews + ' rendered views.');
      inspectView(object(view.spec, 'composition.spec'), rows, context, multiplier * copies);
    }
  }
  inspectView(spec);
  if (!validateNativeUnit(prepareVegaLiteSpec(spec as VegaLiteSpec))) {
    const errors = validateNativeUnit.errors ?? [];
    const error = errors.reduce((best, item) => item.instancePath.length > best.instancePath.length ? item : best, errors[0] ?? { instancePath: '' });
    fail((error.instancePath.slice(1).replace(/\//gu, '.') || 'vega-lite') + ' ' + (error.message ?? 'does not match the installed Vega-Lite schema') + '.');
  }
}

function validateDataRow(value: unknown, geo: boolean): void {
  const row = object(value, 'data.values row');
  const entries = Object.entries(row);
  if (!entries.length || entries.length > VISUALIZATION_LIMITS.maxFieldsPerRow) fail('Each data row must contain 1–' + VISUALIZATION_LIMITS.maxFieldsPerRow + ' fields.');
  for (const [key, item] of entries) {
    if (!key.trim() || ['.', '[', ']', '\\'].some(character => key.includes(character))) fail('Data field names must be nonempty literal names without dots, brackets, or backslashes.');
    if (!scalar(item) && !geo) fail('Data rows must contain only strings, finite numbers, booleans, or null, except inline GeoJSON for geoshape.');
  }
  if (geo) {
    if (row.type === 'Feature') {
      object(row.properties ?? {}, 'GeoJSON properties');
      validateGeometry(row.geometry);
    } else validateGeometry(row);
  }
}

function validateGeometry(value: unknown): void {
  const geometry = object(value, 'GeoJSON geometry', ['type', 'coordinates', 'geometries', 'bbox']);
  choice(geometry.type, 'GeoJSON geometry.type', ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']);
  if (geometry.type === 'GeometryCollection') {
    if (!Array.isArray(geometry.geometries) || !geometry.geometries.length) fail('GeoJSON geometries must be a nonempty array.');
    for (const child of geometry.geometries) validateGeometry(child);
    return;
  }
  const depths: Record<string, number> = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };
  function coordinates(entry: unknown, depth: number): void {
    if (!Array.isArray(entry) || entry.length < (depth ? 1 : 2)) fail('GeoJSON coordinates must contain finite coordinate pairs.');
    if (depth) for (const child of entry) coordinates(child, depth - 1);
    else for (const coordinate of entry) number(coordinate, 'GeoJSON coordinate');
  }
  coordinates(geometry.coordinates, depths[geometry.type as string]);
}

function readDataField(row: Record<string, unknown>, field: string): unknown {
  if (!field || /[[\]\\]/u.test(field)) fail('Chart fields must use literal names or dot-separated inline object paths.');
  let value: unknown = row;
  for (const segment of field.split('.')) {
    if (forbiddenKeys.has(segment)) fail('Prototype paths are not supported in chart fields.');
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, segment)) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

/** Return a URL only for image loading; data loading and navigation stay blocked. */
export function validateChartImageUrl(value: unknown): string {
  if (typeof value !== 'string') fail('Chart image URLs must be strings.');
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/iu.test(value)) return value;
  let url: URL;
  try { url = new URL(value); } catch { return fail('Chart images require HTTPS URLs or inline PNG/JPEG/GIF/WebP data.'); }
  if (url.protocol !== 'https:' || url.username || url.password) fail('Chart images require HTTPS URLs or inline PNG/JPEG/GIF/WebP data.');
  return value;
}

export function chartImageUrls(spec: VegaLiteSpec, repeats: Record<string, string[]> = {}, inherited: Record<string, unknown>[] = [], parentEncoding: Record<string, unknown> = {}): string[] {
  const mark = typeof spec.mark === 'string' ? { type: spec.mark } : spec.mark;
  const rows = spec.data?.values ?? inherited;
  const encoding = { ...parentEncoding, ...spec.encoding };
  const result: string[] = [];
  if (mark?.type === 'image') {
    if (mark.url !== undefined) result.push(validateChartImageUrl(mark.url));
    const definition = encoding.url as VegaLiteFieldDefinition | undefined;
    if (definition) {
      if (definition.value !== undefined) result.push(validateChartImageUrl(definition.value));
      const fields = typeof definition.field === 'string' ? [definition.field]
        : definition.field && typeof definition.field === 'object' ? repeats[definition.field.repeat] ?? [] : [];
      for (const field of fields) for (const row of rows) result.push(validateChartImageUrl(readDataField(row, field)));
    }
  }
  for (const key of ['layer', 'concat', 'hconcat', 'vconcat'] as const) {
    for (const child of spec[key] ?? []) result.push(...chartImageUrls(child, repeats, rows, key === 'layer' ? encoding : {}));
  }
  if (spec.spec) {
    const context = Array.isArray(spec.repeat) ? { ...repeats, repeat: spec.repeat } : { ...repeats, ...spec.repeat };
    result.push(...chartImageUrls(spec.spec, context, rows));
  }
  return [...new Set(result)];
}

export function chartTitle(spec: VegaLiteSpec): string {
  const title = spec.title && typeof spec.title === 'object' && !Array.isArray(spec.title) ? spec.title.text : spec.title;
  return (Array.isArray(title) ? title.join(' ') : title || 'Chart').slice(0, 200);
}

/** Normalize common composition dimensions and geometry values without changing source JSON. */
export function prepareVegaLiteSpec(spec: VegaLiteSpec, availableWidth?: number): VegaLiteSpec {
  const copy = JSON.parse(JSON.stringify(spec)) as VegaLiteSpec;
  function visit(node: VegaLiteSpec, inherited: Record<string, unknown>[] = [], parentEncoding: Record<string, unknown> = {}, layoutRoot = true): void {
    const rows = node.data?.values ?? inherited;
    const encoding = { ...parentEncoding, ...node.encoding };
    const mark = typeof node.mark === 'string' ? node.mark : node.mark?.type;
    if (mark === 'geoshape') {
      const shape = encoding.shape as VegaLiteFieldDefinition | undefined;
      if (typeof shape?.field === 'string') {
        const field = shape.field;
        node.data = { values: rows.map(row => {
          const geometry = readDataField(row, field);
          if (!geometry || typeof geometry !== 'object' || ['Feature', 'FeatureCollection'].includes((geometry as Record<string, unknown>).type as string)) return row;
          const result = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
          const segments = field.split('.');
          let target = result;
          for (const segment of segments.slice(0, -1)) target = target[segment] as Record<string, unknown>;
          target[segments.at(-1)!] = { type: 'Feature', properties: {}, geometry };
          return result;
        }) };
      }
    }
    const children = node.spec ? [node.spec] : node.concat ?? node.hconcat ?? node.vconcat;
    if (children) {
      const dimensions = node as unknown as Record<string, unknown>;
      for (const key of ['width', 'height']) {
        if (dimensions[key] === undefined) continue;
        for (const child of children) if ((child as unknown as Record<string, unknown>)[key] === undefined) (child as unknown as Record<string, unknown>)[key] = dimensions[key];
        delete dimensions[key];
      }
      for (const child of children) visit(child, rows);
    } else if (availableWidth !== undefined && layoutRoot) {
      node.width ??= node === copy ? 'container' : Math.max(80, Math.min(240, availableWidth / 2 - 50));
      node.height ??= node === copy ? 280 : 180;
      node.autosize ??= { type: 'fit', contains: 'padding' };
      if (node !== copy && node.width === 'container') node.width = Math.max(80, Math.min(240, availableWidth / 2 - 50));
    }
    for (const child of node.layer ?? []) visit(child, rows, encoding, false);
    if (node.mark && availableWidth !== undefined && !['boxplot', 'errorband', 'errorbar'].includes(mark ?? '')) {
      node.mark = typeof node.mark === 'string' ? { type: node.mark, tooltip: encoding.tooltip !== null }
        : { tooltip: encoding.tooltip !== null, ...node.mark };
    }
  }
  visit(copy);
  return copy;
}

function inspectConfiguration(value: unknown, path: string, rows: Record<string, unknown>[], repeats: Record<string, string[]> = {}): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { for (const child of value) inspectConfiguration(child, path, rows, repeats); return; }
  const record = value as Record<string, unknown>;
  if (record.aggregate !== undefined && record.aggregate !== 'count' && record.field === undefined) fail(path + '.field is required for this aggregate.');
  for (const [key, child] of Object.entries(record)) {
    const location = path + '.' + key;
    if (['expr', 'signal', 'test', 'condition', 'href', 'calculate', 'labelExpr', 'update', 'init'].includes(key) || key.endsWith('Expr')) fail(location + ' is outside the supported chart resource/expression policy.');
    if (key === 'field') {
      if (child && typeof child === 'object') {
        const reference = object(child, location, ['repeat']);
        if (typeof reference.repeat !== 'string' || !repeats[reference.repeat]) fail(location + ' must reference a declared repeat dimension.');
      } else {
        text(child, location, 120, true);
        if (!rows.some(row => readDataField(row, child as string) !== undefined)) fail(location + ' must name an inline data field.');
      }
    }
    if (['color', 'fill', 'stroke', 'cursor', 'background'].includes(key) && typeof child === 'string' && /url\s*\(|(?:javascript|file|data):/iu.test(child)) fail(location + ' cannot load external resources.');
    if (key === 'bin' && child && typeof child === 'object') {
      const bin = object(child, location, ['maxbins']);
      number(bin.maxbins, location + '.maxbins', 1, 100);
      if (!Number.isInteger(bin.maxbins)) fail(location + '.maxbins must be an integer.');
    }
    if (key === 'tickCount' && typeof child === 'number') {
      number(child, location, 1, 100);
      if (!Number.isInteger(child)) fail(location + ' must be an integer.');
    }
    if (['width', 'height', 'size', 'thickness', 'innerRadius', 'outerRadius', 'fontSize', 'strokeWidth'].includes(key) && typeof child === 'number') number(child, location, 0, VISUALIZATION_LIMITS.maxDimension);
    if (key === 'extent' && typeof child === 'number' && path.endsWith('.mark')) number(child, location, 0, 100);
    if (key === 'columns') { number(child, location, 1, VISUALIZATION_LIMITS.maxViews); if (!Number.isInteger(child)) fail(location + ' must be an integer.'); }
    if (['spacing', 'padding', 'dx', 'dy'].includes(key) && typeof child === 'number') number(child, location, -VISUALIZATION_LIMITS.maxDimension, VISUALIZATION_LIMITS.maxDimension);
    inspectConfiguration(child, location, rows, repeats);
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
