import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { createMarkdownRenderer, readReviewComments, sanitizeRenderedHtml, writeReviewComments } from '@mfo/core';
import { createReviewActionHandler, createReviewCommentActions, createReviewPreviewTools, reviewContentKeySource } from '../src';

const renderer = createMarkdownRenderer();

function tools(createDocument: (html: string) => { document: Document; dispose(): void }) {
  const tools = createReviewPreviewTools({
    createDocument,
    renderAnchor: source => renderer.render(source),
    sanitize: sanitizeRenderedHtml,
  });
  return {
    ...tools,
    buildReviewPreview(body: string, source: string, version: number, key: string) {
      const store = readReviewComments(source);
      return tools.buildReviewPreview(body, store, version, key,
        createHash('sha256').update(reviewContentKeySource(store.markdown)).digest('hex'));
    },
  };
}

describe('shared review', () => {
  it('maps and restores a repeated selection with both host DOM adapters', () => {
    const markdown = '| Item | Status |\n| --- | --- |\n| First | Pending |\n| Second | Pending |\n';
    const browser = new JSDOM('');
    const nodeTools = tools(html => {
      const dom = new JSDOM(html);
      return { document: dom.window.document, dispose: () => dom.window.close() };
    });
    const browserTools = tools(html => ({
      document: new browser.window.DOMParser().parseFromString(html, 'text/html'),
      dispose() {},
    }));
    try {
      const result = [nodeTools, browserTools].map(review => {
        const body = '<main>' + review.renderReviewMarkdown(renderer, markdown,
          markdown.split('\n').map((_line, index) => index + 1), 'test') + '</main>';
        const initial = review.buildReviewPreview(body, markdown, 1, 'test');
        const block = initial.review.blocks.find(item => item.text.includes('Pending'))!;
        const start = block.text.lastIndexOf('Pending');
        const comments = createReviewCommentActions(review.readPreviewSelection)(markdown, [], initial.review, {
          action: 'add', body: 'Check the second status.', selection: [{ id: block.id, start, end: start + 7 }],
        });
        const saved = writeReviewComments(markdown, comments);
        const stored = readReviewComments(saved);
        const clean = stored.markdown;
        const content = clean.slice(clean.indexOf('| Item'));
        const offset = clean.split('\n').length - content.split('\n').length;
        const refreshedBody = '<main>' + review.renderReviewMarkdown(renderer, content,
          content.split('\n').map((_line, index) => offset + index + 1), 'test') + '</main>';
        const refreshed = review.buildReviewPreview(refreshedBody, saved, 2, 'test');
        const dom = new JSDOM(refreshed.body);
        try {
          const state = JSON.parse(dom.window.document.querySelector('[data-review-state]')!.getAttribute('data-review-state')!);
          return { selected: markdown.slice(comments[0].range!.start, comments[0].range!.end), range: comments[0].range, state };
        } finally {
          dom.window.close();
        }
      });
      expect(result[0]).toEqual(result[1]);
      expect(result[0].selected).toBe('Pending');
      expect(result[0].range.start).toBe(markdown.lastIndexOf('Pending'));
      expect(result[0].state.comments[0].placement).toBeDefined();
    } finally {
      browser.window.close();
    }
  });

  it('rejects invalid actions without mutating existing comments', () => {
    const update = createReviewCommentActions(() => ({ start: 0, end: 1 }));
    const comments = [{ id: '1', body: 'Original', state: 'open' as const, includeInAi: true }];
    const preview = { version: 1, blocks: [] };
    expect(() => update('a', comments, preview, {
      action: 'edit', id: '1', body: 'Changed', afterEdit: 'invalid' as never,
    })).toThrow('Unknown review action.');
    expect(comments[0].body).toBe('Original');
    expect(update('a', comments, preview, { action: 'resolve', id: '1' })[0].state).toBe('resolved');
    expect(comments[0].state).toBe('open');
  });

  it('rejects malformed source-line mappings and selection messages', () => {
    const review = tools(html => {
      const dom = new JSDOM(html);
      return { document: dom.window.document, dispose: () => dom.window.close() };
    });
    const result = review.buildReviewPreview(
      '<main><p data-review-block="test:0:1">Text</p><p data-review-block="test:1:1:extra">Text</p></main>',
      'Text', 1, 'test',
    );
    expect(result.review.blocks).toEqual([]);
    expect(result.body).not.toContain('data-review-block');
    const preview = { version: 1, blocks: [{ id: '0', text: 'Text', startLine: 0, endLine: 1 }] };
    expect(() => review.readPreviewSelection('Text', preview, [{ id: '0', start: 0, end: 4 }]))
      .toThrow('Select text in the current preview');
    expect(() => review.readPreviewSelection('Text', preview, [null]))
      .toThrow('Select text in the current preview');
  });

  it('rejects stale sessions and malformed request IDs before invoking the host', async () => {
    const handler = createReviewActionHandler(() => ({ start: 0, end: 1 }));
    const snapshot = { markdown: 'a', version: 3, sessionId: 'session', preview: { version: 3, blocks: [] } };
    const request = { sessionId: 'session', version: 3, requestId: 1, action: 'add', body: 'Note' };
    const apply = vi.fn(async () => true);
    for (const invalid of [
      { ...request, sessionId: 'old-session' },
      { ...request, version: 2 },
      { ...request, requestId: 0 },
      { ...request, requestId: NaN },
    ]) {
      await expect(handler(snapshot, invalid, apply)).rejects.toThrow('The preview changed');
    }
    await expect(handler({ ...snapshot, preview: { version: 2, blocks: [] } }, request, apply))
      .rejects.toThrow('The preview changed');
    expect(apply).not.toHaveBeenCalled();
  });

  it('passes the expected revision to the host and reports an edit conflict', async () => {
    const handler = createReviewActionHandler(() => ({ start: 0, end: 1 }));
    const snapshot = { markdown: 'a', version: 3, sessionId: 'session', preview: { version: 3, blocks: [] } };
    const request = { sessionId: 'session', version: 3, requestId: 1, action: 'add', body: 'Note' };
    let currentVersion = 4;
    let document = snapshot.markdown;
    const apply = vi.fn(async (markdown: string, version: number, sessionId: string) => {
      if (version !== currentVersion || sessionId !== snapshot.sessionId) return false;
      document = markdown;
      currentVersion++;
      return true;
    });
    await expect(handler(snapshot, request, apply)).rejects.toThrow('The Markdown changed');
    expect(document).toBe('a');
    expect(apply).toHaveBeenLastCalledWith(expect.any(String), 3, 'session');
    currentVersion = 3;
    await handler(snapshot, request, apply);
    expect(readReviewComments(document).comments).toEqual([
      expect.objectContaining({ id: '1', body: 'Note', state: 'open' }),
    ]);
  });

  it('reattaches a detached comment through the shared action handler', async () => {
    let document = writeReviewComments('Alpha Beta\n', [
      { id: '1', body: 'Check Beta', state: 'resolved', includeInAi: false },
    ]);
    const handler = createReviewActionHandler(markdown => {
      const start = markdown.indexOf('Beta');
      return { start, end: start + 4 };
    });
    await handler(
      { markdown: document, version: 1, sessionId: 'session', preview: { version: 1, blocks: [] } },
      { sessionId: 'session', version: 1, requestId: 1, action: 'reattach', id: '1', selection: [{}] },
      async updated => { document = updated; return true; },
    );
    const stored = readReviewComments(document);
    expect(stored.comments[0]).toMatchObject({ state: 'resolved', includeInAi: false, body: 'Check Beta' });
    expect(stored.markdown.slice(stored.comments[0].range!.start, stored.comments[0].range!.end)).toBe('Beta');
  });
});
