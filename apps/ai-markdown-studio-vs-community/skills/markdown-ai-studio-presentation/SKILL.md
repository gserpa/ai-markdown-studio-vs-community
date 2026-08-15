---
name: markdown-ai-studio-presentation
description: Create, revise, validate, or repair complete Markdown Presentation Specification (MPS) decks for AI Markdown Studio. Use for Markdown slides, presentation-mode Markdown, or decks that must preview and export correctly in AI Markdown Studio.
---

# AI Markdown Studio Presentations

Create a complete Markdown file, not an outline. Do not assume AI Markdown Studio extension tools are available.

## Workflow

1. Resolve the output path before writing. If the user supplied one, use it. If not and the workspace is clear, choose a sensible workspace-relative filename and report it in the final response. Ask only when the location is consequential or an existing file would be overwritten. Never overwrite an existing file without confirmation.
2. Plan the slide count, narrative arc, layouts, notes, and image needs before drafting. Use a slide ledger: every separator-delimited unit counts as one slide, including `cover`, `divider`, `section-divider`, and `thanks`. Match an explicit slide count exactly.
3. Write the complete deck, then validate its structure with the available tools or a front-matter-aware manual check. Do not count slides by splitting the entire file on `---`.
4. Repair every structural issue and run the complete structural check again. Never correct count by deleting only a separator, directive, or title; add or remove a complete separator-delimited slide unit. When a local preview or export command is available, use it as a second check; otherwise report structural validation only and do not claim visual rendering QA.

## MPS rules

- Start with YAML front matter containing `filename`, `document: presentation`, `title`, `theme`, and `ratio` (`16:9` or `4:3`). Keep `filename` consistent with the output basename.
- Separate slides with top-level `---` after the front matter. Give every slide exactly one `# H1` title.
- Use at most one `<!--slide: name-->` directive per slide, immediately after its separator and before its title. Supported directives: `cover`, `default`, `two-columns`, `image-right`, `divider`, `section-divider`, `table`, `table-legend`, and `thanks`.
- Use `## H2` headings for the sections of a `two-columns` slide. Put the first image or Mermaid diagram on an `image-right` slide in its media panel, and do not place another image before it.
- Add concise `<!--notes: ...-->` speaker notes to content slides. Cover, divider, section-divider, and thanks slides may omit notes. Keep visible slide content concise and vary layouts deliberately.

## Images

- Do not invent image URLs or local file paths. Use a verified direct image URL only when remote resources are permitted; otherwise add an image suggestion in notes or a blockquote.
- Verify the exact image or file page first, then verify the image URL with a normal `GET` or browser fetch. Wikimedia `Special:FilePath/...` URLs count as direct image URLs when they resolve to an image. A browser-tool safety rejection is not evidence that a verified candidate is invalid; do not bypass the control—use another allowed client such as a normal `GET`, or use a verified alternative or image suggestion. Do not treat a failed `HEAD` request or a temporary `429` rate limit as proof that a verified file is unavailable.
- On image slides, include a short source link to the exact file page when practical. Keep attribution and source text concise.

## Validation

Use a front-matter-aware validation process rather than an ad-hoc separator split. Parse and remove the initial YAML front matter before splitting the remaining body on top-level `---`; otherwise the YAML opening fence is falsely counted as a slide and front matter appears missing. Validate front matter, exact slide count when specified (including every separator-delimited layout slide), separators, one H1 per slide, directive placement and support, image URL shape, and notes. Require notes on content slides only; `cover`, `divider`, `section-divider`, and `thanks` may omit them. Repair structural issues while preserving the requested content.
