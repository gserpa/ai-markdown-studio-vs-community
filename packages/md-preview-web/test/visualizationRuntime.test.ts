import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createMarkdownRenderer, sanitizeRenderedHtml } from '@mfo/core';
import { createVisualizationRuntime } from '../src/visualizations/visualizationRuntime.mjs';
import type { VisualizationAdapter, VisualizationHandle } from '../src/visualizations/visualizationTypes';

const chart = (title = 'Debt') => ({ title, data: { values: [{ year: '2025', debt: 89.2 }] }, mark: 'bar', encoding: { x: { field: 'year', type: 'ordinal' }, y: { field: 'debt', type: 'quantitative' } } });
const renderer = createMarkdownRenderer();
const html = (title = 'Debt') => sanitizeRenderedHtml(renderer.render('```vega-lite\n' + JSON.stringify(chart(title)) + '\n```'));
const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

function setup(customMount?: VisualizationAdapter['mount']) {
  const dom = new JSDOM('<!doctype html><html><head></head><body>' + html() + '</body></html>', { pretendToBeVisual: true });
  const resize = { callback: undefined as ResizeObserverCallback | undefined, disconnect: vi.fn(), observe: vi.fn(), unobserve: vi.fn() };
  Object.assign(dom.window, {
    ResizeObserver: class {
      constructor(callback: ResizeObserverCallback) { resize.callback = callback; }
      observe = resize.observe;
      unobserve = resize.unobserve;
      disconnect = resize.disconnect;
    },
  });
  const handles: Array<VisualizationHandle & { dispose: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn> }> = [];
  const mount = vi.fn<VisualizationAdapter['mount']>(customMount ?? (async container => {
    container.textContent = 'Rendered chart';
    const handle = { dispose: vi.fn(() => container.replaceChildren()), resize: vi.fn() };
    handles.push(handle);
    return handle;
  }));
  const runtime = createVisualizationRuntime(dom.window.document.body, [{ kind: 'vega-lite', mount }]);
  cleanups.push(() => { runtime.dispose(); dom.window.close(); });
  return { dom, document: dom.window.document, runtime, mount, handles, resize };
}

