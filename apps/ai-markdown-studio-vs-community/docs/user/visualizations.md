# Declarative visualization blocks

Visualization definitions remain in ordinary fenced JSON blocks in Markdown.
Metric blocks render as HTML cards. Chart blocks render as interactive SVG charts
with tooltips, resizing, and colors from the active document or presentation theme.
Other Markdown viewers display the original fenced JSON.

Document previews update after a 150 ms typing pause. Unchanged charts keep their
instances, including repeated identical blocks, and replaced or removed charts
release their resources. Unchanged diagrams, images, table controls, and chart
source disclosures also retain their state. Changing preview mode, theme, or the
required assets reloads the page; presentation edits currently use a full reload.

## HTML export

HTML exports include the same validated chart renderer for documents and
presentations. The self-contained export embeds the runtime; website exports
store it as a shared, fingerprinted asset alongside its complete license notices.
Charts and metrics work offline without a chart service or CDN.

JavaScript enables chart rendering, tooltips, and responsive sizing. If scripts
are disabled or the chart asset cannot load, the chart title and original JSON
remain visible. Metrics remain readable HTML cards. Invalid definitions and
chart rendering errors keep their source fallback without preventing other
content from rendering.

Printed HTML uses the rendered SVG charts and hides tooltips and source
disclosures for successfully rendered blocks. Source remains visible for charts
that could not render. Paper export modes use readable colors on white.

## AI authoring

In **Generate Document (AI)** or **Generate Presentation (AI)**, request the chart
or dashboard and provide the data, units, and dates. For example: “Convert this
table into a line chart and metric cards using these values: …”. The canonical
prompts explain the supported subset and include valid illustrative examples.
The examples are instructions, not replacement data for your document.

The existing AI validation tools check `vega-lite` and `metric` fences. Native
generation attempts one repair when a visualization is invalid and does not save
definitions that remain invalid. Review generated content and verify its data.
**AI Paste to Markdown** preserves existing visualization JSON rather than
inventing charts during faithful format conversion.

Newly installed presentation skills include a
[portable visualization reference](../../skills/markdown-ai-studio-presentation/references/visualizations.md)
for agents that cannot call the extension tools. Generation and validation rules
are shared by Community and Pro. Native chart conversion for DOCX/PPTX is outside
this feature; use preview or HTML export for interactive visualizations.

## Metrics

```metric
{
  "title": "Portuguese Public Debt",
  "value": 89.2,
  "unit": "% GDP",
  "subtitle": "2025",
  "trend": {
    "value": -22,
    "unit": "percentage points",
    "period": "since 2022",
    "direction": "down"
  }
}
```

`title` and a finite numeric `value` are required. `unit`, `subtitle`, and `trend`
are optional. A trend requires a numeric `value` and a matching `direction`:
`up` for positive values, `down` for negative values, or `flat` for zero. Its
`unit` and `period` are optional. Directions have neutral styling: a decrease
can be favorable or unfavorable depending on the metric.

Titles are limited to 200 characters, units to 120, subtitles to 300, and trend
periods to 200. Strings are displayed as text, including strings containing HTML.
Cards inherit the active document or presentation theme. Their source is
available in a disclosure below the metric.

## Vega-Lite charts

```vega-lite
{
  "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
  "title": "Portuguese Public Debt",
  "width": "container",
  "data": {
    "values": [
      {"year": "2022", "debt": 111.2},
      {"year": "2023", "debt": 96.9},
      {"year": "2024", "debt": 93.0},
      {"year": "2025", "debt": 89.2}
    ]
  },
  "mark": {"type": "line", "point": true},
  "encoding": {
    "x": {"field": "year", "type": "ordinal", "axis": {"labelAngle": 0}},
    "y": {"field": "debt", "type": "quantitative", "title": "% GDP"},
    "tooltip": [
      {"field": "year", "type": "ordinal"},
      {"field": "debt", "type": "quantitative", "format": ".1f"}
    ]
  }
}
```

The example data is illustrative. Replace it with verified data for publication.

