import { describe, expect, it } from 'vitest';
import { parseMarkdownPresentation } from '../src/presentation/mpsParser';
import { splitPresentationRegions } from '../src/presentation/presentationSource';

describe('optional content areas', () => {
  it('exposes valid areas while keeping body text available to existing output adapters', () => {
    const slide = parseMarkdownPresentation('# Title\n\nFirst\n\n<!-- region-break -->\nSecond\n\n<!--notes: Presenter note-->').slides[0];
    expect(slide.regions).toEqual(['# Title\n\nFirst', 'Second']);
    expect(slide.body).toContain('First');
    expect(slide.body).toContain('Second');
    expect(slide.notes).toBe('Presenter note');
  });

  it('preserves content and reports unsupported or empty area definitions', () => {
    const slide = parseMarkdownPresentation('<!--slide: two-column-->\n# Title\n\nFirst\n\n<!-- region-break -->\nSecond').slides[0];
    expect(slide.regions).toBeUndefined();
    expect(slide.body).toContain('First');
    expect(slide.body).toContain('Second');
    expect(slide.warnings?.[0]).toContain('only on content slides');
  });

  it('keeps a normal slide in one area without requiring a marker', () => {
    const source = '# Title\n\nNormal body.';
    expect(splitPresentationRegions(source)).toEqual({ regions: [source], issues: [] });
  });

  it('splits up to four top-level areas in source order', () => {
    const result = splitPresentationRegions('# Title\n\nFirst\n\n<!-- region-break -->\nSecond\n\n<!-- region-break -->\nThird\n\n<!-- region-break -->\nFourth');
    expect(result.regions).toEqual(['# Title\n\nFirst', 'Second', 'Third', 'Fourth']);
    expect(result.issues).toEqual([]);
  });

  it('leaves marker examples in code and nested content unchanged', () => {
    const source = '# Title\n\n~~~md\n<!-- region-break -->\n~~~\n\nUse `<!-- region-break -->`.\n\n> <!-- region-break -->\n> Quote';
    expect(splitPresentationRegions(source)).toEqual({ regions: [source], issues: [] });
  });

  it.each(['<!-- region-break\nHidden text', '<!-- region-break: extra -->\nVisible text', '<!-- region-break --> trailing text'])('shows malformed marker source and preserves following text: %s', (value) => {
    const slide = parseMarkdownPresentation('# Title\n\n' + value).slides[0];
    expect(slide.regions).toBeUndefined();
    expect(slide.warnings).toHaveLength(1);
    expect(slide.body).toContain('&lt;!-- region-break');
    expect(slide.body).toContain('text');
  });

  it('treats notes-only and comment-only areas as empty without discarding the notes', () => {
    const slide = parseMarkdownPresentation('# Title\n\nFirst\n\n<!-- region-break -->\n<!--notes: Remember-->\n<!-- regular comment -->').slides[0];
    expect(slide.regions).toBeUndefined();
    expect(slide.notes).toBe('Remember');
    expect(slide.body).toContain('First');
    expect(slide.warnings?.join(' ')).toContain('must contain');
  });

  it('rejects a first area containing only the slide title', () => {
    const slide = parseMarkdownPresentation('# Title\n\n<!-- region-break -->\nSecond').slides[0];
    expect(slide.regions).toBeUndefined();
    expect(slide.body).toContain('Second');
    expect(slide.warnings?.join(' ')).toContain('after the slide title');
  });

  it('does not count optional heading fields as content in the first area', () => {
    const source = '<!-- slide-label -->\nProgress\n\n# Title\n\n<!-- slide-subtitle -->\nPeriod\n\n<!-- region-break -->\nSecond';
    expect(splitPresentationRegions(source).issues.map(issue => issue.message).join(' ')).toContain('after the slide title');
    expect(parseMarkdownPresentation(source).slides[0].regions).toBeUndefined();
  });

  it('reports empty or excessive areas without losing their source content', () => {
    const empty = splitPresentationRegions('First\n\n<!-- region-break -->\n');
    expect(empty.regions).toEqual(['First', '']);
    expect(empty.issues).toHaveLength(1);
    const source = ['One','Two','Three','Four','Five'].join('\n\n<!-- region-break -->\n\n');
    const many = splitPresentationRegions(source);
    expect(many.regions).toEqual(['One','Two','Three','Four','Five']);
    expect(many.issues).toHaveLength(1);
  });
});
