---
name: markdown-ai-studio-document
description: Create or revise Markdown documents for AI Markdown Studio, including reports, guides and project updates. Do not use for slide decks, themes, or verbatim format conversion.
---

# AI Markdown Studio Documents

1. Use the Markdown AI Studio document prompt tool if available. Otherwise, for a new document start with YAML front matter containing `filename` and `theme` (default `auto`), followed by one `#` title and the complete Markdown body. Do not set `document: presentation`. Preserve unrelated metadata and content when revising an existing document.
2. Read the [shared authoring reference](references/visualizations.md) before drafting, even if no feature was requested. Match each major section to its reader intent; choose among plain Markdown, Mermaid, single or combined Vega-Lite charts, metrics, formulas, emoji, and components. Do not pad the document or invent data, sources, or file paths.
3. Recheck the choices before delivery. Explain the takeaway of each visual and keep exact data accessible when needed. Remove features that add no value. Use the document validator if available; otherwise review front matter, heading and fence structure manually. Check features in the target preview or export when possible; do not claim rendering or export validation if it was not performed.
4. Deliver the complete document, not an outline. If saving a new file, use the requested destination or a sensible new workspace path; ask before overwriting an existing file. If using the Studio save tool, get approval first.
