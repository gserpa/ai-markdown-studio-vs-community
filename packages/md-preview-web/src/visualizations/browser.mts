import { createVisualizationRuntime } from './visualizationRuntime.mjs';
import { vegaLiteAdapter } from './vegaLiteAdapter.mjs';

// Expose lifecycle methods only. Libraries and View instances stay module-local.
const host = window as unknown as { __mfoVisualizationsRuntime?: ReturnType<typeof createVisualizationRuntime> };
host.__mfoVisualizationsRuntime?.dispose();
host.__mfoVisualizationsRuntime = createVisualizationRuntime(document.body, [vegaLiteAdapter]);
void host.__mfoVisualizationsRuntime.refresh();
