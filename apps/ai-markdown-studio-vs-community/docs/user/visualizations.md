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
  "height": 280,
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

Charts default to the container width and a height of 280 pixels. Tooltips are
enabled by default. To disable them, set `mark.tooltip` to false and omit
`encoding.tooltip` or set it to null. Explicit tooltip field definitions take
precedence over the mark setting, following Vega-Lite's behavior.
Source is available below each chart. Invalid definitions or render
failures keep the source open alongside an error, without stopping other charts.

The supported subset uses native Vega-Lite v6 syntax:

| Location | Supported properties |
| --- | --- |
| Root | Optional `$schema` (exact URL above), `title`, `description`, `width`, `height`, `autosize`; required `data`, `mark`, `encoding` |
| `data` | `values`: 1–5,000 flat objects, each with 1–32 fields containing strings, finite numbers, booleans, or null |
| `mark` | `"line"`, `"bar"`, or an object with `type`, optional boolean `tooltip`, hexadecimal `color`, `opacity` (0–1), `strokeWidth` (0–20), and boolean `point` for line charts |
| `encoding` | Required `x` and `y`; optional `color` and `tooltip` |
| Field definitions | Required `field` and `type`; optional `title` (string or null). Types: `quantitative`, `ordinal`, `nominal`, `temporal`. Fields must exist in at least one inline row. |
| `x` and `y` | Optional `axis`, `scale`, `sort` |
| `color` | Optional `scale`, `sort`, `legend: null` to hide the legend |
| `tooltip` | A field definition, 1–16 field definitions, or null; optional `format` per definition |
| `axis` | Null, or an object with `title`, `labelAngle` (-360–360), `format`, boolean `grid`, `labels`, `ticks`, integer `tickCount` (1–100), and `labelLimit` (0–500) |
| `scale` | Boolean `zero`, `nice`, and `reverse` |
| `sort` | `"ascending"`, `"descending"`, null, or up to 64 scalar values |
| Dimensions | Width: `"container"` or 40–4,096; height: 40–4,096 |
| `autosize` | `"fit"`, `"fit-x"`, `"fit-y"`, `"pad"`, `"none"`, or an object with one of these as `type`, optional `contains` (`"padding"` or `"content"`), and boolean `resize` |

Unknown properties are rejected at each configuration level. External datasets,
image marks, links, expressions, transforms, configuration overrides, parameters,
and multi-view composition are outside this subset. Data fields named `url` or
`expr` are permitted as literal data; they are not interpreted as configuration.
Data field names must be nonempty literal names without dots, brackets, or
backslashes; nested field paths are outside this subset.

## Bounds and errors

Both fence types require JSON without comments or trailing commas. Each block is
limited to 128 KiB of UTF-8 source, 12 levels of nesting, and 50,000 JSON values.
Property names are limited to 120 characters and strings to 2,048 characters,
with the smaller limits above applying to individual labels. Prototype-related
property names (`__proto__`, `prototype`, `constructor`) are rejected.

Invalid blocks show an error and escaped source. Error previews are truncated at
16,384 characters; the complete source stays in Markdown. Valid chart source is
preserved verbatim inside its disclosure. A block error does not stop subsequent
Markdown, metrics, or Mermaid diagrams from rendering.
