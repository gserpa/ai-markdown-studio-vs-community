# Status matrix component

This workspace package owns the status matrix's input validation, normalized model, HTML rendering, component-aware table formatting, styles, authoring hints and PowerPoint fallback. It has no dependency on the application or on a particular theme.

`src/index.ts` exposes the component's static definition. `style.css` contains its default styles and scoped theme adjustments. The application includes the package through the bundled-component catalog; it provides shared parsing, diagnostics, asset delivery and export hooks without needing to know the component's internal markup.

The tests in `test/` cover both the component and its integration with those shared capabilities.

A structured row can optionally include `indicator: { label: "At risk", style: warning }` and `note: "Next review"`. The indicator has a separate column and retains an accessible text label; the note column is included only when used. Set optional data.rowHeader, data.indicatorHeader, and data.noteHeader to customize the column headings. Approved indicator styles are `neutral`, `info`, `success`, `warning`, and `danger`. The table input has no separate row-indicator or note fields. PowerPoint retains the text but simplifies styling.

A matrix may contain up to 64 columns, 100 rows and 1,000 cells, subject to the shared component source and YAML item limits. These safety boundaries do not mean a large matrix will fit on a slide: export checks report content that is too large.
