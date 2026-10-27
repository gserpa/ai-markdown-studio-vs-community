# Shared stylesheet sources

Edit these CSS modules, not `../assets/preview.css` or files under `../assets/generated/`.

`modules.json` is the ordered source plan. Each entry names one source file, its generated asset, the modes that use it, and an optional `media` requirement. Its order is the cascade order shared by document preview, presentation preview, and HTML export.

- `core.css` contains font declarations and base theme variables.
- `content.css`, `content-elements.css`, `tables.css`, `table-controls.css`, `utilities.css`, `syntax.css`, and `interactions.css` contain shared content and interaction rules.
- `visualizations.css` contains chart and metric styles, including their print rules.
- `document.css` and `document-syntax.css` contain document-only layout and syntax overrides.
- `media.css` and `lightbox.css` contain diagram/image zoom and lightbox styles.
- `presentation*.css` contain the slide shell, content, layouts, controls, responsive rules, and palette overrides.
- `compatibility.css` contains browser fallbacks used by both modes.

Run `npm run build:assets --workspace=packages/md-preview-web` from the Community root after CSS-only changes, or `npm run compile` when TypeScript or themes change too. The build emits minified, fingerprinted modules and a schema-v2 asset manifest with ordered `stylesheets.document` and `stylesheets.presentation` lists. It also concatenates the sources into `assets/preview.css` for hosts that still consume a single stylesheet, without changing their rule order.

Keep each source file in the plan exactly once. Put overrides after the shared rule they refine, and preserve that order when changing module boundaries. Preview and HTML export select the same manifest entries; HTML export combines the selected modules into one inline or external stylesheet.
