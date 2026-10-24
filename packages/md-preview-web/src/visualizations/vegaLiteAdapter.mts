import { compile, type TopLevelSpec } from 'vega-lite';
import { parse, View, logger, Warn } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import type { VisualizationAdapter } from './visualizationTypes.js';

export const vegaLiteAdapter: VisualizationAdapter = {
  kind: 'vega-lite',
  async mount(container, block, { theme, signal }) {
    if (block.kind !== 'vega-lite') throw new Error('Unsupported visualization specification.');
    signal.throwIfAborted();
    const spec = block.spec;
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
    let width = container.clientWidth;
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
      const compiled = compile({
        width: 'container', height: 280,
        autosize: { type: 'fit', contains: 'padding' },
        ...spec,
        mark: typeof spec.mark === 'string'
          ? { type: spec.mark, tooltip: spec.encoding.tooltip !== null }
          : { tooltip: spec.encoding.tooltip !== null, ...spec.mark },
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
          sanitize: async () => { throw new Error('Visualization links and images are disabled.'); },
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
          if (disposed || nextWidth <= 0 || nextWidth === width) return;
          width = nextWidth;
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
