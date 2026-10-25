import { chartTitle, parseVisualizationBlock, type VisualizationKind } from '@mfo/core/visualizations';
import type { VisualizationAdapter, VisualizationHandle, VisualizationTheme } from './visualizationTypes.js';

type Entry = {
  signature: string;
  abort: AbortController;
  promise: Promise<void>;
  handle?: VisualizationHandle;
  canvas?: HTMLElement;
};

export function createVisualizationRuntime(root: HTMLElement, adapters: readonly VisualizationAdapter[]) {
  const document = root.ownerDocument;
  const win = document.defaultView!;
  const registry = new Map(adapters.map(adapter => [adapter.kind, adapter]));
  const entries = new Map<HTMLElement, Entry>();
  const selector = 'section.md-visualization-chart[data-md-visualization]';
  let disposed = false;
  let frame = 0;

  function remove(entry: Entry) {
    const handle = entry.handle;
    entry.handle = undefined;
    entry.abort.abort();
    handle?.dispose();
    if (entry.canvas) resizeObserver?.unobserve(entry.canvas);
  }

  function errorBlock(block: HTMLElement, error: unknown) {
    block.dataset.mdVisualizationState = 'error';
    let message = block.querySelector<HTMLElement>(':scope > .md-visualization-error-message');
    if (!message) {
      message = document.createElement('p');
      message.className = 'md-visualization-error-message';
      block.append(message);
    }
    message.textContent = `Chart could not be rendered. ${error instanceof Error ? error.message.slice(0, 500) : 'Invalid visualization.'}`;
    const source = block.querySelector<HTMLDetailsElement>(':scope > details.md-visualization-source');
    if (source) source.open = true;
  }

  async function render(block: HTMLElement, entry: Entry, source: string, theme: VisualizationTheme) {
    try {
      const kind = block.dataset.mdVisualization as VisualizationKind;
      const adapter = registry.get(kind);
      if (!adapter) throw new Error('Unsupported visualization type.');
      // Markers may come from raw document HTML. Revalidate at this boundary.
      const result = parseVisualizationBlock(kind, source);
      if (!result.valid) throw new Error(result.error);
      const title = result.block.kind === 'vega-lite' ? chartTitle(result.block.spec) : result.block.spec.title;
      block.setAttribute('aria-label', title);
      const heading = block.querySelector<HTMLElement>(':scope > .md-visualization-title');
      if (heading && heading.textContent !== title) heading.textContent = title;
      block.querySelector(':scope > .md-visualization-error-message')?.remove();
      block.querySelector(':scope > .md-visualization-canvas')?.remove();
      const canvas = document.createElement('div');
      canvas.className = 'md-visualization-canvas';
      block.prepend(canvas);
      entry.canvas = canvas;
      block.dataset.mdVisualizationState = 'rendering';
      const handle = await adapter.mount(canvas, result.block, { theme, signal: entry.abort.signal,
        allowRemoteImages: document.body.dataset.mdChartRemoteImages === 'true' });
      if (disposed || entry.abort.signal.aborted || entries.get(block) !== entry || !root.contains(block)) {
        handle.dispose();
        return;
      }
      entry.handle = handle;
      resizeObserver?.observe(canvas);
      block.dataset.mdVisualizationState = 'rendered';
      const disclosure = block.querySelector<HTMLDetailsElement>(':scope > details.md-visualization-source');
      if (disclosure) disclosure.open = false;
    } catch (error) {
      if (!disposed && !entry.abort.signal.aborted && entries.get(block) === entry) errorBlock(block, error);
    }
  }

  async function refresh() {
    if (disposed) return;
    for (const [block, entry] of entries) {
      if (!root.contains(block) || !block.matches(selector)) { remove(entry); entries.delete(block); }
    }
    let changed = false;
    for (const block of root.querySelectorAll<HTMLElement>(selector)) {
      const source = block.querySelector(':scope > details.md-visualization-source > pre > code')?.textContent ?? '';
      const theme = readTheme(block);
      const signature = JSON.stringify([block.dataset.mdVisualization, source, theme, document.body.dataset.mdChartRemoteImages]);
      const previous = entries.get(block);
      if (previous?.signature === signature) continue;
      if (previous) remove(previous);
      const entry: Entry = { signature, abort: new AbortController(), promise: Promise.resolve() };
      entries.set(block, entry);
      entry.promise = render(block, entry, source, theme);
      changed = true;
    }
    await Promise.all([...entries.values()].map(entry => entry.promise));
    if (changed && !disposed) document.dispatchEvent(new win.Event('md-visualizations-rendered'));
  }

  function schedule() {
    if (disposed || frame) return;
    frame = win.requestAnimationFrame(() => { frame = 0; void refresh(); });
  }

  const resizeObserver = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(records => {
    for (const record of records) {
      const canvas = record.target as HTMLElement;
      const block = canvas.parentElement;
      const entry = block ? entries.get(block) : undefined;
      if (entry?.handle) {
        Promise.resolve(entry.handle.resize(canvas.clientWidth)).catch(error => {
          if (!disposed && !entry.abort.signal.aborted && block && entries.get(block) === entry) {
            remove(entry);
            errorBlock(block, error);
          }
        });
      }
    }
  }) : undefined;

  const observer = new win.MutationObserver(records => {
    if (records.some(record => {
      const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
      // Rendering and tooltip text must not trigger another rendering pass.
      return !target?.closest('.md-visualization-canvas, .md-visualization-tooltip');
    })) schedule();
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'style', 'data-document-theme', 'data-document-theme-mode', 'data-presentation-theme', 'data-md-host-scheme', 'data-md-visualization', 'data-md-chart-remote-images'],
  });
  const media = win.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener('change', schedule);
  const stylesheetLoaded = (event: Event) => { if ((event.target as Element)?.tagName === 'LINK') schedule(); };
  document.addEventListener('load', stylesheetLoaded, true);

  function dispose() {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    resizeObserver?.disconnect();
    media?.removeEventListener('change', schedule);
    document.removeEventListener('load', stylesheetLoaded, true);
    win.removeEventListener('pagehide', dispose);
    if (frame) win.cancelAnimationFrame(frame);
    for (const [block, entry] of entries) {
      remove(entry);
      if (['rendered', 'rendering'].includes(block.dataset.mdVisualizationState ?? '')) block.dataset.mdVisualizationState = 'pending';
      const source = block.querySelector<HTMLDetailsElement>(':scope > details.md-visualization-source');
      if (source) source.open = true;
    }
    entries.clear();
  }
  win.addEventListener('pagehide', dispose, { once: true });
  return { refresh, dispose };
}

