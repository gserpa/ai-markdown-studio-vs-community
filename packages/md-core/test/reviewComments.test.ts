import { describe, expect, it } from 'vitest';
import { locateReviewPart, readReviewComments, stripReviewComments, writeReviewComments, type ReviewComment } from '../src';

const quote = 'selected text';
const part = {
  quote, startLine: 3, endLine: 3, source: quote + '\n',
  before: '# Title\n\n', after: '', renderedBefore: '', renderedAfter: '',
};
const comment: ReviewComment = {
  id: 'a', body: 'Keep -->, <tag>, and backtick \x60 safe.', state: 'open', includeInAi: true,
  original: { quote, parts: [part] },
};

describe('embedded Markdown review comments', () => {
  it.each(['\n', '\r\n'])('preserves document bytes with %j line endings', eol => {
    const markdown = '# Title' + eol + eol + quote + eol;
    const saved = writeReviewComments(markdown, [comment]);
    expect(readReviewComments(saved).comments).toEqual([comment]);
    expect(stripReviewComments(saved)).toBe(markdown);
    expect(writeReviewComments(saved, [])).toBe(markdown);
    expect(saved).not.toContain('Keep -->');
  });

  it('leaves fenced examples alone and rejects an unclosed block', () => {
    const fence = '\x60'.repeat(3);
    const example = fence + '\n<!-- markdown-ai-studio-review v1\n[]\n-->\n' + fence;
    expect(stripReviewComments(example)).toBe(example);
    expect(() => writeReviewComments(fence + '\nexample', [comment])).toThrow('Close the Markdown block');
  });

  it('preserves later content and fails safely on malformed metadata', () => {
    const markdown = '# Title\n\n' + quote + '\n';
    const saved = writeReviewComments(markdown, [comment]);
    const appended = saved + '\n## Later text\n';
    expect(readReviewComments(appended).comments).toEqual([comment]);
    expect(stripReviewComments(appended)).toContain('## Later text');
    expect(readReviewComments(saved.replace('v1', 'v2')).error).toBeDefined();
    expect(() => writeReviewComments(saved.replace('v1', 'v2'), [])).toThrow('could not be read');
  });

  it('tracks moved source, uses context for duplicates, and leaves missing text detached', () => {
    expect(locateReviewPart('Introduction\n\n# Title\n\n' + quote + '\n', part)).toEqual({ startLine: 5, endLine: 5 });
    expect(locateReviewPart(quote + '\n\n# Title\n\n' + quote + '\n', part)).toEqual({ startLine: 5, endLine: 5 });
    expect(locateReviewPart('# Title\n\nReplacement\n', part)).toBeUndefined();
    expect(locateReviewPart('Edited lead selected text and its explanation.\n', { ...part, source: 'Original lead selected text and its explanation.\n' })).toEqual({ startLine: 1, endLine: 1 });
  });
});
