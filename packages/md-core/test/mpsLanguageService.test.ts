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
    expect(issues.some((issue) => issue.message.includes('only once and at the start of a slide'))).toBe(true);
  });

  it('warns for custom slide templates that are not built in', () => {
    const issues = validateMpsSource(`---
document: presentation
---

<!--slide: customer-agenda-->
# Agenda
`, schema);

    expect(issues.some((issue) => issue.message.includes('not a built-in layout'))).toBe(true);
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

<!--slide: im`;
    const completions = getMpsCompletions(source, source.length, schema);

    expect(completions.some((completion) => completion.label === 'image-right')).toBe(true);
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
    expect(slideHover?.markdown).toContain('Assigns a slide template');
    expect(slideHover?.markdown).toContain('manifest aliases/overrides');
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