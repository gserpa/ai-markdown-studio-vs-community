---
name: markdown-ai-studio-presentation-copilot
description: Create, revise, validate, or repair an AI Markdown Studio Markdown Presentation Specification (MPS) deck with GitHub Copilot. Use explicitly when the extension tools are available and the user wants a presentation that previews and exports correctly.
argument-hint: "<presentation brief>"
disable-model-invocation: true
---

# AI Markdown Studio Presentations with Copilot

Use the extension tools in this order:

1. Call `#markdownPresentationPrompt` with the user's brief, audience, tone, slide count, theme, and ratio before drafting.
2. Generate the complete Markdown deck from the returned canonical prompt. Return raw Markdown, not an outline or a fenced code block.
3. Call `#validateMarkdownPresentation`; repair every structural issue and validate again.
4. Ask the user to approve the destination, then call `#saveMarkdownStudioFile`. Never overwrite an existing file.

During planning and final review, use [the shared authoring reference](references/visualizations.md), even if the brief does not name any features. Choose the simplest format that supports the takeaway; consider Mermaid, combined charts, metrics, formulas, emoji and components where useful. Repair any invalid authored blocks reported by validation before saving.

If a tool is unavailable, use this backup specification: include YAML front matter with `filename`, `document: presentation`, `title`, `theme`, and `ratio`; separate slides with top-level `---`; use one `# H1` title per slide; place at most one supported `<!--slide: name-->` directive immediately after a separator and before the title; use concise `<!--notes: ...-->` comments on content slides; and do not invent image URLs or local paths. Use `content` for mixed material and tables, `illustrated-text` for explanation with a supporting visual, `featured-visual` for a dominant visual, and `brief` for a compact orientation. Use `<!--column-break-->` between two-column bodies. The theme and PPTX template choose placement. Supported directives are `content`, `cover`, `two-column`, `illustrated-text`, `featured-visual`, `brief`, `divider`, and `thanks`.

## Mixed body content and template defaults

Prefer `content` for ordinary slides containing paragraphs, tables, images, and Mermaid diagrams.
Preserve their Markdown sequence, including text between multiple tables or media blocks.
Use specialized layouts for intentional structural differences rather than each content combination.
Do not add template or manifest paths merely to repeat a configured default: Pro uses workspace/global
PPTX defaults automatically, while explicit document front matter takes precedence. Never invent a
local filesystem path. Template onboarding and approved flow regions handle placement during export.

## Optional heading roles

Keep ordinary slides simple: existing headings and body paragraphs need no extra markers. Only when the brief requests a distinct context label or slide subtitle, use `<!-- slide-label -->` or `<!-- slide-subtitle -->` before one top-level text paragraph, at most once per role. Do not infer a subtitle from an ordinary opening paragraph. The layout decides visibility and placement; a missing slot omits the optional field. Markers in code examples are literal. Current PPTX adapters do not place these optional roles.

## Optional content areas

Ordinary slides need no area markers. When a content slide needs two to four independent areas, place `<!-- region-break -->` between non-empty areas, at most three times. Do not mix it with `<!--column-break-->`. PowerPoint currently exports area content in normal flow and warns that the arrangement is not retained.
