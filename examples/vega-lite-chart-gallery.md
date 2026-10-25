---
title: Vega-Lite Chart Gallery
---

# Vega-Lite Chart Gallery

A gallery of Vega-Lite chart forms and every built-in mark type for preview and
export testing. Chart forms such as histograms and heatmaps are composed from
marks and encodings; they are not separate mark types. Examples use inline data
so they can be copied and adapted independently.

## Built-in Mark Coverage

Vega-Lite defines 14 primitive marks and 3 composite marks. This inventory maps
each built-in mark to an example in this file. It is a complete mark-type list,
not a finite list of every chart design that can be composed with Vega-Lite.

| Category | Mark type | Common chart use | Example |
| --- | --- | --- | --- |
| Primitive | `arc` | Pie and donut charts | 6, 7 |
| Primitive | `area` | Area chart | 4 |
| Primitive | `bar` | Bar chart, histogram | 1, 2, 9 |
| Primitive | `circle` | Circle scatter plot | 12 |
| Primitive | `geoshape` | Geographic map | 13 |
| Primitive | `image` | Image marks | 14 |
| Primitive | `line` | Line chart | 3 |
| Primitive | `point` | Scatter plot | 5 |
| Primitive | `rect` | Heatmap | 8 |
| Primitive | `rule` | Reference line | 15 |
| Primitive | `square` | Square scatter plot | 16 |
| Primitive | `text` | Data labels | 17 |
| Primitive | `tick` | Distribution marks | 11 |
| Primitive | `trail` | Variable-width path | 18 |
| Composite | `boxplot` | Box-and-whisker plot | 10 |
| Composite | `errorband` | Uncertainty band | 19 |
| Composite | `errorbar` | Error interval | 20 |

