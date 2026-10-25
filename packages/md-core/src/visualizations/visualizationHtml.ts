import { chartTitle, parseVisualizationBlock, type MetricSpec, type VisualizationKind } from './visualizationSpec';

const maxErrorSourceLength = 16_384;

export function renderVisualizationBlock(kind: VisualizationKind, source: string): string {
  const result = parseVisualizationBlock(kind, source);
  if (!result.valid) {
    const truncated = source.length > maxErrorSourceLength;
    return `<section class="md-visualization md-visualization-error" role="group" aria-label="Invalid ${kind} block" data-md-visualization-state="error">
<p class="md-visualization-title">Invalid ${kind} block</p>
<p class="md-visualization-error-message">${escapeHtml(result.error)}</p>
${sourceDetails(kind, source.slice(0, maxErrorSourceLength), true)}
${truncated ? '<p>Source preview truncated. The complete definition remains in the Markdown document.</p>' : ''}
</section>\n`;
  }
  if (result.block.kind === 'metric') return metricHtml(result.block.spec, source);
  const title = chartTitle(result.block.spec);
  return `<section class="md-visualization md-visualization-chart" role="group" aria-label="${escapeHtml(title)}" data-md-visualization="vega-lite" data-md-visualization-state="pending">
<p class="md-visualization-title">${escapeHtml(title)}</p>
<div class="md-visualization-canvas"></div>
${sourceDetails('vega-lite', source, true)}
</section>\n`;
}

function metricHtml(spec: MetricSpec, source: string): string {
  const trend = spec.trend;
  const direction = trend ? { up: ['↑', 'Up'], down: ['↓', 'Down'], flat: ['→', 'Unchanged'] }[trend.direction] : undefined;
  const trendText = trend ? [trend.value > 0 ? `+${trend.value}` : String(trend.value), trend.unit, trend.period].filter(Boolean).join(' ') : '';
  return `<section class="md-visualization md-metric" role="group" aria-label="${escapeHtml(spec.title)}" data-md-visualization="metric" data-md-visualization-state="rendered">
<p class="md-metric-title">${escapeHtml(spec.title)}</p>
<p class="md-metric-value"><strong>${escapeHtml(String(spec.value))}</strong>${spec.unit ? ` <span class="md-metric-unit">${escapeHtml(spec.unit)}</span>` : ''}</p>
${spec.subtitle ? `<p class="md-metric-subtitle">${escapeHtml(spec.subtitle)}</p>` : ''}
${direction ? `<p class="md-metric-trend"><span aria-hidden="true">${direction[0]}</span> ${direction[1]}: ${escapeHtml(trendText)}</p>` : ''}
${sourceDetails('metric', source, false)}
</section>\n`;
}

function sourceDetails(kind: VisualizationKind, source: string, open: boolean): string {
  return `<details class="md-visualization-source"${open ? ' open' : ''}><summary>${kind === 'metric' ? 'Metric source' : 'Chart source (Vega-Lite)'}</summary><pre><code class="language-json">${escapeHtml(source)}</code></pre></details>`;
}
function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
