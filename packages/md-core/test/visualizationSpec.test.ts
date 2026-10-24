import { describe, expect, it } from 'vitest';
import { parseVisualizationBlock, VISUALIZATION_LIMITS, type VisualizationKind } from '../src/visualizations/visualizationSpec';

function chart() {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    title: 'Debt', width: 'container', height: 280,
    data: { values: [{ year: '2022', debt: 111.2, series: 'Government' }, { year: '2025', debt: 89.2, series: 'Government' }] },
    mark: { type: 'line', point: true },
    encoding: {
      x: { field: 'year', type: 'ordinal', axis: { labelAngle: 0 } },
      y: { field: 'debt', type: 'quantitative', title: '% GDP', scale: { zero: false } },
      color: { field: 'series', type: 'nominal', legend: null },
      tooltip: [{ field: 'year', type: 'ordinal' }, { field: 'debt', type: 'quantitative', format: '.1f' }],
    },
  };
}
function parse(kind: VisualizationKind, value: unknown) { return parseVisualizationBlock(kind, JSON.stringify(value)); }
function error(kind: VisualizationKind, value: unknown) {
  const result = parse(kind, value);
  expect(result.valid).toBe(false);
  return !result.valid ? result.error : '';
}

describe('visualization specifications', () => {
  it('accepts the documented native chart subset without rewriting source values', () => {
    const spec = chart();
    expect(parse('vega-lite', spec)).toEqual({ valid: true, block: { kind: 'vega-lite', spec } });
    expect(parse('vega-lite', { ...spec, mark: 'bar' }).valid).toBe(true);
    expect(parse('vega-lite', { ...spec, autosize: { type: 'fit', contains: 'padding', resize: true } }).valid).toBe(true);
  });

  it('accepts metrics and signed trends, including zero and negative primary values', () => {
    for (const [value, direction] of [[-22, 'down'], [0, 'flat'], [2, 'up']] as const) {
      expect(parse('metric', { title: 'Debt', value: -1, unit: '% GDP', trend: { value, direction, period: 'since 2022' } }).valid).toBe(true);
    }
    expect(parse('metric', { title: 'Zero', value: 0 }).valid).toBe(true);
  });

  it.each([
    ['title', ''], ['value', '89.2'], ['value', null], ['unit', 4], ['subtitle', 'x'.repeat(301)], ['extra', true],
  ])('rejects invalid metric property %s', (key, value) => {
    expect(error('metric', { title: 'Debt', value: 89.2, [key]: value })).toMatch(/metric\./u);
  });

  it.each([
    { value: 1, direction: 'down' }, { value: -1, direction: 'up' }, { value: 1, direction: 'flat' },
    { value: 0, direction: 'up' }, { value: 0, direction: 'down' }, { value: -1, direction: 'left' },
    { value: -1 }, { value: -1, direction: 'down', callback: 'alert(1)' },
  ])('rejects inconsistent or malformed trends: %j', trend => {
    expect(error('metric', { title: 'Debt', value: 89.2, trend })).toContain('metric.trend');
  });

  it.each(['null', '[]', 'true', '42', '"text"', '{', '{"title":"x",}', '/* comment */ {}'])('rejects non-object or malformed JSON: %s', source => {
    expect(parseVisualizationBlock('metric', source).valid).toBe(false);
  });

  it.each([
    { data: { url: 'https://example.com/data.json' } },
    { data: { values: [{ year: '2025', debt: { expr: 'alert(1)' } }] } },
    { mark: 'image' }, { mark: { type: 'bar', href: 'javascript:alert(1)' } },
    { mark: { type: 'line', color: 'url(https://example.com/x)' } },
    { mark: { type: 'line', point: { expr: 'true' } } },
    { transform: [{ calculate: 'alert(1)', as: 'x' }] },
    { params: [{ name: 'x', expr: 'event.view' }] },
    { layer: [chart()] }, { config: { customFormatTypes: true } },
    { datasets: { remote: { url: 'file:///secret' } } },
    { $schema: 'https://example.com/schema.json' },
  ])('rejects resources, expressions, unsupported marks and composition: %j', patch => {
    expect(parse('vega-lite', { ...chart(), ...patch }).valid).toBe(false);
  });

  it('rejects unsupported options at nested encoding boundaries', () => {
    for (const x of [
      { field: 'year', type: 'ordinal', axis: { labelExpr: 'event.view' } },
      { field: 'year', type: 'ordinal', condition: { test: 'true', value: 'x' } },
      { field: 'year', type: 'ordinal', scale: { domain: { url: 'https://example.com' } } },
      { field: 'year', type: 'ordinal', axis: { tickCount: 1.5 } },
      { field: 'year', type: 'ordinal', axis: { tickCount: 101 } },
      { field: 'missing', type: 'ordinal' }, { field: 'year', type: 'unknown' },
    ]) expect(parse('vega-lite', { ...chart(), encoding: { ...chart().encoding, x } }).valid).toBe(false);
  });

  it('does not confuse data field names or literal data strings with configuration', () => {
    expect(parse('vega-lite', {
      mark: 'bar', data: { values: [{ url: '<script>alert(1)</script>', expr: 3 }] },
      encoding: { x: { field: 'url', type: 'nominal' }, y: { field: 'expr', type: 'quantitative' } },
    }).valid).toBe(true);
  });

  it.each(['constructor.name', 'values[0]', 'a\\.b', ''])('rejects field path syntax in flat inline data: %s', field => {
    expect(error('vega-lite', {
      mark: 'bar', data: { values: [{ [field]: '2025', debt: 1 }] },
      encoding: { x: { field, type: 'nominal' }, y: { field: 'debt', type: 'quantitative' } },
    })).toContain('literal names');
  });

  it('rejects prototype keys and non-finite JSON numbers', () => {
    for (const source of [
      '{"title":"Debt","value":1,"__proto__":{"polluted":true}}',
      '{"title":"Debt","value":1,"constructor":{}}',
      '{"title":"Debt","value":1,"trend":{"prototype":{}}}',
      '{"title":"Debt","value":1e999}',
    ]) expect(parseVisualizationBlock('metric', source).valid).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('bounds source by UTF-8 bytes before parsing', () => {
    expect(parseVisualizationBlock('metric', ' '.repeat(VISUALIZATION_LIMITS.maxSourceBytes + 1))).toMatchObject({ valid: false, error: expect.stringContaining('UTF-8 bytes') });
    const multibyte = JSON.stringify({ title: 'Debt', value: 1, extra: '€'.repeat(50_000) });
    expect(multibyte.length).toBeLessThan(VISUALIZATION_LIMITS.maxSourceBytes);
    expect(parseVisualizationBlock('metric', multibyte)).toMatchObject({ valid: false, error: expect.stringContaining('UTF-8 bytes') });
  });

  it('bounds depth, values, data rows, fields, strings, and dimensions', () => {
    expect(error('metric', { title: 'Debt', value: 1, extra: JSON.parse('['.repeat(14) + '0' + ']'.repeat(14)) })).toContain('nested too deeply');
    expect(error('vega-lite', { ...chart(), data: { values: Array.from({ length: 5_001 }, () => ({ year: 'x', debt: 1 })) } })).toContain('inline rows');
    const wideRow = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`f${i}`, i]));
    expect(error('vega-lite', { ...chart(), data: { values: [wideRow] } })).toContain('32 fields');
    expect(error('metric', { title: 'x'.repeat(2_049), value: 1 })).toContain('too long');
    expect(error('vega-lite', { ...chart(), width: 4_097 })).toContain('width');
    expect(error('vega-lite', { ...chart(), height: 0 })).toContain('height');
    expect(error('vega-lite', { ...chart(), data: { values: [] } })).toContain('inline rows');
    const source = '[' + Array.from({ length: 50_001 }, () => '0').join(',') + ']';
    expect(parseVisualizationBlock('metric', source)).toMatchObject({ valid: false, error: expect.stringContaining('too many values') });
  });
});
