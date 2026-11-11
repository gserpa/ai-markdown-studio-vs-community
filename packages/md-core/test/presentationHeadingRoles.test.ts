import { describe, expect, it } from 'vitest';
import { extractPresentationHeadingRoles } from '../src/presentation/presentationSource';
import { parseMarkdownPresentation, resolveMarkdownPresentation } from '../src/presentation/mpsParser';

describe('optional slide heading roles', () => {
  it('keeps actual slide directive examples in code literal', () => {
    for (const example of [
      'Use `<!--slide: content-->` as an example.',
      '    <!--slide: content-->',
      '~~~md\n<!--slide: content-->\n~~~',
    ]) {
      expect(parseMarkdownPresentation('# Title\n\n' + example).slides[0].body).toContain('<!--slide: content-->');
    }
  });
  it('reports a multi-line marker without consuming its following paragraph', () => {
    const result = extractPresentationHeadingRoles('<!-- slide-label\n-->\nText paragraph.');
    expect(result.heading).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.body).toContain('Text paragraph.');
    expect(result.body).toContain('&lt;!-- slide-label');
  });

  it('extracts marked text while retaining implicit title and ordinary body semantics', () => {
    const slide = parseMarkdownPresentation('<!--slide: content-->\n<!-- slide-label -->\nProgress\n\n# Title\n\n<!-- slide-subtitle -->\nPeriod **one**\n\nOrdinary body.').slides[0];
    expect(slide.heading).toEqual({ label: 'Progress', subtitle: 'Period **one**' });
    expect(slide.body).toContain('# Title');
    expect(slide.body).toContain('Ordinary body.');
    expect(slide.body).not.toContain('Period **one**');
    expect(slide.warnings).toBeUndefined();
  });

  it('does not change unmarked slides or invent roles from an opening paragraph', () => {
    const source = '# Title\n\nAn ordinary paragraph.';
    expect(parseMarkdownPresentation(source).slides[0]).toEqual({ template: 'content', body: source, notes: undefined });
    expect(parseMarkdownPresentation('No heading needed.').slides[0].heading).toBeUndefined();
  });

  it.each([
    '~~~md\n<!-- slide-label -->\nExample\n<!--notes: literal note-->\n~~~',
    '```md\n<!-- slide-label -->\nExample\n<!--notes: literal note-->\n```',
    '    <!-- slide-label -->\n    Example\n    <!--notes: literal note-->',
    'Use `<!-- slide-label -->` and `<!--notes: literal note-->`.',
    'Use ``<!-- slide-label -->`` and ``<!--notes: literal note-->``.',
  ])('keeps code examples literal: %s', (source) => {
    const slide = parseMarkdownPresentation('# Title\n\n' + source).slides[0];
    expect(slide.heading).toBeUndefined();
    expect(slide.body).toContain('<!-- slide-label -->');
    expect(slide.body).toContain('<!--notes: literal note-->');
    expect(slide.notes).toBeUndefined();
  });

  it.each(['> <!-- slide-label -->\n> Quoted text', '- <!-- slide-label -->\n\n  List text'])('does not extract nested roles: %s', (source) => {
    const slide = parseMarkdownPresentation('# Title\n\n' + source).slides[0];
    expect(slide.heading).toBeUndefined();
    expect(slide.body).toContain('text');
  });

  it('preserves real notes beside code examples and backticked comment terminators', () => {
    const slide = parseMarkdownPresentation('# Title\n\n~~~md\n<!--notes: example-->\n~~~\n\n<!--notes: Real note with `<!--marker-->` inside.-->\n').slides[0];
    expect(slide.body).toContain('<!--notes: example-->');
    expect(slide.notes).toBe('Real note with `<!--marker-->` inside.');
  });

  it('shows malformed marker arguments as source instead of hiding their text', () => {
    const slide = parseMarkdownPresentation('# Title\n\n<!-- slide-label: Keep this text -->\n\nBody.').slides[0];
    expect(slide.heading).toBeUndefined();
    expect(slide.body).toContain('&lt;!-- slide-label: Keep this text -->');
    expect(slide.body).toContain('Body.');
    expect(slide.warnings).toHaveLength(1);
  });

  it('retains both values as body content when a role is duplicated and reports both locations', () => {
    const source = '<!-- slide-label -->\nFirst\n\n<!-- slide-label -->\nSecond';
    const result = extractPresentationHeadingRoles(source);
    expect(result.heading).toBeUndefined();
    expect(result.body).toBe(source);
    expect(result.issues).toHaveLength(2);
    expect(source.slice(result.issues[1].start, result.issues[1].end)).toBe('<!-- slide-label -->');
    const slide = parseMarkdownPresentation(source).slides[0];
    expect(slide.body).toContain('First');
    expect(slide.body).toContain('Second');
    expect(slide.warnings).toHaveLength(2);
  });

  it.each(['<!-- slide-label -->', '<!-- slide-label -->\n# Heading', '<!-- slide-label -->\n![Image](a.png)', '<!-- slide-label -->\nText <b>HTML</b>'])('does not consume invalid values: %s', (source) => {
    const result = extractPresentationHeadingRoles(source);
    expect(result.heading).toBeUndefined();
    expect(result.body).toBe(source);
    expect(result.issues).toHaveLength(1);
  });

  it('keeps existing implicit cover metadata and two-column bodies', () => {
    const source = '---\ntitle: Deck\nsubtitle: Existing subtitle\nauthor: Ada\n---\n\n<!--slide: two-column-->\n# Compare\n\nLeft\n\n<!--column-break-->\n\nRight';
    const result = resolveMarkdownPresentation(parseMarkdownPresentation(source));
    expect(result.slides[0].template).toBe('cover');
    expect(result.slides[0].body).toContain('Existing subtitle');
    expect(result.slides[0].body).toContain('Ada');
    expect(result.slides[1].body).toContain('<!--column-break-->');
  });

  it('does not reinterpret an escaped comment or hide an unclosed marker', () => {
    const source = '# Title\n\n\\<!--notes: literal-->\n\n<!-- slide-label\nText';
    const slide = parseMarkdownPresentation(source).slides[0];
    expect(slide.notes).toBeUndefined();
    expect(slide.body).toContain('\\<!--notes: literal-->');
    expect(slide.body).toContain('&lt;!-- slide-label');
    expect(slide.body).toContain('Text');
    expect(slide.warnings).toHaveLength(1);
  });
});
