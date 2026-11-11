import { describe, expect, it } from 'vitest';
import { getMpsCompletions, getMpsHover, getMpsQuickFixes, validateMpsSource } from '../src/presentation/mpsLanguageService';
import { createMpsDocumentSchema } from '../src/presentation/mpsSchema';

const schema = createMpsDocumentSchema(['black', 'galaxy', 'modern-blue']);

describe('validateMpsSource', () => {
  it('warns when presentation markers are used without document: presentation', () => {
    const issues = validateMpsSource(`<!--slide: two-columns-->
# Title
`, schema);

    expect(issues.some((issue) => issue.message.includes('document: presentation'))).toBe(true);
  });

  it('does not warn for plain markdown front matter without presentation markers', () => {
    const issues = validateMpsSource(`---
theme: auto
title: Notes
---

# Title

Body text.
`, schema);

    expect(issues.some((issue) => issue.code === 'missing-document-kind')).toBe(false);
  });

  it('validates front matter enum values and slide directive placement', () => {
    const issues = validateMpsSource(`---
document: presentation
ratio: 3:2
theme: sunset
---

# Title
<!--slide: two-columns-->
`, schema);

    expect(issues.some((issue) => issue.message.includes('ratio must be one of'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('Unknown theme sunset'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('only once and as the first non-whitespace content after the slide separator'))).toBe(true);
  });

  it('errors for unknown slide content types', () => {
    const issues = validateMpsSource(`---
document: presentation
---

<!--slide: customer-agenda-->
# Agenda
`, schema);

    expect(issues.some((issue) => issue.code === 'unknown-slide-template' && issue.severity === 'error')).toBe(true);
  });

  it('marks missing document kind with a structured quick-fix code', () => {
    const issues = validateMpsSource(`<!--slide: two-columns-->
# Title
`, schema);

    expect(issues.find((issue) => issue.code === 'missing-document-kind')).toBeDefined();
  });

  it('ignores slide directive examples inside inline code spans', () => {
    const issues = validateMpsSource('`<!--slide: template-name-->`', schema);

    expect(issues.find((issue) => issue.code === 'missing-document-kind')).toBeUndefined();
  });

  it('ignores slide directive examples inside fenced code blocks', () => {
    const issues = validateMpsSource(`\`\`\`markdown
<!--slide: template-name-->
\`\`\`
`, schema);

    expect(issues.find((issue) => issue.code === 'missing-document-kind')).toBeUndefined();
  });
});

describe('getMpsCompletions', () => {
  it('suggests front matter keys while editing the header', () => {
    const source = `---
document: presentation
ra
---`;
    const completions = getMpsCompletions(source, source.indexOf('ra') + 2, schema);

    expect(completions.some((completion) => completion.label === 'ratio')).toBe(true);
  });

  it('suggests enum values for ratio and theme fields', () => {
    const source = `---
document: presentation
ratio: 
theme: 
---`;
    const ratioCompletions = getMpsCompletions(source, source.indexOf('ratio: ') + 'ratio: '.length, schema);
    const themeCompletions = getMpsCompletions(source, source.indexOf('theme: ') + 'theme: '.length, schema);

    expect(ratioCompletions.some((completion) => completion.label === '16:9')).toBe(true);
    expect(ratioCompletions.some((completion) => completion.label === '4:3')).toBe(true);
    expect(themeCompletions.some((completion) => completion.label === 'modern-blue')).toBe(true);
  });

  it('suggests built-in template names inside slide directives', () => {
    const source = `---
document: presentation
---

<!--slide: ill`;
    const completions = getMpsCompletions(source, source.length, schema);

    expect(completions.some((completion) => completion.label === 'illustrated-text')).toBe(true);
    expect(completions.some((completion) => completion.label === 'image-right')).toBe(false);
  });

  it('offers a full presentation header snippet at the top of an empty file', () => {
    const completions = getMpsCompletions('', 0, schema);

    expect(completions.some((completion) => completion.label === 'MPS presentation header')).toBe(true);
  });

  it('does not offer slide directive completions in regular markdown without a presentation header', () => {
    const source = '<!--slide: im';
    const completions = getMpsCompletions(source, source.length, schema);

    expect(completions.some((completion) => completion.label === 'image-right')).toBe(false);
    expect(completions.some((completion) => completion.label === '<!--slide: ...-->')).toBe(false);
  });
});

describe('getMpsHover', () => {
  it('describes front matter keys and slide directives', () => {
    const source = `---
document: presentation
ratio: 16:9
---

<!--slide: two-columns-->
# Title
`;

    const ratioHover = getMpsHover(source, source.indexOf('ratio') + 1, schema);
    const slideHover = getMpsHover(source, source.indexOf('slide') + 1, schema);
    expect(ratioHover?.markdown).toContain('Target slide aspect ratio');
    expect(ratioHover?.markdown).toContain('16:9');
    expect(slideHover?.markdown).toContain('Describes the slide content');
    expect(slideHover?.markdown).toContain('unknown names are errors');
  });
});

describe('getMpsQuickFixes', () => {
  it('inserts presentation front matter when markers exist without a header', () => {
    const source = `<!--slide: two-columns-->
# Title
`;
    const issue = validateMpsSource(source, schema).find((entry) => entry.code === 'missing-document-kind');

    expect(issue).toBeDefined();
    const fixes = getMpsQuickFixes(source, issue!, schema);

    expect(fixes).toContainEqual(expect.objectContaining({
      title: 'Insert presentation front matter',
      start: 0,
      end: 0,
    }));
  });

  it('replaces an incorrect document kind with presentation', () => {
    const source = `---
document: executive-summary
title: Deck
---

<!--slide: two-columns-->
# Title
`;
    const issue = validateMpsSource(source, schema).find((entry) => entry.code === 'missing-document-kind');

    expect(issue).toBeDefined();
    const fixes = getMpsQuickFixes(source, issue!, schema);

    expect(fixes).toContainEqual(expect.objectContaining({
      title: 'Set document kind to presentation',
      newText: 'presentation',
    }));
  });

  it('renames non-canonical front matter keys', () => {
    const source = `---
Document: presentation
---
`;
    const issue = validateMpsSource(source, schema).find((entry) => entry.code === 'noncanonical-frontmatter-key');

    expect(issue).toBeDefined();
    const fixes = getMpsQuickFixes(source, issue!, schema);

    expect(fixes).toContainEqual(expect.objectContaining({
      title: 'Rename key to document',
      newText: 'document',
    }));
  });
});

describe('optional heading role authoring', () => {
  it('offers optional markers without adding them to the default front matter snippet', () => {
    const source = '---\ndocument: presentation\n---\n\n<!--';
    const completions = getMpsCompletions(source, source.length, schema);
    expect(completions.map(item => item.label)).toContain('<!-- slide-label -->');
    expect(completions.map(item => item.label)).toContain('<!-- slide-subtitle -->');
    expect(schema.frontMatterSnippet).not.toContain('slide-label');
  });

  it('provides marker hover and duplicate diagnostics at source positions', () => {
    const source = '---\ndocument: presentation\n---\n<!--slide: content-->\n<!-- slide-label -->\nFirst\n\n<!-- slide-label -->\nSecond';
    const issues = validateMpsSource(source, schema).filter(issue => issue.code === 'invalid-heading-marker');
    expect(issues).toHaveLength(2);
    expect(source.slice(issues[1].start, issues[1].end)).toBe('<!-- slide-label -->');
    const hover = getMpsHover(source, source.indexOf('slide-label') + 2, schema);
    expect(hover?.markdown).toContain('Optional context label');
  });

  it('allows one label per slide and ignores code examples during validation', () => {
    const source = '---\ndocument: presentation\n---\n<!--slide: content-->\n<!-- slide-label -->\nOne\n\n# Title\n\n~~~md\n<!-- slide-label -->\n~~~\n\n---\n<!-- slide-label -->\nTwo\n\n# Title two';
    expect(validateMpsSource(source, schema).filter(issue => issue.code === 'invalid-heading-marker')).toEqual([]);
  });

  it('reports an unclosed optional marker without validating ordinary documents as slide sources', () => {
    const source = '---\ndocument: presentation\n---\n# Title\n\n<!-- slide-label\nText';
    expect(validateMpsSource(source, schema).some(issue => issue.code === 'invalid-heading-marker')).toBe(true);
    expect(validateMpsSource('# Notes\n\n<!-- slide-label\nText', schema).some(issue => issue.code === 'invalid-heading-marker')).toBe(false);
  });
});

describe('heading diagnostics on Windows source', () => {
  it('keeps duplicate marker ranges correct with CRLF and resets them between slides', () => {
    const source = ['---','document: presentation','---','<!--slide: content-->','<!-- slide-label -->','First','','<!-- slide-label -->','Second','','---','<!-- slide-label -->','Third'].join('\r\n');
    const issues = validateMpsSource(source, schema).filter(issue => issue.code === 'invalid-heading-marker');
    expect(issues).toHaveLength(2);
    for (const issue of issues) expect(source.slice(issue.start, issue.end)).toBe('<!-- slide-label -->');
  });
});

describe('content area guidance', () => {
  it('offers an optional region marker without changing the ordinary snippet', () => {
    const source = '---\ndocument: presentation\n---\n\n<!--';
    expect(getMpsCompletions(source, source.length, schema).map(item => item.label)).toContain('<!-- region-break -->');
    expect(schema.frontMatterSnippet).not.toContain('region-break');
  });
  it('locates invalid region markers and ignores examples in code', () => {
    const source = '---\ndocument: presentation\n---\n<!--slide: two-column-->\n# Title\n\n~~~md\n<!-- region-break -->\n~~~\n\nFirst\n\n<!-- region-break -->\nSecond';
    const issues = validateMpsSource(source, schema).filter(issue => issue.code === 'invalid-region-break');
    expect(issues).toHaveLength(1);
    expect(source.slice(issues[0].start, issues[0].end)).toBe('<!-- region-break -->');
  });
});
