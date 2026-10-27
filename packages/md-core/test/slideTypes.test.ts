import { describe, expect, it } from 'vitest';
import { normalizePresentationSlideType, splitPresentationColumns } from '../src/presentation/slideTypes';
import { parseMarkdownPresentation } from '../src/presentation/mpsParser';
import { getSlideTypeMigrations, validateMpsSource } from '../src/presentation/mpsLanguageService';

describe('slide content types and migration', () => {
  it('translates retired names in memory without modifying the authored source', () => {
    const source = '---\r\ndocument: presentation\r\n---\r\n<!--slide: image-right-->\r\n# Example\r\n\r\nText';
    expect(parseMarkdownPresentation(source).slides[0].template).toBe('illustrated-text');
    const [migration] = getSlideTypeMigrations(source);
    expect(source.slice(migration.start, migration.end)).toBe('image-right');
    expect(source).toContain('<!--slide: image-right-->');
    expect(normalizePresentationSlideType('side-picture')).toBe('featured-visual');
    expect(normalizePresentationSlideType('default-side')).toBe('brief');
  });

  it('ignores fenced examples and front matter when proposing edits', () => {
    const source = '---\ndocument: presentation\ntitle: image-right\n---\n# Example\n\n```md\n<!--slide: image-right-->\n```\n\n---\n<!--slide: table-->\n# Data';
    const migrations = getSlideTypeMigrations(source);
    expect(migrations).toHaveLength(1);
    expect(migrations[0]).toMatchObject({ slide: 2, legacyType: 'table', replacements: ['content'] });
  });

  it('preserves explicit column boundaries through parsing and ignores code examples', () => {
    const slide = parseMarkdownPresentation('<!--slide: two-column-->\n# Pair\n\nLeft\n\n<!--column-break-->\n\nRight').slides[0];
    expect(splitPresentationColumns(slide.body)).toEqual(['# Pair\n\nLeft\n', '\nRight']);
    expect(splitPresentationColumns('```md\n<!--column-break-->\n```')).toBeUndefined();
    expect(() => splitPresentationColumns('A\n<!--column-break-->\nB\n<!--column-break-->\nC')).toThrow('exactly one');
  });

  it('warns on every retired directive and errors on unknown types', () => {
    const issues = validateMpsSource('---\ndocument: presentation\n---\n<!--slide: image-right-->\n# A\n---\n<!--slide: default-side-->\n# B\n---\n<!--slide: typo-type-->\n# C');
    expect(issues.filter(issue => issue.code === 'legacy-slide-types').map(issue => issue.severity)).toEqual(['warning', 'warning']);
    expect(issues.find(issue => issue.code === 'unknown-slide-template')?.severity).toBe('error');
  });
});
