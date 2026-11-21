# Markdown and presentation authoring reference

This page describes source syntax available to Community users. It is an authoring reference, not a guide to extension internals. Start with the [document](first-document.md) or [presentation](first-presentation.md) tutorial if you are new to the product.

## Document files

An ordinary `.md` file opens in document preview. Use headings, paragraphs, links, images, lists, task lists, tables, fenced code, Mermaid diagrams, and KaTeX math in Markdown. A front matter block can set document metadata and a bundled theme. The [user guide](user-guide.md#markdown-preview) shows the preview behavior and [table formatting](user-guide.md#table-formatting).

```markdown
---
title: Project notes
theme: light
---

# Project notes

| Topic | Owner |
| --- | --- |
| Draft | Team |
```

## Presentation files

Set `document: presentation` in YAML front matter. Optional fields include `title`, `author`, a bundled `theme`, and `ratio` (`"16:9"` or `"4:3"`). A line containing only `---` separates slides after front matter. A slide normally begins with a heading. Add `<!--slide: type-->` before its content to select a content type. Attach speaker notes with `<!--notes: ...-->` or `<!--speaker notes: ...-->`.

| Content type | Use it for |
| --- | --- |
| `content` | A flowing mix of text, tables, images, diagrams, and components |
| `cover` | Opening title and introduction |
| `two-column` | Two distinct content groups; use one `<!--column-break-->` to mark their boundary |
| `illustrated-text` | Substantive text with a supporting visual |
| `featured-visual` | A primary visual with supporting text |
| `brief` | A short highlighted message |
| `divider` | A section transition |
| `thanks` | A closing slide |

The type describes content purpose. The active preview theme chooses placement. If you have older slide directives, use the [migration guide](migration-guide.md). The [presentation guide](user-guide.md#presentation-preview) covers navigation, themes, and overflow.

## Visual blocks

Use fenced `mermaid` code for diagrams. Community also supports schema-validated `vega-lite` charts, `metric` cards, and bundled presentation components. The [visualization reference](visualizations.md) gives JSON examples and limits; the [dashboard example](../examples/dashboard-composition.md) shows these blocks together. Other Markdown viewers retain their source text.

## AI-generated content

Review generated text, data, and citations before sharing. Community can guide document and presentation generation through configured Copilot, and can copy a complete presentation prompt for another assistant. See [guided generation](user-guide.md#guided-ai-generation) and [privacy](security-and-privacy.md).
