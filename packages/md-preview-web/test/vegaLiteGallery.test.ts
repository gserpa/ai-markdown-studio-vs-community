import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compile, type TopLevelSpec } from 'vega-lite';
import { parse, View, logger, Warn } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { createMarkdownRenderer } from '@mfo/core';
import { parseVisualizationBlock, prepareVegaLiteSpec, VEGA_LITE_MARKS, VEGA_LITE_COMPOSITIONS, VEGA_LITE_SCHEMA_HASH } from '@mfo/core/visualizations';

const gallery = readFileSync(path.resolve(__dirname, '../../../examples/vega-lite-chart-gallery.md'), 'utf8');
const charts = createMarkdownRenderer().parse(gallery, {}).filter(token => token.type === 'fence' && token.info === 'vega-lite').map(token => JSON.parse(token.content));

describe('Vega-Lite chart gallery', () => {
  it('covers every primitive and composite mark in the installed compiler schema', () => {
    const source = readFileSync(path.resolve(__dirname, '../../../node_modules/vega-lite/build/vega-lite-schema.json'), 'utf8');
    const schema = JSON.parse(source);
    const marks = [...schema.definitions.Mark.enum, ...schema.definitions.CompositeMark.anyOf.map((ref: { $ref: string }) => {
      const definition = schema.definitions[ref.$ref.split('/').at(-1)!];
      return definition.const ?? definition.enum[0];
    })].sort();
    expect(VEGA_LITE_MARKS).toEqual(marks);
    expect([...new Set(charts.filter(spec => spec.mark).map(spec => typeof spec.mark === 'string' ? spec.mark : spec.mark.type))].sort()).toEqual(marks);
    expect(VEGA_LITE_SCHEMA_HASH).toBe(createHash('sha256').update(source).digest('hex'));
    const compositions = [...new Set(schema.definitions.TopLevelSpec.anyOf.flatMap((ref: { $ref: string }) => (schema.definitions[ref.$ref.split('/').at(-1)!].required ?? []).filter((key: string) => ['layer', 'facet', 'repeat', 'concat', 'hconcat', 'vconcat'].includes(key))))].sort();
    expect(VEGA_LITE_COMPOSITIONS).toEqual(compositions);
    for (const key of compositions) expect(charts.some(spec => Object.hasOwn(spec, key as string))).toBe(true);
  });

  it.each(charts.map(spec => [spec.title, spec] as const))('validates, compiles and renders %s with the expression interpreter', async (_title, spec) => {
    const result = parseVisualizationBlock('vega-lite', JSON.stringify(spec));
    expect(result.valid, result.valid ? '' : result.error).toBe(true);
    const failures: unknown[][] = [];
    const runtimeLogger = logger(Warn);
    runtimeLogger.error = (...args: unknown[]) => { failures.push(args); return runtimeLogger; };
    const compiled = compile(prepareVegaLiteSpec({ ...spec, width: 720, height: 280 }, 720) as TopLevelSpec).spec;
    // Actual image decoding is covered by the browser gallery test.
    if ((typeof spec.mark === 'string' ? spec.mark : spec.mark?.type) === 'image') return;
    const view = new View(parse(compiled, undefined, { ast: true }), {
      renderer: 'none', expr: expressionInterpreter, logger: runtimeLogger,
      loader: { load: async () => { throw new Error('External data is disabled.'); }, sanitize: async () => { throw new Error('External links are disabled.'); } },
    });
    try {
      await view.runAsync();
      const svg = await view.toSVG();
      expect(failures).toEqual([]);
      expect(svg).toContain('role-mark');
      expect(svg).not.toContain('NaN');
    } finally { view.finalize(); }
  });
});
