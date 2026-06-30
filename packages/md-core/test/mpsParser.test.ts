import { describe, expect, it } from 'vitest';
import {
  extractMarkdownFrontMatterMeta,
  getMarkdownDocumentKind,
  isMarkdownPresentationSource,
  parseMarkdownPresentation,
  resolveMarkdownPresentation,
  stripMarkdownFrontMatter,
} from '../src/presentation/mpsParser';

describe('parseMarkdownPresentation', () => {
  it('strips a leading frontmatter block without removing body separators', () => {
    const source = ['---', 'theme: light', 'tags:', '  - export', '---', '', '# Title', '', '---', '', 'Body'].join('\n');

    expect(stripMarkdownFrontMatter(source)).toBe(['', '# Title', '', '---', '', 'Body'].join('\n'));
  });

  it('does not mistake leading horizontal rules for frontmatter', () => {
    const source = ['---', 'Introductory prose', '---', '', '# Title'].join('\n');

    expect(stripMarkdownFrontMatter(source)).toBe(source);
  });

  it('does not throw on invalid YAML front matter', () => {
    const source = `---
title: Strategic Planning Group: Project Charter and Operating Model
---

## Executive Summary

Body text.
`;

    expect(() => parseMarkdownPresentation(source)).not.toThrow();
    expect(isMarkdownPresentationSource(source)).toBe(false);
    expect(getMarkdownDocumentKind(source)).toBe('text');
    expect(extractMarkdownFrontMatterMeta(source)).toEqual({});
  });

  it('parses front matter, template overrides, and notes', () => {
    const presentation = parseMarkdownPresentation(`---
title: Deck Title
author: Ada
theme: modern-blue
---

# Opening

Intro body

<!--notes: Speaker note-->

---

<!--slide: two-columns-->
# Problem

## Left
- A

## Right
- B
`);

    expect(presentation.meta.title).toBe('Deck Title');
    expect(presentation.meta.author).toBe('Ada');
    expect(presentation.slides).toHaveLength(2);
    expect(presentation.slides[0].template).toBe('default');
    expect(presentation.slides[0].body).toContain('# Opening');
    expect(presentation.slides[0].notes).toContain('Speaker note');
    expect(presentation.slides[1].template).toBe('two-columns');
  });

  it('treats the first slide as body content when it starts immediately after front matter', () => {
    const presentation = parseMarkdownPresentation(`---
title: Immediate Start
---
# First slide

Content

---

# Second slide
`);

    expect(presentation.slides).toHaveLength(2);
    expect(presentation.slides[0].body).toContain('# First slide');
    expect(presentation.slides[1].body).toContain('# Second slide');
  });

  it('ignores slide separators inside fenced code blocks', () => {
    const presentation = parseMarkdownPresentation(`# Architecture

\`\`\`mermaid
flowchart LR
  A --> B
  ---
  B --> C
\`\`\`

---

# Next
`);

    expect(presentation.slides).toHaveLength(2);
    expect(presentation.slides[0].body).toContain('flowchart LR');
    expect(presentation.slides[0].body).toContain('---');
  });

  it('does not confuse a leading slide separator with front matter', () => {
    const presentation = parseMarkdownPresentation(`---
# Title Slide

---

# Follow-up
`);

    expect(presentation.slides).toHaveLength(2);
    expect(presentation.slides[0].body).toContain('# Title Slide');
  });

  it('rejects misplaced slide directives', () => {
    expect(() => parseMarkdownPresentation(`# Title

<!--slide: two-columns-->
Body
`)).toThrow(/first non-whitespace content after the slide separator/u);
  });

  it('treats the legacy notes marker as a stripped comment and keeps following content in the slide body', () => {
    const presentation = parseMarkdownPresentation(`# Title

Intro body.

<!--notes-->
This remains visible body content.
`);

    expect(presentation.slides[0].notes).toBeUndefined();
    expect(presentation.slides[0].body).toContain('This remains visible body content.');
  });

  it('collects <!--notes: ...--> and <!--speaker notes: ...--> comments as speaker notes (case-insensitive)', () => {
    const presentation = parseMarkdownPresentation(`# Title

Visible body text.

<!--notes: Presenter note one.-->
<!--SPEAKER NOTES: Presenter note two.-->
<!--Speaker Notes: Presenter note three.-->
<!--notes:   Presenter note four.   -->
`);

    expect(presentation.slides[0].body).toContain('Visible body text.');
    expect(presentation.slides[0].body).not.toContain('Presenter note one.');
    expect(presentation.slides[0].notes).toContain('Presenter note one.');
    expect(presentation.slides[0].notes).toContain('Presenter note two.');
    expect(presentation.slides[0].notes).toContain('Presenter note three.');
    expect(presentation.slides[0].notes).toContain('Presenter note four.');
  });

  it('keeps backticked comment markers inside speaker notes without truncating the note', () => {
    const presentation = parseMarkdownPresentation(`# Title

<!--notes: Title slide. No \`<!--slide:-->\` marker is set, so this should render using the default/cover layout derived from the front matter title, subtitle, and author.-->
`);

    expect(presentation.slides[0].notes).toContain('No \`<!--slide:-->\` marker is set');
    expect(presentation.slides[0].body).not.toContain('marker is set, so this should render');
  });

  it('ignores other HTML comments and Marp directives as speaker notes', () => {
    const presentation = parseMarkdownPresentation(`# Title

Visible body text.

<!-- _class: lead -->
<!-- just a comment -->
<!--notess: typo, not recognized-->
<!--notes -->
<!--speaker notes-->
<!--notes:-->
<!--speaker notes:   -->
`);

    expect(presentation.slides[0].notes).toBeUndefined();
    expect(presentation.slides[0].body).toContain('# Title');
    expect(presentation.slides[0].body).toContain('Visible body text.');
  });

  it('does not treat Marp directives as speaker notes', () => {
    const presentation = parseMarkdownPresentation(`<!-- _class: lead -->
# Title

Body
`);

    expect(presentation.slides[0].notes).toBeUndefined();
    expect(presentation.slides[0].body).toContain('# Title');
  });
});

