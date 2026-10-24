import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createMarkdownRenderer, sanitizeRenderedHtml } from '@mfo/core';
import { createVisualizationRuntime } from '../src/visualizations/visualizationRuntime.mjs';
import type { VisualizationAdapter } from '../src/visualizations/visualizationTypes';

const script = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'preview.js'), 'utf8');
const renderer = createMarkdownRenderer();
const chart = (title = 'Debt') => '```vega-lite\n' + JSON.stringify({ title, mark: 'bar', data: { values: [{ x: 'A', y: 1 }] }, encoding: { x: { field: 'x', type: 'nominal' }, y: { field: 'y', type: 'quantitative' } } }) + '\n```';
const shell = (source: string, metadata = '') => `<div class="document-preview-shell">${metadata}<div class="document-preview-scroll"><main class="markdown-body">${sanitizeRenderedHtml(renderer.render(source))}</main></div></div>`;
const rich = '\n\n```mermaid\ngraph LR\nA-->B\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n![Image](data:image/png;base64,AA==)\n\n- [x] Done\n\n[Example](https://example.com)';
const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

async function setup(source: string, customMount?: VisualizationAdapter['mount']) {
  const dom = new JSDOM(`<body data-preview-mode="document">${shell(source)}</body>`, { runScripts: 'outside-only', pretendToBeVisual: true });
  const bridge = { previewSessionId: 'session', previewReady: vi.fn(), documentUpdateResult: vi.fn(), resolveImage: vi.fn(), openLink: vi.fn() };
  const observers: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
  const handles: Array<{ dispose: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn> }> = [];
  const mount = vi.fn<VisualizationAdapter['mount']>(customMount ?? (async canvas => {
    canvas.textContent = 'chart';
    const handle = { dispose: vi.fn(() => canvas.replaceChildren()), resize: vi.fn() };
    handles.push(handle);
    return handle;
  }));
  const mermaid = {
    initialize: vi.fn(),
    render: vi.fn(async (id: string, _source: string) => ({ svg: `<svg id="${id}" viewBox="0 0 100 100"><text>Diagram</text></svg>` })),
  };
  Object.assign(dom.window, {
    __previewBridge: bridge, mermaid,
    ResizeObserver: class {
      disconnect = vi.fn(); observe = vi.fn(); unobserve = vi.fn();
      constructor() { observers.push(this); }
    },
  });
  await dom.window.eval(script);
  dom.window.eval('window.__mfoPreviewModeRuntime.startDocument()');
  const runtime = createVisualizationRuntime(dom.window.document.body, [{ kind: 'vega-lite', mount }]);
  Object.assign(dom.window, { __mfoVisualizationsRuntime: runtime });
  await runtime.refresh();
  let revision = 0;
  const send = (body: string, sessionId = 'session', nextRevision = ++revision) => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { command: 'updateDocument', sessionId, revision: nextRevision, body } }));
  const update = async (next: string, metadata = '') => { send(shell(next, metadata)); await runtime.refresh(); };
  cleanups.push(() => { runtime.dispose(); dom.window.close(); });
  return { dom, document: dom.window.document, bridge, runtime, mount, handles, observers, mermaid, update, send };
}

