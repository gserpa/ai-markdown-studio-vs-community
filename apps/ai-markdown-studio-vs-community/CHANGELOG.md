# Changelog

All notable changes to **AI Markdown Studio Community** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.1] - 2026-08-20

### Added

- Added presentation table layout controls with wrapped tables by default and a wide mode for horizontal scrolling.

### Changed

- Made `markdownAiStudio.presentationContentOverflow` default to `scaleToFit`; users can still select `scroll` explicitly.
- Restored the shared Markdown and table styling cascade in the split presentation preview assets.
- Matched presentation table controls to the active presentation theme and kept the wrap and scroll buttons fixed while tables scroll.

### Fixed

- Fixed presentation table controls and content sizing when `scaleToFit` is enabled.
- Fixed presentation table scrolling, button placement, and table visibility when switching between wrapped and wide layouts.

## [1.2.0] - 2026-08-15

### Added

- Added provider-specific workspace presentation skills: a manual, tool-first GitHub Copilot profile and complete standalone profiles for Claude and Codex.
- Added a presentation-skill installer that lets users select GitHub Copilot, Claude, or Codex and writes the corresponding skill to that agent's workspace folder without overwriting an existing skill.
- Made **Generate Presentation (AI)** a portable workflow: when native Copilot generation is unavailable or declined, it copies the complete canonical MPS prompt for use in another assistant.

### Changed

- Kept MPS prompt-building, validation, and confirmed-save tools local and available independently of extension-initiated Copilot consent. A chat provider receives their data only when the user starts a chat request.
- Updated Community documentation to describe the Copilot, Claude, Codex, and Copy Prompt presentation workflows.
- Bundled the extension host and package only the Mermaid and KaTeX webview assets instead of the full runtime dependency tree, substantially reducing the Community VSIX file count.

## [1.1.1] - 2026-08-12

### Fixed

- Corrected a minor presentation theme colour inconsistency that could make headings and bold table text appear grey instead of using the active presentation palette.

### Added

- Added an opt-in `markdownAiStudio.presentationContentOverflow` setting for presentation previews. `scaleToFit` fits overflowing slide content down to 60%, scales long code blocks locally first, and preserves scrolling when content remains too dense.

## [1.1.0] - 2026-07-31

### Added

- Copilot agent tools that build the canonical MPS presentation prompt, validate generated presentation Markdown, and save approved Markdown inside the current workspace.
- Explicit tool activation events and regression coverage for prompt defaults, remote-resource guidance, validation, confirmation, safe paths, and collision-free saves.

### Changed

- Community and Pro edition boundaries now recognize the MPS agent workflow as Community-owned while document and theme agent tools remain Pro features.
- User, deployment, upgrade, and security documentation now describe the Community MPS agent workflow.
- Patched DOMPurify, linkify-it, and PostCSS dependency resolutions reported by the release audit.

## [1.0.0] - 2026-07-15

First public release of the open-source AI Markdown Studio Community extension.
