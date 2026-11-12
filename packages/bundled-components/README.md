# Bundled components

This package is the static composition point for components shipped with the application. Each component supplies its implementation, authoring hints, optional stylesheet and output behavior through the shared contract. The application consumes the catalog without branching on individual component types.

Adding a bundled component means implementing the existing contract and adding it to this list. This catalog does not load plugins or discover executable code dynamically.


## Architecture and theming

Keep each component's parsing, validation, rendering, styles, authoring guidance, and export behavior in its own package. Integrate components through the shared catalog and generic contracts. Keep component-specific markup and styling out of core and shared preview files.

Define the component's common visual structure and layout in its module so every presentation theme renders the same component design. Resolve colors, fonts, surfaces, and other theme-sensitive values from the active theme's existing properties. Where a component needs a specific theme property, provide an optional override with a default mapped to the existing theme properties. A theme may supply its own values without needing to redefine the component's layout.

When changing component presentation, check representative light and dark themes and a theme without component-specific overrides. Check that explicit overrides work when adding them.