describe('visualization coordinator', () => {
  it('passes the trusted image setting to adapters and rechecks it after changes', async () => {
    const { document, runtime, mount } = setup();
    await runtime.refresh();
    expect(mount.mock.calls[0][2].allowRemoteImages).toBe(false);
    document.body.dataset.mdChartRemoteImages = 'true';
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
    expect(mount.mock.calls[1][2].allowRemoteImages).toBe(true);
  });
  it('keeps successful source accessible and reuses unchanged charts', async () => {
    const { document, runtime, mount } = setup();
    await runtime.refresh();
    const block = document.querySelector<HTMLElement>('.md-visualization-chart')!;
    expect(block.dataset.mdVisualizationState).toBe('rendered');
    expect(block.querySelector('details')!.open).toBe(false);
    expect(block.querySelector('code')!.textContent).toContain('89.2');
    document.body.append(document.createElement('p'));
    await runtime.refresh();
    expect(mount).toHaveBeenCalledTimes(1);
  });

  it('revalidates spoofed placeholders before calling any adapter', async () => {
    const { document, runtime, mount } = setup();
    const code = document.querySelector('code')!;
    code.textContent = JSON.stringify({ ...chart(), data: { url: 'https://example.invalid/private' } });
    await runtime.refresh();
    expect(mount).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLElement>('.md-visualization-chart')!.dataset.mdVisualizationState).toBe('error');
    expect(document.querySelector('details')!.open).toBe(true);
    expect(document.querySelector('.md-visualization-error-message')!.textContent).toContain('data.url');
  });

  it('isolates mount failures and displays error messages as text', async () => {
    const { document, runtime } = setup(async (container, block) => {
      if (block.spec.title === 'Debt') throw new Error('<img src=x onerror=alert(1)>');
      container.textContent = 'Good chart';
      return { resize() {}, dispose() { container.replaceChildren(); } };
    });
    document.body.insertAdjacentHTML('beforeend', html('Good chart'));
    await runtime.refresh();
    expect(document.querySelectorAll('[data-md-visualization-state="error"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-md-visualization-state="rendered"]')).toHaveLength(1);
    expect(document.querySelector('img, [onerror]')).toBeNull();
    expect(document.querySelector('.md-visualization-error-message')!.textContent).toContain('<img');
  });

  it('automatically applies changed theme values and finalizes the previous handle', async () => {
    const { document, runtime, mount, handles } = setup();
    await runtime.refresh();
    document.body.style.color = 'rgb(200, 210, 220)';
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
    expect(handles[0].dispose).toHaveBeenCalledTimes(1);
    expect(mount.mock.calls[1][2].theme.foreground).toBe('rgb(200, 210, 220)');
  });

  it('resizes the existing handle without compiling a new chart', async () => {
    const { document, runtime, mount, handles, resize } = setup();
    await runtime.refresh();
    const canvas = document.querySelector<HTMLElement>('.md-visualization-canvas')!;
    Object.defineProperty(canvas, 'clientWidth', { value: 420 });
    resize.callback!([{ target: canvas } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    expect(handles[0].resize).toHaveBeenCalledWith(420);
    expect(mount).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['#111111', '#0d0d0d', '#8f8f8f', '#8f8f8f'],
    ['rgb(17, 17, 17)', 'rgb(13 13 13)', '#aaa', '#aaa'],
    ['#4f46d8', '#ffffff', '#c7d2fe', '#4f46d8'],
    ['var(--custom-color)', '#0d0d0d', '#aaa', 'var(--custom-color)'],
  ])('uses a readable presentation accent without overriding unsupported CSS colors (%s)', async (accent, background, alternate, expected) => {
    const { document, runtime, mount } = setup();
    const wrapper = document.createElement('div');
    wrapper.className = 'presentation-preview';
    document.body.append(wrapper);
    const block = document.querySelector<HTMLElement>('.md-visualization-chart')!;
    wrapper.append(block);
    block.style.setProperty('--presentation-accent', accent);
    block.style.setProperty('--presentation-panel-bg', background);
    block.style.setProperty('--presentation-accent-soft', alternate);
    await runtime.refresh();
    expect(mount.mock.calls.at(-1)![2].theme.accent).toBe(expected);
    expect(mount.mock.calls.at(-1)![2].theme.palette[0]).toBe(expected);
  });

  it('disposes a delayed result after a newer specification has finished', async () => {
    let finish!: (handle: VisualizationHandle) => void;
    const stale = { resize: vi.fn(), dispose: vi.fn() };
    const { document, runtime, mount } = setup(async (container, block) => {
      if (block.spec.title === 'Debt') return new Promise(resolve => { finish = resolve; });
      container.textContent = 'New chart';
      return { resize() {}, dispose() { container.replaceChildren(); } };
    });
    const previous = runtime.refresh();
    document.querySelector('code')!.textContent = JSON.stringify(chart('New chart'));
    await runtime.refresh();
    expect(mount.mock.calls[0][2].signal.aborted).toBe(true);
    finish(stale);
    await previous;
    expect(stale.dispose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.md-visualization-canvas')!.textContent).toBe('New chart');
    expect(document.querySelector<HTMLElement>('.md-visualization-chart')!.dataset.mdVisualizationState).toBe('rendered');
  });

  it('disposes pending instances whose block is removed', async () => {
    let finish!: (handle: VisualizationHandle) => void;
    const handle = { resize: vi.fn(), dispose: vi.fn() };
    const { document, runtime, mount } = setup(async () => new Promise(resolve => { finish = resolve; }));
    const pending = runtime.refresh();
    document.querySelector('.md-visualization-chart')!.remove();
    await runtime.refresh();
    expect(mount.mock.calls[0][2].signal.aborted).toBe(true);
    finish(handle);
    await pending;
    expect(handle.dispose).toHaveBeenCalledTimes(1);
  });

  it('cleans up observers and restores readable fallback on disposal', async () => {
    const { document, runtime, mount, handles, resize } = setup();
    await runtime.refresh();
    runtime.dispose();
    runtime.dispose();
    document.body.style.color = 'red';
    await runtime.refresh();
    expect(mount).toHaveBeenCalledTimes(1);
    expect(handles[0].dispose).toHaveBeenCalledTimes(1);
    expect(resize.disconnect).toHaveBeenCalledTimes(1);
    expect(document.querySelector('details')!.open).toBe(true);
    expect(document.querySelector('.md-visualization-canvas')!.childElementCount).toBe(0);
  });
});
