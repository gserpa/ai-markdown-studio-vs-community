import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createMarkdownRenderer, readReviewComments, stripMarkdownFrontMatter, writeReviewComments } from '@mfo/core';
import { buildReviewPreview, readPreviewSelection, renderReviewMarkdown } from '../src/review/reviewPreview';

describe('review preview selections', () => {
  it('captures formatted text across blocks and follows it after a source edit', () => {
    const markdown = '# Title\n\nA **formatted** sentence.\n\nA second paragraph.\n';
    const render = (source: string) => {
      const body = stripMarkdownFrontMatter(source);
      const offset = source.split('\n').length - body.split('\n').length;
      return '<main>' + renderReviewMarkdown(
        createMarkdownRenderer(), body, body.split('\n').map((_line, index) => offset + index + 1), 'test',
      ) + '</main>';
    };
    const initial = buildReviewPreview(render(markdown), markdown, 1, 'test');
    const range = readPreviewSelection(markdown, initial.review, [
      { id: '1', start: 2, end: 11 },
      { id: '2', start: 2, end: 8 },
    ]);
    expect(markdown.slice(range.start, range.end)).toBe('formatted** sentence.\n\nA second');
    const moved = '\nIntroduction\n\n' + markdown;
    const shift = moved.length - markdown.length;
    const movedRange = { start: range.start + shift, end: range.end + shift };
    const saved = writeReviewComments(moved, [{ id: '1', state: 'open', body: 'Please revise.', range: movedRange, includeInAi: true }]);
    const refreshed = buildReviewPreview(render(readReviewComments(saved).markdown), saved, 2, 'test');
    expect(refreshed.body).toContain('&quot;placement&quot;');
    expect(refreshed.body).toContain('&quot;startLine&quot;:8,&quot;endLine&quot;:10');
    expect(refreshed.body).not.toContain('markdown-ai-studio-review');
  });

  it('keeps a stable content key when only review metadata changes', () => {
    const markdown = '# Title\n\nA paragraph.\n';
    const render = (source: string) => {
      const body = stripMarkdownFrontMatter(source);
      const offset = source.split('\n').length - body.split('\n').length;
      return '<main>' + renderReviewMarkdown(
        createMarkdownRenderer(), body, body.split('\n').map((_line, index) => offset + index + 1), 'test',
      ) + '</main>';
    };
    const initial = buildReviewPreview(render(markdown), markdown, 1, 'test');
    const range = readPreviewSelection(markdown, initial.review, [{ id: '1', start: 0, end: 11 }]);
    const saved = writeReviewComments(markdown, [
      { id: '1', state: 'open', body: 'Please revise.', range, includeInAi: true },
    ]);
    const clean = readReviewComments(saved).markdown;
    const refreshed = buildReviewPreview(render(clean), saved, 2, 'test');
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

  it('selects the correct occurrence in a table and restores its exact preview highlight', () => {
    const markdown = '---\ndocument: presentation\n---\n\n| Item | Status |\n| --- | --- |\n| First | Pending |\n| Second | Pending |\n';
    const render = (source: string) => {
      const body = stripMarkdownFrontMatter(source);
      const offset = source.split('\n').length - body.split('\n').length;
      return '<main>' + renderReviewMarkdown(createMarkdownRenderer(), body,
        body.split('\n').map((_line, index) => offset + index + 1), 'test') + '</main>';
    };
    const initial = buildReviewPreview(render(markdown), markdown, 1, 'test');
    const block = initial.review.blocks.find(item => item.text.includes('Pending'))!;
    const second = block.text.lastIndexOf('Pending');
    const range = readPreviewSelection(markdown, initial.review, [{ id: block.id, start: second, end: second + 7 }]);
    expect(range.start).toBe(markdown.lastIndexOf('Pending'));
    const saved = writeReviewComments(markdown, [{ id: '1', body: 'Clarify.', state: 'open', includeInAi: true, range }]);
    const clean = readReviewComments(saved).markdown;
    const refreshed = buildReviewPreview(render(clean), saved, 2, 'test');
    const dom = new JSDOM(refreshed.body);
    try {
      const state = JSON.parse(dom.window.document.querySelector('[data-review-state]')!.getAttribute('data-review-state')!);
      const slice = state.comments[0].placement.slices[0];
      expect(refreshed.review.blocks.find(item => item.id === slice.id)!.text.slice(slice.start, slice.end)).toBe('Pending');
      expect(slice.start).toBe(second);
      expect(saved).not.toContain('\"source\"');
    } finally {
      dom.window.close();
    }
  });
});