The mark inventory follows the [Vega-Lite mark documentation](https://vega.github.io/vega-lite/docs/mark.html)
and the [primitive mark definitions](https://github.com/vega/vega-lite/blob/main/src/mark.ts).
Composite marks are documented as [boxplot](https://vega.github.io/vega-lite/docs/boxplot.html),
[errorband](https://vega.github.io/vega-lite/docs/errorband.html), and
[errorbar](https://vega.github.io/vega-lite/docs/errorbar.html).

## View Composition Coverage

`group` is a structural mark in compiled Vega, not a Vega-Lite mark type that
authors place in the `mark` property. Vega-Lite exposes multi-view structure
through composition operators; compiling those views to Vega can use group
marks to contain and lay out the subviews. These examples cover each operator:

| Composition operator | Purpose | Example |
| --- | --- | --- |
| `layer` | Overlay multiple marks in one view | 21 |
| `facet` | Split data into repeated small multiples | 22 |
| `repeat` | Reuse a view across a list of fields | 23 |
| `concat` | Arrange views in a wrappable layout | 24 |
| `hconcat` | Place views side by side | 25 |
| `vconcat` | Stack views vertically | 26 |
| `group` (compiled Vega structure) | Container generated for composed views; not directly authored as a Vega-Lite mark | 21-26 |

See the official [Vega-Lite view composition overview](https://vega.github.io/vega-lite/docs/composition.html),
[concatenation documentation](https://vega.github.io/vega-lite/docs/concat.html),
and [Vega group mark documentation](https://vega.github.io/vega/docs/marks/).

## 1. Bar Chart

Compare values across categories.

```vega-lite
{
  "title": "Visitors by channel",
  "width": "container",
  "data": {
    "values": [
      {"channel": "Search", "visitors": 420},
      {"channel": "Social", "visitors": 265},
      {"channel": "Email", "visitors": 180},
      {"channel": "Direct", "visitors": 310}
    ]
  },
  "mark": "bar",
  "encoding": {
    "x": {"field": "channel", "type": "nominal", "sort": "-y"},
    "y": {"field": "visitors", "type": "quantitative", "title": "Visitors"},
    "color": {"field": "channel", "type": "nominal", "legend": null},
    "tooltip": [
      {"field": "channel", "type": "nominal"},
      {"field": "visitors", "type": "quantitative"}
    ]
  }
}
```

## 2. Grouped Bar Chart

Compare multiple series within each category.

```vega-lite
{
  "title": "Quarterly sales by product",
  "width": "container",
  "data": {
    "values": [
      {"quarter": "Q1", "product": "Atlas", "sales": 32},
      {"quarter": "Q1", "product": "Nova", "sales": 25},
      {"quarter": "Q2", "product": "Atlas", "sales": 41},
      {"quarter": "Q2", "product": "Nova", "sales": 36},
      {"quarter": "Q3", "product": "Atlas", "sales": 37},
      {"quarter": "Q3", "product": "Nova", "sales": 43},
      {"quarter": "Q4", "product": "Atlas", "sales": 49},
      {"quarter": "Q4", "product": "Nova", "sales": 46}
    ]
  },
  "mark": "bar",
  "encoding": {
    "x": {"field": "quarter", "type": "ordinal"},
    "xOffset": {"field": "product"},
    "y": {"field": "sales", "type": "quantitative", "title": "Sales (thousands)"},
    "color": {"field": "product", "type": "nominal"},
    "tooltip": [
      {"field": "quarter", "type": "ordinal"},
      {"field": "product", "type": "nominal"},
      {"field": "sales", "type": "quantitative"}
    ]
  }
}
```

## 3. Line Chart

Show a trend over an ordered time axis, with points marking observations.

```vega-lite
{
  "title": "Monthly rainfall",
  "width": "container",
  "data": {
    "values": [
      {"month": "Jan", "rainfall": 78},
      {"month": "Feb", "rainfall": 64},
      {"month": "Mar", "rainfall": 59},
      {"month": "Apr", "rainfall": 42},
      {"month": "May", "rainfall": 31},
      {"month": "Jun", "rainfall": 18}
    ]
  },
  "mark": {"type": "line", "point": true},
  "encoding": {
    "x": {"field": "month", "type": "ordinal", "sort": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]},
    "y": {"field": "rainfall", "type": "quantitative", "title": "Rainfall (mm)"},
    "tooltip": [
      {"field": "month", "type": "ordinal"},
      {"field": "rainfall", "type": "quantitative", "title": "Rainfall (mm)"}
    ]
  }
}
```

## 4. Area Chart

Emphasize the changing magnitude of a series over time.

```vega-lite
{
  "title": "Daily energy use",
  "width": "container",
  "data": {
    "values": [
      {"hour": 0, "use": 14},
      {"hour": 4, "use": 10},
      {"hour": 8, "use": 22},
      {"hour": 12, "use": 35},
      {"hour": 16, "use": 31},
      {"hour": 20, "use": 24},
      {"hour": 24, "use": 15}
    ]
  },
  "mark": {"type": "area", "line": true},
  "encoding": {
    "x": {"field": "hour", "type": "quantitative", "title": "Hour of day"},
    "y": {"field": "use", "type": "quantitative", "title": "Energy use (MWh)"},
    "tooltip": [
      {"field": "hour", "type": "quantitative"},
      {"field": "use", "type": "quantitative", "title": "Energy use (MWh)"}
    ]
  }
}
```

## 5. Scatter Plot

Explore the relationship between two quantitative measures.

```vega-lite
{
  "title": "Study time and assessment score",
  "width": "container",
  "data": {
    "values": [
      {"student": "A", "hours": 2, "score": 58, "group": "Blue"},
      {"student": "B", "hours": 3, "score": 65, "group": "Blue"},
      {"student": "C", "hours": 4, "score": 72, "group": "Green"},
      {"student": "D", "hours": 5, "score": 69, "group": "Green"},
      {"student": "E", "hours": 6, "score": 84, "group": "Blue"},
      {"student": "F", "hours": 7, "score": 91, "group": "Green"},
      {"student": "G", "hours": 8, "score": 88, "group": "Blue"}
    ]
  },
  "mark": {"type": "point", "filled": true, "size": 90},
  "encoding": {
    "x": {"field": "hours", "type": "quantitative", "title": "Study hours"},
    "y": {"field": "score", "type": "quantitative", "title": "Score"},
    "color": {"field": "group", "type": "nominal"},
    "tooltip": [
      {"field": "student", "type": "nominal"},
      {"field": "hours", "type": "quantitative"},
      {"field": "score", "type": "quantitative"}
    ]
  }
}
```

## 6. Pie Chart

Show how categories contribute to a whole.

```vega-lite
{
  "title": "Project time by activity",
  "width": "container",
  "height": 260,
  "data": {
    "values": [
      {"activity": "Planning", "hours": 18},
      {"activity": "Building", "hours": 42},
      {"activity": "Testing", "hours": 26},
      {"activity": "Review", "hours": 14}
    ]
  },
  "mark": {"type": "arc", "outerRadius": 105},
  "encoding": {
    "theta": {"field": "hours", "type": "quantitative"},
    "color": {"field": "activity", "type": "nominal"},
    "tooltip": [
      {"field": "activity", "type": "nominal"},
      {"field": "hours", "type": "quantitative"}
    ]
  }
}
```

## 7. Donut Chart

Use an inner radius to create a hole in a pie chart.

```vega-lite
{
  "title": "Support requests by status",
  "width": "container",
  "height": 260,
  "data": {
    "values": [
      {"status": "Resolved", "requests": 68},
      {"status": "In progress", "requests": 22},
      {"status": "Waiting", "requests": 10}
    ]
  },
  "mark": {"type": "arc", "innerRadius": 58, "outerRadius": 105},
  "encoding": {
    "theta": {"field": "requests", "type": "quantitative"},
    "color": {"field": "status", "type": "nominal"},
    "tooltip": [
      {"field": "status", "type": "nominal"},
      {"field": "requests", "type": "quantitative"}
    ]
  }
}
```

## 8. Heatmap

Use color intensity to reveal patterns across two categories.

```vega-lite
{
  "title": "Library visits by day and hour",
  "width": "container",
  "data": {
    "values": [
      {"day": "Mon", "hour": "Morning", "visits": 34},
      {"day": "Mon", "hour": "Afternoon", "visits": 52},
      {"day": "Mon", "hour": "Evening", "visits": 21},
      {"day": "Tue", "hour": "Morning", "visits": 28},
      {"day": "Tue", "hour": "Afternoon", "visits": 61},
      {"day": "Tue", "hour": "Evening", "visits": 25},
      {"day": "Wed", "hour": "Morning", "visits": 42},
      {"day": "Wed", "hour": "Afternoon", "visits": 47},
      {"day": "Wed", "hour": "Evening", "visits": 31},
      {"day": "Thu", "hour": "Morning", "visits": 39},
      {"day": "Thu", "hour": "Afternoon", "visits": 56},
      {"day": "Thu", "hour": "Evening", "visits": 29}
    ]
  },
  "mark": "rect",
  "encoding": {
    "x": {"field": "day", "type": "ordinal"},
    "y": {"field": "hour", "type": "ordinal"},
    "color": {"field": "visits", "type": "quantitative", "title": "Visits"},
    "tooltip": [
      {"field": "day", "type": "ordinal"},
      {"field": "hour", "type": "ordinal"},
      {"field": "visits", "type": "quantitative"}
    ]
  }
}
```

## 9. Histogram

Show the distribution of a quantitative variable using bins.

```vega-lite
{
  "title": "Delivery time distribution",
  "width": "container",
  "data": {
    "values": [
      {"minutes": 18}, {"minutes": 22}, {"minutes": 24}, {"minutes": 27},
      {"minutes": 29}, {"minutes": 31}, {"minutes": 33}, {"minutes": 34},
      {"minutes": 36}, {"minutes": 38}, {"minutes": 41}, {"minutes": 43},
      {"minutes": 45}, {"minutes": 48}, {"minutes": 51}, {"minutes": 54},
      {"minutes": 58}, {"minutes": 62}, {"minutes": 67}, {"minutes": 72}
    ]
  },
  "mark": "bar",
  "encoding": {
    "x": {"field": "minutes", "type": "quantitative", "bin": true, "title": "Delivery time (minutes)"},
    "y": {"aggregate": "count", "type": "quantitative", "title": "Number of deliveries"},
    "tooltip": [{"aggregate": "count", "type": "quantitative", "title": "Deliveries"}]
  }
}
```

## 10. Box Plot

Summarize the spread and median of values across groups.

```vega-lite
{
  "title": "Commute time by transport",
  "width": "container",
  "data": {
    "values": [
      {"transport": "Bus", "minutes": 28},
      {"transport": "Bus", "minutes": 35},
      {"transport": "Bus", "minutes": 41},
      {"transport": "Bus", "minutes": 46},
      {"transport": "Bus", "minutes": 58},
      {"transport": "Bike", "minutes": 16},
      {"transport": "Bike", "minutes": 21},
      {"transport": "Bike", "minutes": 24},
      {"transport": "Bike", "minutes": 29},
      {"transport": "Bike", "minutes": 37},
      {"transport": "Train", "minutes": 22},
      {"transport": "Train", "minutes": 26},
      {"transport": "Train", "minutes": 33},
      {"transport": "Train", "minutes": 39},
      {"transport": "Train", "minutes": 45}
    ]
  },
  "mark": {"type": "boxplot", "extent": 1.5},
  "encoding": {
    "x": {"field": "transport", "type": "nominal"},
    "y": {"field": "minutes", "type": "quantitative", "title": "Commute time (minutes)"},
    "color": {"field": "transport", "type": "nominal", "legend": null}
  }
}
```

## 11. Tick Plot

Display individual values compactly for a quick comparison of distributions.

```vega-lite
{
  "title": "Response time samples",
  "width": "container",
  "data": {
    "values": [
      {"service": "Search", "milliseconds": 42},
      {"service": "Search", "milliseconds": 55},
      {"service": "Search", "milliseconds": 61},
      {"service": "Search", "milliseconds": 78},
      {"service": "Search", "milliseconds": 94},
      {"service": "Catalog", "milliseconds": 35},
      {"service": "Catalog", "milliseconds": 48},
      {"service": "Catalog", "milliseconds": 66},
      {"service": "Catalog", "milliseconds": 72},
      {"service": "Catalog", "milliseconds": 89}
    ]
  },
  "mark": {"type": "tick", "thickness": 2, "size": 18},
  "encoding": {
    "x": {"field": "service", "type": "nominal"},
    "y": {"field": "milliseconds", "type": "quantitative", "title": "Response time (ms)"},
    "color": {"field": "service", "type": "nominal", "legend": null},
    "tooltip": [
      {"field": "service", "type": "nominal"},
      {"field": "milliseconds", "type": "quantitative", "title": "Response time (ms)"}
    ]
  }
}
```

Regular Markdown and Mermaid diagrams can be used alongside Vega-Lite charts.

## 12. Circle Mark

The circle mark is a dedicated primitive for scatter plots with circular points.

```vega-lite
{
  "title": "Circle mark: temperature and ice cream sales",
  "width": "container",
  "data": {
    "values": [
      {"temperature": 18, "sales": 42},
      {"temperature": 21, "sales": 55},
      {"temperature": 24, "sales": 63},
      {"temperature": 27, "sales": 78},
      {"temperature": 30, "sales": 91}
    ]
  },
  "mark": {"type": "circle", "size": 100},
  "encoding": {
    "x": {"field": "temperature", "type": "quantitative", "title": "Temperature (C)"},
    "y": {"field": "sales", "type": "quantitative", "title": "Daily sales"},
    "tooltip": [
      {"field": "temperature", "type": "quantitative"},
      {"field": "sales", "type": "quantitative"}
    ]
  }
}
```

## 13. Geoshape Mark

Render inline GeoJSON as a map feature. This small polygon is schematic, not a
real administrative boundary.

```vega-lite
{
  "title": "Schematic map feature",
  "width": "container",
  "height": 220,
  "projection": {"type": "mercator"},
  "data": {
    "values": [
      {
        "type": "Feature",
        "properties": {"place": "Sample region"},
        "geometry": {
          "type": "Polygon",
          "coordinates": [[
            [-9.5, 38.5],
            [-8.0, 38.5],
            [-8.0, 40.0],
            [-9.5, 40.0],
            [-9.5, 38.5]
          ]]
        }
      }
    ]
  },
  "mark": "geoshape",
  "encoding": {
    "shape": {"field": "geometry", "type": "geojson"},
    "color": {"value": "#4c9f70"},
    "tooltip": [{"field": "properties.place", "type": "nominal", "title": "Feature"}]
  }
}
```

## 14. Image Mark

Image marks place a URL from the data at each encoded position. This example
uses an inline PNG image for offline preview and export. HTTPS images also work when remote resources are enabled.

```vega-lite
{
  "title": "Image mark",
  "width": "container",
  "height": 180,
  "data": {
    "values": [
      {"label": "Sample image", "x": 1, "y": 1, "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWPQKCr8j4wZSBcAAEGgIKF+WBctAAAAAElFTkSuQmCC"}
    ]
  },
  "mark": {"type": "image", "width": 120, "height": 120},
  "encoding": {
    "x": {"field": "x", "type": "quantitative", "axis": null},
    "y": {"field": "y", "type": "quantitative", "axis": null},
    "url": {"field": "image", "type": "nominal"},
    "tooltip": [{"field": "label", "type": "nominal"}]
  }
}
```

## 15. Rule Mark

Use a rule as a reference threshold across the chart.

```vega-lite
{
  "title": "Target threshold",
  "width": "container",
  "data": {"values": [{"target": 80}]},
  "mark": {"type": "rule", "color": "#d1495b", "strokeDash": [6, 4]},
  "encoding": {
    "y": {"field": "target", "type": "quantitative", "title": "Score"}
  }
}
```

## 16. Square Mark

The square mark provides a square-symbol alternative to circle or point marks.

```vega-lite
{
  "title": "Square mark: product performance",
  "width": "container",
  "data": {
    "values": [
      {"quality": 62, "price": 25, "product": "A"},
      {"quality": 74, "price": 38, "product": "B"},
      {"quality": 81, "price": 31, "product": "C"},
      {"quality": 88, "price": 47, "product": "D"}
    ]
  },
  "mark": {"type": "square", "size": 110},
  "encoding": {
    "x": {"field": "quality", "type": "quantitative", "title": "Quality score"},
    "y": {"field": "price", "type": "quantitative", "title": "Price"},
    "color": {"field": "product", "type": "nominal"},
    "tooltip": [
      {"field": "product", "type": "nominal"},
      {"field": "quality", "type": "quantitative"},
      {"field": "price", "type": "quantitative"}
    ]
  }
}
```

## 17. Text Mark

Text marks display field values as labels at data coordinates.

```vega-lite
{
  "title": "Text labels for monthly totals",
  "width": "container",
  "data": {
    "values": [
      {"month": "Jan", "total": 38},
      {"month": "Feb", "total": 52},
      {"month": "Mar", "total": 46},
      {"month": "Apr", "total": 67}
    ]
  },
  "mark": {"type": "text", "fontSize": 14, "dy": -10},
  "encoding": {
    "x": {"field": "month", "type": "ordinal"},
    "y": {"field": "total", "type": "quantitative", "title": "Total"},
    "text": {"field": "total", "type": "quantitative"},
    "color": {"value": "#264653"}
  }
}
```

## 18. Trail Mark

Trail is a path mark whose width can vary with a quantitative encoding.

```vega-lite
{
  "title": "Variable-width route",
  "width": "container",
  "data": {
    "values": [
      {"route": "North", "step": 1, "distance": 1, "elevation": 2, "width": 1},
      {"route": "North", "step": 2, "distance": 2, "elevation": 4, "width": 2},
      {"route": "North", "step": 3, "distance": 3, "elevation": 3, "width": 4},
      {"route": "North", "step": 4, "distance": 4, "elevation": 6, "width": 6},
      {"route": "North", "step": 5, "distance": 5, "elevation": 5, "width": 8}
    ]
  },
  "mark": {"type": "trail", "opacity": 0.8},
  "encoding": {
    "x": {"field": "distance", "type": "quantitative", "title": "Distance"},
    "y": {"field": "elevation", "type": "quantitative", "title": "Elevation"},
    "order": {"field": "step", "type": "quantitative"},
    "detail": {"field": "route", "type": "nominal"},
    "size": {"field": "width", "type": "quantitative", "title": "Path width"},
    "color": {"field": "route", "type": "nominal"}
  }
}
```

## 19. Errorband Composite Mark

An error band summarizes a range around a measure. The lower and upper bounds
are supplied directly here.

```vega-lite
{
  "title": "Forecast range",
  "width": "container",
  "data": {
    "values": [
      {"day": 1, "lower": 18, "upper": 26},
      {"day": 2, "lower": 20, "upper": 29},
      {"day": 3, "lower": 23, "upper": 32},
      {"day": 4, "lower": 25, "upper": 35},
      {"day": 5, "lower": 27, "upper": 38}
    ]
  },
  "mark": {"type": "errorband", "opacity": 0.3},
  "encoding": {
    "x": {"field": "day", "type": "quantitative", "title": "Day"},
    "y": {"field": "lower", "type": "quantitative", "title": "Forecast value"},
    "y2": {"field": "upper"}
  }
}
```

## 20. Errorbar Composite Mark

An error bar shows an explicit lower and upper interval for each category.

```vega-lite
{
  "title": "Estimate ranges",
  "width": "container",
  "data": {
    "values": [
      {"group": "A", "lower": 42, "upper": 58},
      {"group": "B", "lower": 61, "upper": 75},
      {"group": "C", "lower": 50, "upper": 69}
    ]
  },
  "mark": "errorbar",
  "encoding": {
    "x": {"field": "group", "type": "nominal"},
    "y": {"field": "lower", "type": "quantitative", "title": "Estimate"},
    "y2": {"field": "upper"}
  }
}
```

## 21. Layer Composition

Layer a line and points in one shared view, with common data and x encoding.

```vega-lite
{
  "title": "Layered monthly performance",
  "width": "container",
  "data": {
    "values": [
      {"month": "Jan", "score": 64},
      {"month": "Feb", "score": 71},
      {"month": "Mar", "score": 68},
      {"month": "Apr", "score": 82}
    ]
  },
  "encoding": {
    "x": {"field": "month", "type": "ordinal"},
    "y": {"field": "score", "type": "quantitative", "title": "Score"}
  },
  "layer": [
    {"mark": {"type": "line", "color": "#287271"}},
    {"mark": {"type": "point", "filled": true, "size": 80, "color": "#e76f51"}}
  ]
}
```

## 22. Facet Composition

Create a small multiple for each team using the `facet` operator and its
per-view `spec`.

```vega-lite
{
  "title": "Hours by team",
  "data": {
    "values": [
      {"team": "Design", "task": "Plan", "hours": 12},
      {"team": "Design", "task": "Build", "hours": 24},
      {"team": "Support", "task": "Plan", "hours": 18},
      {"team": "Support", "task": "Build", "hours": 16}
    ]
  },
  "facet": {"column": {"field": "team", "type": "nominal"}},
  "spec": {
    "mark": "bar",
    "encoding": {
      "x": {"field": "task", "type": "nominal"},
      "y": {"field": "hours", "type": "quantitative", "title": "Hours"}
    }
  }
}
```

## 23. Repeat Composition

Repeat the same line-chart definition across multiple quantitative fields.

```vega-lite
{
  "title": "Repeated business metrics",
  "width": "container",
  "data": {
    "values": [
      {"month": "Jan", "revenue": 24, "orders": 18},
      {"month": "Feb", "revenue": 31, "orders": 23},
      {"month": "Mar", "revenue": 28, "orders": 27},
      {"month": "Apr", "revenue": 39, "orders": 32}
    ]
  },
  "repeat": {"column": ["revenue", "orders"]},
  "spec": {
    "mark": "line",
    "encoding": {
      "x": {"field": "month", "type": "ordinal"},
      "y": {"field": {"repeat": "column"}, "type": "quantitative"}
    }
  }
}
```

## 24. General Concat Composition

Use `concat` to arrange child views in a wrappable layout; `columns` controls
the number of views per row.

```vega-lite
{
  "title": "Operations overview",
  "columns": 2,
  "data": {
    "values": [
      {"month": "Jan", "orders": 24, "returns": 3},
      {"month": "Feb", "orders": 31, "returns": 4},
      {"month": "Mar", "orders": 28, "returns": 2}
    ]
  },
  "concat": [
    {
      "title": "Orders",
      "mark": "bar",
      "encoding": {
        "x": {"field": "month", "type": "ordinal"},
        "y": {"field": "orders", "type": "quantitative"}
      }
    },
    {
      "title": "Returns",
      "mark": "line",
      "encoding": {
        "x": {"field": "month", "type": "ordinal"},
        "y": {"field": "returns", "type": "quantitative"}
      }
    }
  ]
}
```

## 25. Horizontal Concat Composition

Place two views side by side with `hconcat`.

```vega-lite
{
  "title": "Horizontal comparison",
  "data": {
    "values": [
      {"region": "East", "sales": 42, "customers": 31},
      {"region": "West", "sales": 55, "customers": 46},
      {"region": "North", "sales": 37, "customers": 28}
    ]
  },
  "hconcat": [
    {
      "title": "Sales",
      "mark": "bar",
      "encoding": {
        "x": {"field": "region", "type": "nominal"},
        "y": {"field": "sales", "type": "quantitative"}
      }
    },
    {
      "title": "Customers",
      "mark": "point",
      "encoding": {
        "x": {"field": "region", "type": "nominal"},
        "y": {"field": "customers", "type": "quantitative"}
      }
    }
  ]
}
```

## 26. Vertical Concat Composition

Stack two views vertically with `vconcat`.

```vega-lite
{
  "title": "Vertical comparison",
  "data": {
    "values": [
      {"month": "Jan", "visits": 120, "signups": 18},
      {"month": "Feb", "visits": 145, "signups": 23},
      {"month": "Mar", "visits": 132, "signups": 21}
    ]
  },
  "vconcat": [
    {
      "title": "Visits",
      "mark": "line",
      "encoding": {
        "x": {"field": "month", "type": "ordinal"},
        "y": {"field": "visits", "type": "quantitative"}
      }
    },
    {
      "title": "Signups",
      "mark": "bar",
      "encoding": {
        "x": {"field": "month", "type": "ordinal"},
        "y": {"field": "signups", "type": "quantitative"}
      }
    }
  ]
}
```
