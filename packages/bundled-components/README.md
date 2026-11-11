# Bundled components

This package is the static composition point for components shipped with the application. Each component supplies its implementation, authoring hints, optional stylesheet and output behavior through the shared contract. The application consumes the catalog without branching on individual component types.

Adding a bundled component means implementing the existing contract and adding it to this list. This catalog does not load plugins or discover executable code dynamically.
