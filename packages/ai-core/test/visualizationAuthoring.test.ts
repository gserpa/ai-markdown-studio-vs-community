import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMarkdownRenderer } from '@mfo/core';
import { parseVisualizationBlock, type VisualizationKind } from '@mfo/core/visualizations';
import { createDocumentPrompt, createPresentationPrompt, createPresentationRepairPrompt } from '../src/generationPrompts';
import { validateMarkdownStudioDocument } from '../src/documentValidation';
import { validateMarkdownStudioPresentation } from '../src/presentationValidation';
import { createVisualizationAuthoringInstructions, createVisualizationRepairPrompt, validateVisualizationFences, VISUALIZATION_AUTHORING_EXAMPLES } from '../src/visualizationAuthoring';

const renderer = createMarkdownRenderer();
const chart = '```vega-lite\n' + JSON.stringify(VISUALIZATION_AUTHORING_EXAMPLES[0].spec) + '\n```';
const metric = '```metric\n' + JSON.stringify(VISUALIZATION_AUTHORING_EXAMPLES[1].spec) + '\n```';
const request = { brief: 'Convert supplied data into a dashboard', audience: 'Team', tone: 'Clear', length: 'Standard' };

describe('visualization authoring guidance', () => {
  it('keeps every prompt example valid against the actual visualization parser', () => {
    const prompts = [createDocumentPrompt(request), createPresentationPrompt(request), createPresentationRepairPrompt('# Dashboard', ['Repair']), createVisualizationRepairPrompt('# Dashboard', ['Repair'])];
    for (const prompt of prompts) {
      const examples = renderer.parse(prompt, {}).filter(token => token.type === 'fence' && ['vega-lite', 'metric'].includes(token.info));
      expect(examples).toHaveLength(2);
      for (const token of examples) expect(parseVisualizationBlock(token.info as VisualizationKind, token.content).valid).toBe(true);
      expect(prompt).toContain('do not invent or silently fill missing data');
      expect(prompt).toContain('Remote chart data stays disabled');
      expect(prompt).toContain('Do not promise native chart conversion in DOCX or PPTX');
    }
  });

  it.each(['markdown-ai-studio-presentation', 'markdown-ai-studio-presentation-copilot'])('keeps the %s portable reference aligned with canonical prompts', skill => {
    const directory = path.resolve(__dirname, '../../../apps/ai-markdown-studio-vs-community/skills', skill);
    const reference = readFileSync(path.join(directory, 'references/visualizations.md'), 'utf8');
    expect(reference).toContain(createVisualizationAuthoringInstructions());
    expect(readFileSync(path.join(directory, 'SKILL.md'), 'utf8')).toContain('references/visualizations.md');
    expect(validateVisualizationFences(reference)).toEqual([]);
  });

  it('checks real, nested and case-insensitive fences while ignoring fenced tutorials and ordinary JSON examples', () => {
    const bad = '```metric\n{"title":"Debt","value":1,"trend":{"value":-1,"direction":"up"}}\n```';
    expect(validateVisualizationFences(chart + '\n\n' + metric)).toEqual([]);
    expect(validateVisualizationFences('````markdown\n' + bad + '\n````\n\n```json\n{"unknown":true}\n```')).toEqual([]);
    const nested = bad.split('\n').map(line => '> ' + line).join('\n');
    expect(validateVisualizationFences(nested)[0]).toContain('metric block at body line 1');
    expect(validateVisualizationFences(bad.replace('```metric', '```METRIC'))).toHaveLength(1);
  });

  it('accepts every chart in the supported gallery through the AI validation boundary', () => {
    const gallery = readFileSync(path.resolve(__dirname, '../../../examples/vega-lite-chart-gallery.md'), 'utf8');
    expect(validateVisualizationFences(gallery)).toEqual([]);
    const instructions = createVisualizationAuthoringInstructions();
    for (const feature of ['area', 'point', 'arc', 'rect', 'boxplot', 'tick', 'geoshape', 'image', 'errorband', 'hconcat', 'facet', 'repeat', 'xOffset', 'aggregate: "count"']) {
      expect(instructions).toContain(feature);
    }
  });

  it('reports invalid blocks through both shared AI validators without discarding valid content', () => {
    const body = '# Dashboard\n\n' + chart + '\n\n' + metric;
    const document = '---\nfilename: dashboard.md\ntheme: auto\n---\n' + body;
    const presentation = '---\nfilename: dashboard.md\ndocument: presentation\ntitle: Dashboard\ntheme: auto\nratio: 16:9\n---\n' + body + '\n\n<!--notes: Explain the data.-->\n\n---\n# Summary\n\nTakeaway.\n\n<!--notes: Close.-->';
    expect(validateMarkdownStudioDocument(document).valid).toBe(true);
    expect(validateMarkdownStudioPresentation(presentation).valid).toBe(true);
    for (const [source, validate] of [[document, validateMarkdownStudioDocument], [presentation, validateMarkdownStudioPresentation]] as const) {
      const result = validate(source + '\n\n```vega-lite\n{"data":{"url":"https://example.invalid"}}\n```');
      expect(result.valid).toBe(false);
      expect(result.issues.some(issue => issue.includes('vega-lite block at body line'))).toBe(true);
    }
  });
});
