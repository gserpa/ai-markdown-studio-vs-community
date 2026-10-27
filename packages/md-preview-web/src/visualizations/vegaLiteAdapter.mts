import { compile, type TopLevelSpec } from 'vega-lite';
import { parse, View, logger, Warn } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { chartImageUrls, prepareVegaLiteSpec, validateChartImageUrl } from '@mfo/core/visualizations';
import type { VisualizationAdapter } from './visualizationTypes.js';

export const vegaLiteAdapter: VisualizationAdapter = {
  kind: 'vega-lite',
  async mount(container, block, { theme, signal, allowRemoteImages = false }) {
    if (block.kind !== 'vega-lite') throw new Error('Unsupported visualization specification.');
    signal.throwIfAborted();
    const spec = block.spec;
    const imageUrls = chartImageUrls(spec);
    if (!allowRemoteImages && imageUrls.some(url => url.startsWith('https:'))) {
      throw new Error('Remote chart images are disabled by allowRemoteResources. Use an inline raster image or enable remote resources.');
    }
    await Promise.all(imageUrls.map(url => new Promise<void>((resolve, reject) => {
      const image = new container.ownerDocument.defaultView!.Image();
      const cleanup = () => { image.onload = image.onerror = null; signal.removeEventListener('abort', abort); };
      const abort = () => { cleanup(); image.src = ''; reject(signal.reason ?? new Error('Chart rendering was cancelled.')); };
      image.onload = () => { cleanup(); resolve(); };
      image.onerror = () => { cleanup(); reject(new Error('A chart image could not be loaded. Check its URL and image policy.')); };
      image.crossOrigin = 'anonymous';
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      image.src = url;
    })));
    signal.throwIfAborted();
    const tooltip = container.ownerDocument.createElement('div');
    tooltip.className = 'md-visualization-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    tooltip.style.color = theme.foreground;
    tooltip.style.background = theme.background;
    tooltip.style.borderColor = theme.border;
    container.ownerDocument.body.append(tooltip);
    let view: View | undefined;
    let disposed = false;
    // A slide chart has an intrinsic box. Whole-slide fitting may expand its parent;
    // that expansion must not redraw the chart and undo proportional scaling.
    const slideSized = !!container.closest('[data-presentation-content-fit]')
      && !!container.closest('.presentation-standard-content, .presentation-accent-content')
      && (spec.width === undefined || spec.width === 'container' || typeof spec.width === 'number')
      && !spec.spec && !spec.concat && !spec.hconcat && !spec.vconcat;
    if (slideSized) {
      container.dataset.mdChartSizing = 'slide';
      if (typeof spec.width === 'number') container.dataset.mdChartWidth = String(spec.width);
      if (typeof spec.height === 'number') container.dataset.mdChartHeight = String(spec.height);
    }
    const dimensions = () => ({
      width: slideSized ? Number(container.dataset.mdChartWidth) || parseFloat(container.style.getPropertyValue('--md-slide-chart-width')) || container.clientWidth || 640 : container.clientWidth,
      height: slideSized ? Number(container.dataset.mdChartHeight) || parseFloat(container.style.getPropertyValue('--md-slide-chart-height')) || 280 : undefined,
    });
    let { width, height } = dimensions();
    let renderError: Error | undefined;
    const runtimeLogger = logger(Warn);
    // Vega reports some dataflow failures through its logger rather than rejecting.
    runtimeLogger.error = (...messages: unknown[]) => {
      renderError ??= new Error(messages.map(String).join(' ').slice(0, 500));
      return runtimeLogger;
    };
    const hideTooltip = () => { tooltip.hidden = true; };
    const win = container.ownerDocument.defaultView!;
    function dispose() {
      if (disposed) return;
      disposed = true;
      signal.removeEventListener('abort', dispose);
      win.removeEventListener('scroll', hideTooltip, true);
      win.removeEventListener('blur', hideTooltip);
      container.ownerDocument.removeEventListener('md-document-updated', hideTooltip);
      view?.finalize();
      tooltip.remove();
      container.replaceChildren();
    }
    try {
      // Defaults make ordinary specifications responsive; explicit dimensions win.
      const prepared = prepareVegaLiteSpec(spec, width, height);
      if (slideSized && typeof spec.width !== 'number') prepared.width = width;
      const compiled = compile({
        ...prepared,
        config: {
          background: 'transparent', font: theme.fontFamily,
          mark: { color: theme.accent },
          axis: { labelColor: theme.foreground, titleColor: theme.foreground, domainColor: theme.border, tickColor: theme.border, gridColor: theme.border },
          legend: { labelColor: theme.foreground, titleColor: theme.foreground },
          title: { color: theme.foreground },
          range: { category: theme.palette },
          view: { stroke: null },
        },
      } as TopLevelSpec).spec;
      view = new View(parse(compiled, undefined, { ast: true }), {
        container, renderer: 'svg', hover: true, expr: expressionInterpreter, logger: runtimeLogger,
        // Resource requests can start at construction: never install this later.
        loader: {
          load: async () => { throw new Error('External visualization resources are disabled.'); },
          sanitize: async (uri: string, options?: { context?: string }) => {
            if (options?.context !== 'image') throw new Error('Visualization navigation is disabled.');
            const href = validateChartImageUrl(uri);
            if (!imageUrls.includes(href) || href.startsWith('https:') && !allowRemoteImages) throw new Error('Chart image is outside the approved image policy.');
            return { href, crossOrigin: 'anonymous' };
          },
          http: async () => { throw new Error('External visualization resources are disabled.'); },
          file: async () => { throw new Error('External visualization resources are disabled.'); },
        },
        tooltip: (_handler, event, _item, value) => {
          tooltip.hidden = value == null;
          tooltip.textContent = value == null ? '' : typeof value === 'object'
            ? Object.entries(value).map(([key, entry]) => `${key}: ${String(entry)}`).join('\n') : String(value);
          if (event && value != null) {
            // Keep the tooltip outside presentation transforms, inside the viewport.
            const x = Math.max(8, Math.min(event.clientX + 12, win.innerWidth - tooltip.offsetWidth - 8));
            const y = Math.max(8, Math.min(event.clientY + 12, win.innerHeight - tooltip.offsetHeight - 8));
            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
          }
        },
      });
      signal.addEventListener('abort', dispose, { once: true });
      win.addEventListener('scroll', hideTooltip, { capture: true, passive: true });
      win.addEventListener('blur', hideTooltip);
      container.ownerDocument.addEventListener('md-document-updated', hideTooltip);
      await view.runAsync();
      signal.throwIfAborted();
      if (renderError) throw renderError;
      return {
        async resize(nextWidth) {
          const next = slideSized ? dimensions() : { width: nextWidth, height: undefined };
          if (disposed || next.width <= 0 || (next.width === width && next.height === height)) return;
          width = next.width;
          height = next.height;
          if (slideSized) {
            if (typeof spec.width !== 'number') view!.width(width);
            if (spec.height === undefined && height !== undefined) view!.height(height);
          }
          hideTooltip();
          // Vega 6.4 also observes responsive containers, including hidden slides.
          await view!.resize().runAsync();
          if (renderError) throw renderError;
        },
        dispose,
      };
    } catch (error) {
      dispose();
      throw error;
    }
  },
};
