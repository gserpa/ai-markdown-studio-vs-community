---
title: Public Debt Dashboard
theme: auto
---

# Public Debt Dashboard

Illustrative data for testing visualization blocks. Verify values before publication.

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

```vega-lite
{
  "title": "Debt evolution",
  "width": "container",
  "height": 280,
  "mark": {"type": "line", "point": true},
  "data": {
    "values": [
      {"year": "2022", "debt": 111.2},
      {"year": "2023", "debt": 96.9},
      {"year": "2024", "debt": 93.0},
      {"year": "2025", "debt": 89.2}
    ]
  },
  "encoding": {
    "x": {"field": "year", "type": "ordinal"},
    "y": {"field": "debt", "type": "quantitative", "title": "% GDP"},
    "tooltip": [
      {"field": "year", "type": "ordinal"},
      {"field": "debt", "type": "quantitative", "format": ".1f"}
    ]
  }
}
```

```metric
{"title": "Budget balance", "value": 0.7, "unit": "% GDP", "subtitle": "2025"}
```

```metric
{"title": "EU average debt", "value": 81.5, "unit": "% GDP", "subtitle": "2025"}
```

## Comparisons

```vega-lite
{
  "title": "Debt comparison",
  "mark": "bar",
  "data": {
    "values": [
      {"region": "Portugal", "debt": 89.2},
      {"region": "EU average", "debt": 81.5}
    ]
  },
  "encoding": {
    "x": {"field": "region", "type": "nominal"},
    "y": {"field": "debt", "type": "quantitative", "title": "% GDP"}
  }
}
```

Regular Markdown and Mermaid remain available alongside visualization blocks.

```mermaid
flowchart LR
  A[Inline data] --> B[Validated definitions]
  B --> C[Markdown preview]
```
