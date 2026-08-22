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

If a tool is unavailable, use this backup specification: include YAML front matter with `filename`, `document: presentation`, `title`, `theme`, and `ratio`; separate slides with top-level `---`; use one `# H1` title per slide; place at most one supported `<!--slide: name-->` directive immediately after a separator and before the title; use concise `<!--notes: ...-->` comments on content slides; and do not invent image URLs or local paths. Use `default` for large-width media in the natural, left-aligned Markdown sequence; use `image-center` for image-centric or stronger messages with centered text and media; use `image-right` only for narrower media beside substantive left-column text. Supported directives are `cover`, `default`, `two-columns`, `image-right`, `image-center`, `side-banner`, `side-picture`, `default-side`, `table`, `table-legend`, `divider`, `section-divider`, `divider-b`, `divider-c`, and `thanks`.