describe('resolveMarkdownPresentation', () => {
  it('prepends an implicit cover slide when front matter defines a title', () => {
    const presentation = resolveMarkdownPresentation(parseMarkdownPresentation(`---
title: Deck Title
subtitle: Deck Subtitle
author: Ada
---

# Opening

Intro body.
`));

    expect(presentation.meta.title).toBe('Deck Title');
    expect(presentation.meta.subtitle).toBe('Deck Subtitle');
    expect(presentation.slides).toHaveLength(2);
    expect(presentation.slides[0].template).toBe('cover');
    expect(presentation.slides[0].body).toContain('# Deck Title');
    expect(presentation.slides[0].body).toContain('Deck Subtitle');
    expect(presentation.slides[0].body).toContain('Ada');
    expect(presentation.slides[1].body).toContain('# Opening');
  });

  it('derives metadata from an explicit first cover slide and skips implicit cover generation', () => {
    const presentation = resolveMarkdownPresentation(parseMarkdownPresentation(`---
title: Front Matter Title
subtitle: Front Matter Subtitle
---

<!--slide: cover-->
# Custom Cover Title

Custom Cover Subtitle

---

# Opening
`));

    expect(presentation.meta.title).toBe('Custom Cover Title');
    expect(presentation.meta.subtitle).toBe('Custom Cover Subtitle');
    expect(presentation.slides).toHaveLength(2);
    expect(presentation.slides[0].template).toBe('cover');
    expect(presentation.slides[0].body).toContain('# Custom Cover Title');
  });

  it('falls back deck title to the first slide heading when no front matter title exists', () => {
    const presentation = resolveMarkdownPresentation(parseMarkdownPresentation(`---
theme: modern-blue
---

# Deck Title From Heading

Intro body

---

# Second Slide
`));

    expect(presentation.meta.title).toBe('Deck Title From Heading');
    expect(presentation.slides).toHaveLength(2);
    expect(presentation.slides[0].template).toBe('default');
  });
});
