# Changelog

All notable changes to **AI Markdown Studio Community** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
