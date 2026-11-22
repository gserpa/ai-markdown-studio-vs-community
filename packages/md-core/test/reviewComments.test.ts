import { describe, expect, it } from 'vitest';
import { componentReviewRange, readReviewComments, stripReviewComments, writeReviewComments, type ReviewComment } from '../src';

function comment(source: string, text = 'selected text'): ReviewComment {
  const start = source.indexOf(text);
  return { id: '1', body: 'Make this clearer.', state: 'open', includeInAi: true, range: { start, end: start + text.length } };
}

describe('compact review comments', () => {
  it.each(['\n', '\r\n'])('stores a compact marker and preserves front matter with %j endings', eol => {
    const markdown = ['---', 'title: Example', 'theme: galaxy', '---', '', 'A selected text here.', ''].join(eol);
    const saved = writeReviewComments(markdown, [comment(markdown)]);
    expect(saved).toContain('  - 1: "Make this clearer."');
    expect(saved).toContain('<!--review:1-->selected text<!--/review:1-->');
    expect(stripReviewComments(saved)).toBe(markdown);
    const stored = readReviewComments(saved);
    expect(stored.comments).toEqual([comment(markdown)]);
    expect(writeReviewComments(saved, [])).toBe(markdown);
  });

  it('handles selections at the start of a paragraph without changing the text', () => {
    const markdown = 'selected text and more.\n';
    const saved = writeReviewComments(markdown, [comment(markdown)]);
    const stored = readReviewComments(saved);
    expect(saved).toContain('<!--review:1-->\nselected text<!--/review:1-->');
    expect(stored.markdown.slice(stored.comments[0].range!.start, stored.comments[0].range!.end)).toBe('selected text');
  });

  it('tracks edits within markers and preserves optional review state', () => {
    const markdown = 'A selected text here.\n';
    const saved = writeReviewComments(markdown, [{ ...comment(markdown), includeInAi: false, state: 'resolved' }]);
    const edited = saved.replace('selected text', 'new wording');
    const stored = readReviewComments(edited);
    expect(stored.comments[0]).toMatchObject({ body: 'Make this clearer.', includeInAi: false, state: 'resolved' });
    expect(stored.markdown.slice(stored.comments[0].range!.start, stored.comments[0].range!.end)).toBe('new wording');
    expect(readReviewComments(edited.replace('<!--/review:1-->', '')).comments[0].range).toBeUndefined();
  });

  it('preserves unrelated front-matter comments and fields when deleting a review', () => {
    const markdown = '---\ntitle: Example # title note\n# author note\nauthor: Someone\n---\n\nA selected text here.\n';
    const saved = writeReviewComments(markdown, [comment(markdown)]);
    expect(writeReviewComments(saved, [])).toBe(markdown);
  });

  it('rejects code selections rather than changing Markdown rendering', () => {
    const markdown = 'Example `selected text`.\n';
    expect(() => writeReviewComments(markdown, [comment(markdown)])).toThrow('without changing the Markdown rendering');
  });

  it('does not interpret examples inside code as review markers', () => {
    const markdown = 'A selected text here.\n\n`<!--review:1-->`\n\n```\n<!--review:1-->example<!--/review:1-->\n```\n';
    const saved = writeReviewComments(markdown, [comment(markdown)]);
    const stored = readReviewComments(saved);
    expect(stored.markdown).toContain('`<!--review:1-->`');
    expect(stored.markdown).toContain('<!--review:1-->example<!--/review:1-->');
    expect(stored.markdown.slice(stored.comments[0].range!.start, stored.comments[0].range!.end)).toBe('selected text');
  });

  it.each(['\n', '\r\n'])('stores component markers without interpreting ordinary code with %j endings', eol => {
    const markdown = ['---', 'title: Example', '---', '', '~~~component', 'type: fact-cards', 'version: 1', 'data:', '  cards:',
      '    - label: selected text', '      value: 4', '~~~', '', '```', '<!--review:1-->example<!--/review:1-->', '```', ''].join(eol);
    const saved = writeReviewComments(markdown, [comment(markdown)]);
    expect(saved).toContain('component: true');
    expect(saved).toContain('<!--review:1-->selected text<!--/review:1-->');
    const stored = readReviewComments(saved);
    expect(stored.markdown).toBe(markdown);
    expect(stored.comments).toEqual([comment(markdown)]);
    expect(writeReviewComments(saved, [])).toBe(markdown);
    const edited = readReviewComments(saved.replace('selected text', 'updated text'));
    expect(edited.markdown.slice(edited.comments[0].range!.start, edited.comments[0].range!.end)).toBe('updated text');
  });

  it('keeps component and ordinary review anchors separate', () => {
    const markdown = '---\ntitle: Example\n---\n\nOrdinary text.\n\n~~~component\ntype: fact-cards\nversion: 1\ndata:\n  cards:\n    - label: Component text\n      value: 4\n~~~\n';
    const comments = [comment(markdown, 'Ordinary'), { ...comment(markdown, 'Component'), id: '2' }];
    const saved = writeReviewComments(markdown, comments);
    const stored = readReviewComments(saved);
    expect(stored.markdown).toBe(markdown);
    expect(stored.comments).toEqual(comments);
    expect(writeReviewComments(saved, [])).toBe(markdown);
  });

  it.each(['\n', '\r\n'])('round-trips an entire quoted component with %j endings', eol => {
    const component = ['> ~~~component', '> type: fact-cards', '> version: 1', '> data:', '>   cards:',
      '>     - label: First', '>       value: One', '>     - label: Second', '>       value: Two', '> ~~~', ''].join(eol);
    const range = componentReviewRange(component)!;
    expect(component.slice(range.start, range.end)).toContain('label: Second');
    const markdown = ['---', 'title: Example', '---', '', component].join(eol);
    const start = markdown.indexOf(component);
    const saved = writeReviewComments(markdown, [{ ...comment(markdown, 'First'),
      range: { start: start + range.start, end: start + range.end } }]);
    const stored = readReviewComments(saved);
    expect(stored.markdown).toBe(markdown);
    expect(stored.comments[0].range).toEqual({ start: start + range.start, end: start + range.end });
    expect(writeReviewComments(saved, [])).toBe(markdown);
  });

  it('does not make a whole-component range for an unclosed fence', () => {
    expect(componentReviewRange('~~~component\ntype: fact-cards\n')).toBeUndefined();
  });

  it('preserves a precise comment nested inside a whole-component comment', () => {
    const component = '~~~component\ntype: fact-cards\nversion: 1\ndata:\n  cards:\n    - label: First\n      value: One\n    - label: Second\n      value: Two\n~~~\n';
    const markdown = '---\ntitle: Example\n---\n\n' + component;
    const offset = markdown.indexOf(component);
    const whole = componentReviewRange(component)!;
    const comments = [
      { ...comment(markdown, 'First'), id: '1' },
      { ...comment(markdown, 'Second'), id: '2', range: { start: offset + whole.start, end: offset + whole.end } },
    ];
    const stored = readReviewComments(writeReviewComments(markdown, comments));
    expect(stored.markdown).toBe(markdown);
    expect(stored.comments).toEqual(comments);
  });

  it('rejects malformed or duplicate review data without removing content', () => {
    const markdown = '---\nreview-comments:\n  - 1: first\n  - 1: second\n---\nA sentence.\n';
    expect(readReviewComments(markdown).error).toBeDefined();
    expect(stripReviewComments(markdown)).toBe(markdown);
    expect(() => writeReviewComments(markdown, [])).toThrow('could not be read');
  });
});
