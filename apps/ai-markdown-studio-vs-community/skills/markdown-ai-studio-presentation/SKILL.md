---
name: markdown-ai-studio-presentation
description: Create, revise, validate, or repair complete Markdown Presentation Specification (MPS) decks for AI Markdown Studio. Use for Markdown slides, presentation-mode Markdown, or decks that must preview and export correctly in AI Markdown Studio.
argument-hint: "<presentation brief>"
---

# AI Markdown Studio Presentations

Create a complete Markdown file, not an outline. Save it only after the user has approved the target path. Follow these rules directly; do not assume AI Markdown Studio extension tools are available.

- Start with YAML front matter containing `filename`, `document: presentation`, `title`, `theme`, and `ratio` (`16:9` or `4:3`).
- Separate slides with top-level `---`. Give every slide one `# H1` title.
- Use at most one `<!--slide: name-->` directive per slide, immediately after its separator and before its title. Supported directives: `cover`, `default`, `two-columns`, `image-right`, `divider`, `section-divider`, `table`, `table-legend`, and `thanks`.
- Use `## H2` headings for the sections of a `two-columns` slide. Put the first image or Mermaid diagram on an `image-right` slide in its media panel.
- Add concise `<!--notes: ...-->` speaker notes to content slides. Keep visible slide content concise and vary layouts deliberately.
- Do not invent image URLs or local file paths. Use a verified direct image URL only when remote resources are permitted; otherwise add an image suggestion in notes or a blockquote.
- Before finishing, validate front matter, separators, titles, directive placement, supported directives, and notes. Repair structural issues while preserving the requested content.
