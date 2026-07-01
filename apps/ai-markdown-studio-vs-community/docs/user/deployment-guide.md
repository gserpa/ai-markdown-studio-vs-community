---
date: 2026-06-12
version: 1.0.0
---

# Deployment Guide — AI Markdown Studio Community

This guide explains how to build, validate, and distribute the **AI Markdown Studio Community** extension, either as a standalone `.vsix` file or through the Visual Studio Code Marketplace.

Unless noted otherwise, `package.json` in this guide means `apps/ai-markdown-studio-vs-community/package.json` (the extension manifest). The repository-root `package.json` is the monorepo workspace manifest that defines the build, test, boundary, and package scripts.

Community is MIT-licensed and self-contained. It contains no Pro code, no Pro-only dependencies, and no Pro commands; an automated boundary check enforces this on every build.

## 1. Deployment options

You have two practical distribution paths:

1. **File distribution** using a packaged `.vsix`
2. **Marketplace distribution** through the Visual Studio Code Marketplace

Use `.vsix` distribution when you want to share privately, install offline, test internally before publishing, or distribute inside an enterprise.

Use Marketplace distribution when you want users to install through the Extensions view, want versioned public releases and automatic updates, and want a discoverable public extension page.

> **Open-core note:** AI Markdown Studio Pro is now packaged as a standalone extension built from a pinned Community revision plus a private Pro overlay. Community and Pro can therefore be published independently; there is no runtime Marketplace dependency between them.

## 2. Prerequisites

### Required tools

- Node.js 20+ and npm
- Workspace dependencies installed with `npm install`
- The `@vscode/vsce` packaging CLI (already a dev dependency)

### Notable production dependencies

Community ships a small, permissive runtime tree:

- `@mfo/core` — Markdown rendering, sanitization, and presentation parsing (workspace package, MIT)
- `@mfo/preview-web` — shared browser preview runtime and bundled themes/fonts (workspace package, MIT)
- `mermaid`, `katex`, `jsdom`, `markdown-it` (+ plugins), `highlight.js`, `sanitize-html`, `dompurify`, `yaml`, `html-to-docx` (MIT)

Community includes VS Code Language Model API workflows for document/MPS generation and AI Paste. It contains no Puppeteer, PDF/PPTX, Word/PowerShell, Sharp, or resvg implementation. Pro owns browser-backed PDF, high-fidelity Word DOCX, and PPTX paths.

### Project scripts

Defined in the repository-root `package.json`:

| Script | Purpose |
| --- | --- |
| `npm run check:boundary` | Fails if Pro tokens/dependencies/source leak into Community |
| `npm run compile` | Cleans, builds `@mfo/core` and `@mfo/preview-web`, syncs preview assets, compiles the extension |
| `npm test` | Runs the Vitest suite (requires the workspace packages to be compiled first) |
| `npm run package` | Compiles and produces the `.vsix` (runs the VSIX boundary/size check) |
| `npm run verify` | Full gate: `check:boundary` → `compile` → `test` → `package` |

> **Important:** `npm test` on its own imports the compiled `@mfo/core` / `@mfo/preview-web` packages. Run `npm run compile` first, or just run `npm run verify`, which compiles before testing. CI uses the compile-then-test order.

## 3. Pre-release checklist

1. Update the extension `version` in `package.json` (and keep the workspace-root version in step if you tag from it).
2. Confirm `publisher` (`GustavoSerpa`) and `name` (`markdown-ai-studio`) are correct — together they form the Marketplace ID `GustavoSerpa.markdown-ai-studio`.
3. Confirm `license` is `MIT` and the root `LICENSE` is present.
4. Run `npm install`.
5. Run `npm run verify` (boundary → compile → test → package). All must pass.
6. Run `npm audit` and confirm 0 vulnerabilities (or triage findings).
7. Verify the extension activates and that preview, presentation preview, table formatting, HTML export, and basic DOCX export all work.
8. Review `README.md`, `CHANGELOG.md`, and `docs/`.
9. Confirm the packaged VSIX contains no `src/`, test, or `.map` files (the boundary check enforces this).

## 4. Distribute as a file (`.vsix`)

### Step 1 — Build and package

```powershell
npm install
npm run verify
```

`npm run verify` produces a `.vsix` in the repository root, named from the extension name and version, for example `markdown-ai-studio-1.0.0.vsix`.

To package without the full gate (after a successful compile):

```powershell
npm run package
```

### Step 2 — Share the `.vsix`

Distribute the file by email, internal file share, a GitHub/Azure DevOps release artifact, or your organization's software-distribution tooling.

### Step 3 — Install the `.vsix`

