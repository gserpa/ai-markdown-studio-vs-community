# Community Workspace Instructions

- Community is the canonical source for reusable Markdown AI Studio behavior, public contracts, shared packages, preview assets, and the standalone Community extension.
- Put host-neutral Markdown/MPS behavior in `@mfo/core`, preview behavior in `@mfo/preview-web`, and reusable AI prompt/validation behavior in `@mfo/ai-core`.
- Keep `@mfo/community-api` type-only and backward-compatible within an API version. Additive fields may remain on API `1.0`; breaking changes require a new API version and coordinated Pro update.
- Do not add Pro source, proprietary assets, Pro-only commands, or Pro-only dependencies to this repository.
- Community must not hard-code knowledge of Pro commands. Optional editions contribute command metadata through `FeatureContribution`.
- Edit preview assets only in `packages/md-preview-web/assets/`; extension copies are generated.
- When adding bundled preview themes, use the Markdown AI Studio theme tools to generate and validate the JSON, save the files under `packages/md-preview-web/assets/themes/`, then run `scripts/sync-manifest-config.mjs` and `scripts/sync-preview-assets.mjs` so the Settings enum and copied assets stay in sync.
- Community must continue to build, test, package, and run independently of Pro.
