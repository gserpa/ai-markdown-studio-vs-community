import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createMarkdownRenderer, writeReviewComments } from '@mfo/core';
import { buildReviewPreview, readPreviewSelection, renderReviewMarkdown } from '../src/review/reviewPreview';

describe('review preview selections', () => {
  it('captures formatted text across blocks and follows it after a source edit', () => {
    const markdown = '# Title\n\nA **formatted** sentence.\n\nA second paragraph.\n';
    const render = (source: string) => '<main>' + renderReviewMarkdown(
      createMarkdownRenderer(), source, source.split('\n').map((_line, index) => index + 1), 'test',
    ) + '</main>';
    const initial = buildReviewPreview(render(markdown), markdown, 1, 'test');
    const original = readPreviewSelection(markdown, initial.review, [
      { id: '1', start: 2, end: 11 },
      { id: '2', start: 2, end: 8 },
    ]);
    expect(original.quote).toBe('formatted\nsecond');
    expect(original.parts.map(part => part.startLine)).toEqual([3, 5]);
    const moved = '\nIntroduction\n\n' + markdown;
    const saved = writeReviewComments(moved, [{ id: 'review', state: 'open', body: 'Please revise.', original, includeInAi: true }]);
    const refreshed = buildReviewPreview(render(moved), saved, 2, 'test');
    expect(refreshed.body).toContain('&quot;placement&quot;');
    expect(refreshed.body).toContain('&quot;startLine&quot;:6,&quot;endLine&quot;:8');
    expect(refreshed.body).not.toContain('markdown-ai-studio-review');
  });

  it('keeps a stable content key when only review metadata changes', () => {
    const markdown = '# Title\n\nA paragraph.\n';
    const render = (source: string) => '<main>' + renderReviewMarkdown(
      createMarkdownRenderer(), source, source.split('\n').map((_line, index) => index + 1), 'test',
    ) + '</main>';
    const initial = buildReviewPreview(render(markdown), markdown, 1, 'test');
    const original = readPreviewSelection(markdown, initial.review, [{ id: '1', start: 0, end: 11 }]);
    const saved = writeReviewComments(markdown, [
      { id: 'review', state: 'open', body: 'Please revise.', original, includeInAi: true },
    ]);
    const refreshed = buildReviewPreview(render(markdown), saved, 2, 'test');
    const dom = new JSDOM(refreshed.body);
    const body = new JSDOM(initial.body);
    try {
      const before = JSON.parse(body.window.document.querySelector('[data-review-state]')!.getAttribute('data-review-state')!);
      const after = JSON.parse(dom.window.document.querySelector('[data-review-state]')!.getAttribute('data-review-state')!);
      expect(after.contentKey).toBe(before.contentKey);
      expect(after.version).not.toBe(before.version);
      expect(after.comments[0].placement).toBeDefined();
    } finally {
      body.window.close();
      dom.window.close();
    }
  });
});