function readTheme(block: HTMLElement): VisualizationTheme {
  const style = block.ownerDocument.defaultView!.getComputedStyle(block);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const presentation = !!block.closest('.presentation-preview');
  const background = token(presentation ? '--presentation-panel-bg' : '--md-preview-code-bg', '#ffffff');
  let accent = token(presentation ? '--presentation-accent' : '--md-preview-link-color', '#0969da');
  if (presentation) {
    // Some slide themes use a near-black accent on a dark panel. Prefer their
    // companion accent when the default would make data marks disappear.
    const alternate = token('--presentation-accent-soft', style.color);
    const contrast = colorContrast(accent, background);
    const alternateContrast = colorContrast(alternate, background);
    if (contrast !== undefined && alternateContrast !== undefined && contrast < 3 && alternateContrast > contrast) accent = alternate;
  }
  const dark = style.colorScheme?.includes('dark') ?? false;
  return {
    foreground: style.color || '#24292f',
    muted: token(presentation ? '--presentation-muted-color' : '--md-preview-muted-color', style.color),
    border: style.borderTopColor || '#d0d7de',
    background,
    accent,
    palette: [accent, ...(dark ? ['#ffb454', '#c5a3ff', '#56d4ae', '#ff92b7'] : ['#ad5c00', '#7951b0', '#007b63', '#b83265'])],
    fontFamily: style.fontFamily || 'system-ui, sans-serif',
  };
}

function colorContrast(first: string, second: string): number | undefined {
  const luminance = (color: string) => {
    const hex = /^#([a-f\d]{3}|[a-f\d]{6})$/iu.exec(color)?.[1];
    const rgb = /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*1(?:\.0*)?)?\s*\)$/iu.exec(color);
    // Leave CSS functions, gradients and translucent surfaces to the theme.
    const channels = hex
      ? (hex.length === 3 ? [...hex].map(value => value + value) : hex.match(/../gu)!).map(value => Number.parseInt(value, 16))
      : rgb ? rgb.slice(1, 4).map(Number) : undefined;
    if (!channels) return undefined;
    const linear = channels.map(value => { const normalized = Math.min(255, value) / 255; return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4; });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const a = luminance(first), b = luminance(second);
  return a === undefined || b === undefined ? undefined : (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
