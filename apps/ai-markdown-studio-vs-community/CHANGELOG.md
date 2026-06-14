# Changelog

All notable changes to **AI Markdown Studio Community** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-12

First public release of the open-source Community edition, split out from AI Markdown Studio
as the MIT-licensed core. Community is fully standalone; AI-assisted document and
presentation generation, AI Paste to Markdown, HTML export, and basic DOCX export live here.
AI Markdown Studio Pro provides the remaining advanced export, conversion, theme AI, agent,
and corporate-template features and depends on Community.

### Added

- Preview-first Markdown custom editor with single-surface-per-file mode switching
  (**Preview Markdown** / **Edit Markdown**).
- Live document preview: standard Markdown, syntax highlighting (highlight.js), Mermaid
  diagrams (strict mode) with in-place zoom overlay, KaTeX math, task lists, footnotes, and
  emoji.
- Slide-based **presentation preview** for `document: presentation` files: slide and keyboard
  navigation, collapsible filmstrip, immersive fullscreen, fixed-canvas scaling, speaker
  notes, and template-aware layouts (`cover`, `default`, `two-columns`, `image-right`,
  `divider`).
- Document themes (`auto`, `light`, `light-modern-blue`, `dark`, `dark-aurora-noir`,
  `dark-modern-aurora`, `night-sky`) and presentation themes (`black`, `galaxy`,
  `modern-blue`), plus workspace and global custom theme directories.
- **Format Markdown Tables** command, also registered as a document formatter.
- Standalone **HTML export**.
- Front-matter display toggle in the preview.
- Extensible command launcher (**Show AI Markdown Studio Commands**) and a settings shortcut.
- Public `CommunityApiV1` extension API (rendering, parsing, themes, table formatting,
  resource resolution, and feature-contribution registration) for feature extensions such as
  AI Markdown Studio Pro.
- `markdownAiStudio.allowRemoteResources` privacy control for remote resource loading.

### Security

- HTML sanitization, restrictive webview Content Security Policy, Mermaid `securityLevel:
  'strict'`, and scoped `localResourceRoots`.
- Automated Community boundary check that keeps Pro source, dependencies, commands, and
  first-party source/test files out of the published package. See
  [docs/security-review.md](docs/security-review.md).

### Documentation

- Community-scoped README, user guide, deployment guide, security review, and Community API
  reference.
- Enriched third-party license notices confirming an all-permissive dependency tree.