**VS Code UI:** Extensions view → `...` menu → **Install from VSIX...** → select the file.

**Command line:**

```powershell
code --install-extension markdown-ai-studio-1.0.0.vsix
```

### Updating a `.vsix` deployment

1. Increment `version` in `package.json`.
2. Rebuild and repackage (`npm run verify`).
3. Redistribute the new `.vsix`. The new package must have a higher version than the installed one.

## 5. Publish to the VS Code Marketplace

### 5.1 Create a publisher

1. Sign in to the Visual Studio Marketplace publisher portal.
2. Create (or reuse) the `GustavoSerpa` publisher.
3. Ensure the `publisher` field in `package.json` matches the publisher ID exactly.

### 5.2 Create a Personal Access Token

Create a Marketplace Personal Access Token with permission to manage extensions. Store it in a secret manager; do not commit it or hard-code it in scripts.

### 5.3 Ensure metadata is ready

Review these fields before public publication: `publisher`, `name`, `displayName`, `description`, `version`, `categories`, `repository`, `license`, `icon`, keywords, `README.md`, and a changelog.

### 5.4 Publish

```powershell
npm run compile
npx vsce login GustavoSerpa     # one-time, stores the token
npx vsce publish                # or: npx vsce publish <newversion>
```

You can publish directly from source or package first and publish the `.vsix` in a release pipeline.

### 5.5 Verify publication

1. Confirm the Marketplace page renders correctly.
2. Install the extension from the Marketplace in a clean VS Code instance.
3. Verify activation, the standard preview, the presentation preview, HTML export, and the preview/edit mode switch.
4. Confirm upgrades work from the previously published version.

## 6. Recommended release workflow

1. Finalize code changes.
2. `npm install`
3. `npm run verify` (boundary → compile → test → package)
4. `npm audit`
5. Manually test preview, presentation preview, table formatting, and HTML export in VS Code.
6. Update `version`.
7. Smoke-test the produced `.vsix` locally.
8. Publish to the Marketplace if desired.
9. Attach the `.vsix` to your release notes for direct download.

## 7. Relationship to the Pro edition

AI Markdown Studio Pro is a **separate standalone** extension built from a pinned Community revision plus a private Pro overlay.

1. Community can be published to the Marketplace or distributed as a `.vsix` on its own schedule.
2. Pro can be published independently because it no longer declares a runtime `extensionDependencies` relationship to Community.
3. Keep the Community public API version (`CommunityApiV1`, currently `"1.0"`) backward-compatible. Pro pins and validates the source-level contract it composes against; if you make a breaking API change, bump the Community API version and ship a matching Pro update.
4. Users install either Community or Pro. Pro already contains the tested Community foundation used for that Pro release.

## 8. CI/CD recommendations

The repository already includes a GitHub Actions workflow (`.github/workflows/ci.yml`) that, on push and PR, runs: install → `check:boundary` → `compile` → `test` → `package`. For releases, extend it to:

1. Run the same gate on tagged commits.
2. Store the `.vsix` as a build artifact.
3. Publish to the Marketplace only on tagged releases, using a Marketplace token from the secret store.

## 9. Common issues

- **Tests fail with `Cannot find package '@mfo/core'`** — the workspace packages were not compiled, or `node_modules/@mfo/*` symlinks are stale (e.g. after renaming the repository folder). Run `npm install` to relink, then `npm run compile`. Prefer `npm run verify`, which compiles first.
- **Boundary check fails** — a Pro command, dependency, or source path leaked into Community. Remove it; Pro-only code belongs in the Pro extension.
- **Packaging fails because metadata is incomplete** — check `package.json` for missing or placeholder values.
- **Publish fails because publisher does not match** — `publisher` must exactly match the Marketplace publisher.
- **Publish fails because the version already exists** — Marketplace versions are immutable; increment `version`.
- **Pro will not activate** — confirm Community is installed and that its `apiVersion` matches what Pro expects.

## 10. Quick reference

```powershell
# Validate the edition boundary
npm run check:boundary

# Build everything
npm run compile

# Full release gate (boundary + compile + test + package)
npm run verify

# Package a .vsix only
npm run package

# Install a .vsix
code --install-extension <path-to-vsix>
```

Must-update fields before public release: `publisher`, `version`, `displayName`, `description`, `icon`, `repository`, and the changelog.

## 11. Suggested next improvements

- Add a `CHANGELOG.md` at the extension root and keep it current per release.
- Add Marketplace `keywords` and a `galleryBanner` for discoverability.
- Add a release workflow that publishes the `.vsix` on tagged commits.
- Add a top-level `SUPPORT.md` describing Community support expectations.