Document charts default to the container width and a height of 280 pixels.
On presentation slides, single-view and layered charts with omitted dimensions
use an intrinsic box measured from the slide content area. The existing
`scaleToFit` behavior scales the chart and accompanying text proportionally;
multiple charts in one content region share its available height. Sizing follows
the slide's logical dimensions rather than screen pixels, so fullscreen and
window resizing preserve the composition. Composite grids retain their native
cell sizing.

To enable automatic slide sizing in an existing chart, remove its top-level
`height` and numeric `width`. `"width": "container"` is also supported. An
explicit numeric width or height remains authoritative; a generated
`"height": 230` therefore needs to be removed when the intent is to fill the
slide. The renderer does not rewrite the source JSON.

Tooltips are
enabled by default. To disable them, set `mark.tooltip` to false and omit
`encoding.tooltip` or set it to null. Explicit tooltip field definitions take
precedence over the mark setting, following Vega-Lite's behavior.
Successfully rendered charts hide the source toggle in previews and HTML exports.
Invalid definitions, render failures, or disabled JavaScript keep the source
visible as a fallback, without stopping other charts.

Native chart syntax follows the installed Vega-Lite v6 schema. The browser and
server use the same precompiled validator; source validation requires no dynamic
code generation. Compiler upgrades must regenerate the contract, and coverage
checks compare it against the installed schema.

All **17 built-in marks** are supported: arc, area, bar, circle, geoshape, image,
line, point, rect, rule, square, text, tick, trail, boxplot, errorband, and errorbar.
Native static mark properties and encoding channels are accepted, including
constant values, sorting objects, grouped offsets, labels, secondary positions,
aggregation, and uncertainty intervals.

All **six composition operators** are supported: layer, facet, repeat, concat,
hconcat, and vconcat. Child views may inherit parent inline data; layers may also
inherit encoding. Facet/repeat use their native spec property. Repeat field
references must name a declared repeat dimension and supplied inline fields.
Compositions are bounded to 32 expanded rendered views. Dimensions on a composite
root are applied to its child views; the preview contains the resulting grid.

The [complete gallery](../../../../examples/vega-lite-chart-gallery.md) covers all
built-in marks and composition forms, including map, image, reference-rule,
text-label, variable-width trail, and uncertainty examples.

The application applies resource and size rules in addition to native syntax:

- Supply or inherit inline data.values. Ordinary rows contain scalar values;
  geoshape also accepts inline GeoJSON with finite coordinate arrays. Safe dotted
  field paths may reference nested GeoJSON properties.
- Image marks accept HTTPS URLs and inline PNG/JPEG/GIF/WebP data URLs. HTTPS
  images follow markdownAiStudio.allowRemoteResources and need network access.
  Inline raster images work offline. A blocked or failed image produces a
  resource diagnostic rather than an unsupported-chart error.
- External chart datasets, custom config, transforms, parameters, executable
  expressions, conditions, hyperlinks, and SVG/HTML image data remain outside
  the application contract. Image loading does not enable external data loading.
- Width/height are container-responsive or 40–4,096 pixels. Mark dimensions and
  font sizes are bounded to 4,096. Explicit bin parameters use maxbins from 1 to
  100; step-based unbounded binning is excluded.
- Field paths cannot access prototype properties. Unknown native syntax is
  rejected by the installed schema, rather than by a separate property list.

## Bounds and errors

Both fence types require JSON without comments or trailing commas. Each block is
limited to 128 KiB of UTF-8 source, 12 levels of nesting, and 50,000 JSON values.
Property names are limited to 120 characters and ordinary strings to 2,048 characters.
Inline raster image data is bounded by the overall 128 KiB source limit.
Smaller limits above apply to individual labels. Prototype-related
property names (`__proto__`, `prototype`, `constructor`) are rejected.

Invalid blocks show an error and escaped source. Error previews are truncated at
16,384 characters; the complete source stays in Markdown. Valid chart source is
preserved verbatim inside its disclosure. A block error does not stop subsequent
Markdown, metrics, or Mermaid diagrams from rendering.
