import * as path from 'node:path';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMarkdownRenderer, sanitizeRenderedHtml } from '../src/render/markdownRenderer';

const metric = { title: 'Portuguese Public Debt', value: 89.2, unit: '% GDP', subtitle: '2025', trend: { value: -22, unit: 'percentage points', period: 'since 2022', direction: 'down' } };
const chart = { title: 'Debt', data: { values: [{ year: '2025', debt: 89.2 }] }, mark: 'bar', encoding: { x: { field: 'year', type: 'ordinal' }, y: { field: 'debt', type: 'quantitative' } } };
const fence = (kind: string, value: unknown) => '```' + kind + '\n' + JSON.stringify(value, null, 2) + '\n```';
let browserBundle: string;

beforeAll(() => {
  browserBundle = buildSync({
    absWorkingDir: path.resolve(__dirname, '..'), entryPoints: ['src/browser.ts'],
    bundle: true, platform: 'browser', format: 'iife', write: false,
  }).outputFiles[0].text;
});

describe.each(['server', 'browser'] as const)('%s visualization rendering', mode => {
  function render(source: string) {
    if (mode === 'server') return new JSDOM(sanitizeRenderedHtml(createMarkdownRenderer().render(source)));
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
    // jsdom omits this browser global; real browser/Webview hosts provide it.
    Object.assign(dom.window, { TextEncoder });
    dom.window.eval(browserBundle);
    const render = (dom.window as unknown as { renderMarkdownToHtml: (source: string) => string }).renderMarkdownToHtml;
    dom.window.document.body.innerHTML = render(source);
    return dom;
  }

  it('renders semantic metric cards with the complete original source', () => {
    const dom = render(fence('metric', metric));
    try {
      const card = dom.window.document.querySelector('.md-metric')!;
      expect(card.getAttribute('role')).toBe('group');
      expect(card.getAttribute('aria-label')).toBe(metric.title);
      expect(card.querySelector('.md-metric-title')?.textContent).toBe(metric.title);
      expect(card.querySelector('.md-metric-value strong')?.textContent).toBe('89.2');
      expect(card.querySelector('.md-metric-unit')?.textContent).toBe('% GDP');
      expect(card.querySelector('.md-metric-subtitle')?.textContent).toBe('2025');
      expect(card.querySelector('.md-metric-trend')?.textContent).toContain('Down: -22 percentage points since 2022');
      expect(card.querySelector('.md-metric-trend [aria-hidden="true"]')?.textContent).toBe('↓');
      expect(card.querySelector('details')?.open).toBe(false);
      expect(JSON.parse(card.querySelector('code')!.textContent!)).toEqual(metric);
    } finally { dom.window.close(); }
  });

  it('keeps charts readable and preserves the source for the later runtime', () => {
    const dom = render(fence('VEGA-LITE', chart));
    try {
      const block = dom.window.document.querySelector('[data-md-visualization="vega-lite"]')!;
      expect(block.getAttribute('data-md-visualization-state')).toBe('pending');
      expect(block.getAttribute('aria-label')).toBe('Debt');
      expect(block.querySelector('.md-visualization-canvas')).not.toBeNull();
      expect(block.querySelector('details')?.open).toBe(true);
      expect(block.querySelector('code')!.textContent).toBe(JSON.stringify(chart, null, 2) + '\n');
    } finally { dom.window.close(); }
  });

  it('escapes every displayed metric string and chart source', () => {
    const hostile = '<img src=x onerror="alert(1)"></code><script>alert(2)</script>&quot;';
    const source = [fence('metric', { ...metric, title: hostile, unit: hostile, subtitle: hostile, trend: { value: 1, direction: 'up', unit: hostile, period: hostile } }), fence('vega-lite', { ...chart, title: hostile })].join('\n\n');
    const dom = render(source);
    try {
      expect(dom.window.document.querySelector('img, script, [onerror]')).toBeNull();
      expect(dom.window.document.querySelector('.md-metric-title')?.textContent).toBe(hostile);
      // DOMPurify may discard labels containing closing-tag text; visible text
      // and source must still survive, without weakening its attribute checks.
      expect([null, hostile]).toContain(dom.window.document.querySelector('.md-metric')?.getAttribute('aria-label'));
      expect(dom.window.document.querySelector('.md-metric-unit')?.textContent).toBe(hostile);
      expect(JSON.parse(dom.window.document.querySelector('.md-visualization-chart code')!.textContent!).title).toBe(hostile);
    } finally { dom.window.close(); }
  });

  it('isolates invalid blocks while preserving Markdown, Mermaid, and valid cards', () => {
    const invalid = '```vega-lite\n{"<img src=x onerror=alert(1)>": true}\n```';
    const source = ['# Dashboard', invalid, fence('metric', { title: 'Zero', value: 0 }), '```mermaid\nflowchart TD\nA-->B\n```', '```json\n{"title":"ordinary code"}\n```', 'End of document.'].join('\n\n');
    const dom = render(source);
    try {
      expect(dom.window.document.querySelector('h1')?.textContent).toBe('Dashboard');
      expect(dom.window.document.querySelectorAll('.md-visualization-error')).toHaveLength(1);
      expect(dom.window.document.querySelector('.md-visualization-error [data-md-visualization]')).toBeNull();
      expect(dom.window.document.querySelectorAll('.md-metric')).toHaveLength(1);
      expect(dom.window.document.querySelector('.mermaid')?.textContent).toContain('A-->B');
      expect(dom.window.document.querySelector('img, script, [onerror]')).toBeNull();
      expect(dom.window.document.body.textContent).toContain('ordinary code');
      expect(dom.window.document.body.textContent).toContain('End of document.');
    } finally { dom.window.close(); }
  });

  it('caps oversized invalid source previews without changing the Markdown source', () => {
    const source = '```metric\n' + 'x'.repeat(140_000) + '\n```';
    const dom = render(source);
    try {
      expect(dom.window.document.querySelector('.md-visualization-error')?.textContent).toContain('UTF-8 bytes');
      expect(dom.window.document.querySelector('code')!.textContent).toHaveLength(16_384);
      expect(dom.window.document.body.textContent).toContain('complete definition remains in the Markdown');
    } finally { dom.window.close(); }
  });
});