describe('document preview updates', () => {
  it('preserves unchanged charts, diagrams, table state, images, scrolling and source disclosure', async () => {
    const source = chart() + rich;
    const { document, bridge, mount, handles, mermaid, update } = await setup(source);
    const block = document.querySelector('.md-visualization-chart')!;
    const canvas = block.querySelector('.md-visualization-canvas');
    const details = block.querySelector('details')!;
    details.open = true;
    const diagram = document.querySelector('.mermaid-rendered')!;
    const table = document.querySelector<HTMLElement>('.table-scroll-wrapper')!;
    table.dataset.tableLayout = 'wrap';
    const image = document.querySelector('img');
    const scroller = document.querySelector('.document-preview-scroll')!;
    scroller.scrollTop = 240;
    await update('# Updated prose\n\n' + source, '<aside class="frontmatter-shell">Updated metadata</aside>');
    expect(bridge.previewReady).toHaveBeenCalledOnce();
    expect(bridge.documentUpdateResult).toHaveBeenCalledWith(1, true);
    expect(document.querySelector('.md-visualization-chart')).toBe(block);
    expect(block.querySelector('.md-visualization-canvas')).toBe(canvas);
    expect(details.open).toBe(true);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(handles[0].dispose).not.toHaveBeenCalled();
    expect(document.querySelector('.mermaid-rendered')).toBe(diagram);
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.table-scroll-wrapper')).toBe(table);
    expect(table.dataset.tableLayout).toBe('wrap');
    expect(document.querySelector('img')).toBe(image);
    expect(scroller.scrollTop).toBe(240);
    expect(document.querySelector('.frontmatter-shell')?.textContent).toBe('Updated metadata');
    expect(document.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
    document.querySelector('a')!.dispatchEvent(new document.defaultView!.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(bridge.openLink).toHaveBeenCalledWith('https://example.com');
  });

  it('reuses duplicate blocks in occurrence order, moves distinct blocks and disposes only removed instances', async () => {
    const a = chart('A'), b = chart('B');
    const { document, handles, mount, update } = await setup(a + '\n\n' + a + '\n\n' + b);
    const original = [...document.querySelectorAll('.md-visualization-chart')];
    await update(b + '\n\n' + a + '\n\n' + a);
    expect([...document.querySelectorAll('.md-visualization-chart')]).toEqual([original[2], original[0], original[1]]);
    expect(mount).toHaveBeenCalledTimes(3);
    await update(b + '\n\n' + a + '\n\n' + chart('Changed'));
    expect(handles[1].dispose).toHaveBeenCalledTimes(1);
    expect(handles[0].dispose).not.toHaveBeenCalled();
    expect(handles[2].dispose).not.toHaveBeenCalled();
    expect(mount).toHaveBeenCalledTimes(4);
    await update('No charts remain.');
    expect(handles.every(handle => handle.dispose.mock.calls.length === 1)).toBe(true);
  });

  it('ignores stale sessions and revisions and requests a full reload for a malformed fragment', async () => {
    const { document, bridge, send, update } = await setup(chart());
    const original = document.querySelector('.md-visualization-chart');
    send(shell('Wrong page'), 'old-session', 100);
    expect(document.querySelector('.md-visualization-chart')).toBe(original);
    await update(chart() + '\n\nCurrent');
    send(shell('Out of order'), 'session', 1);
    expect(document.querySelector('main')!.textContent).toContain('Current');
    send('<div>Malformed</div>', 'session', 2);
    expect(bridge.documentUpdateResult).toHaveBeenLastCalledWith(2, false);
    expect(document.querySelector('.md-visualization-chart')).toBe(original);
  });

  it('disconnects observers for removed tables and initializes replacement controls and diagrams', async () => {
    const { document, observers, mermaid, update } = await setup(chart() + rich);
    const tableObserver = observers.find(observer => observer !== observers.at(-1))!;
    await update(chart() + rich.replace('| 1 | 2 |', '| 3 | 4 |').replace('A-->B', 'A-->C'));
    await vi.waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
    expect(tableObserver.disconnect).toHaveBeenCalledOnce();
    expect(document.querySelectorAll('.table-overlay-button')).toHaveLength(1);
    expect(document.querySelector('table')!.textContent).toContain('3');
    expect(document.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
  });

  it('applies a concurrent theme change to retained diagrams', async () => {
    const { document, mermaid, update } = await setup(chart() + rich);
    const diagram = document.querySelector('.mermaid-rendered');
    document.body.classList.add('vscode-dark');
    await update(chart() + rich + '\n\nConcurrent prose edit');
    await vi.waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
    expect(document.querySelector('.mermaid-rendered')).toBe(diagram);
    expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }));
  });

  it('aborts a chart replaced while its asynchronous mount is pending', async () => {
    let finish!: (handle: { resize(): void; dispose(): void }) => void;
    const stale = { resize: vi.fn(), dispose: vi.fn() };
    // Start with no charts so setup can finish before the deliberately slow mount.
    const { runtime, mount, update } = await setup('Initial prose', async () => new Promise(resolve => { finish = resolve; }));
    const pending = update(chart());
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    await update('Chart removed during rendering.');
    expect(mount.mock.calls[0][2].signal.aborted).toBe(true);
    finish(stale);
    await pending;
    await runtime.refresh();
    expect(stale.dispose).toHaveBeenCalledOnce();
  });
});
