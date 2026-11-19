import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { createMarkdownRenderer, readReviewComments, sanitizeRenderedHtml } from '@mfo/core';
import { createReviewPreviewTools, reviewContentKeySource } from '@mfo/review';

const anchorRenderer = createMarkdownRenderer();
const tools = createReviewPreviewTools({
  createDocument(html) {
    const dom = new JSDOM(html);
    return { document: dom.window.document, dispose: () => dom.window.close() };
  },
  renderAnchor: markdown => anchorRenderer.render(markdown),
  sanitize: sanitizeRenderedHtml,
});

export const { renderReviewMarkdown, readPreviewSelection } = tools;

export function buildReviewPreview(body: string, rawMarkdown: string, version: number, key: string) {
  const store = readReviewComments(rawMarkdown);
  const contentKey = createHash('sha256').update(reviewContentKeySource(store.markdown)).digest('hex');
  return tools.buildReviewPreview(body, store, version, key, contentKey);
}

export type { ReviewPreview } from '@mfo/review';
