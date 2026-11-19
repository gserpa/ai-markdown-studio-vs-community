import { createMarkdownRenderer, isMarkdownPresentationSource, readReviewComments, sanitizeRenderedHtml } from '@mfo/core';
import { createReviewActionHandler, createReviewPreviewTools, reviewContentKeySource, type ReviewRequest } from '@mfo/review';
import { renderDocumentPreviewBody } from './document/documentPreviewBody';
import { renderPresentationPreview } from './presentation/presentationPreview';
import { loadPreviewThemeRegistryFromData, type PreviewThemeMode, type PreviewThemeRegistry } from './presentation/previewThemeRegistry';

export { loadPreviewThemeRegistryFromData };

export type PortableRenderOptions = {
  presentationThemes: PreviewThemeRegistry;
  presentationTheme: string;
  themeMode: PreviewThemeMode;
};

function createFragmentDocument(html: string): Document {
  const parsed = document.implementation.createHTMLDocument();
  const template = parsed.createElement('template');
  template.innerHTML = html;
  parsed.body.append(template.content);
  return parsed;
}

const renderer = createMarkdownRenderer();
const review = createReviewPreviewTools({
  createDocument: html => ({ document: createFragmentDocument(html), dispose() {} }),
  renderAnchor: source => renderer.render(source),
  sanitize: sanitizeRenderedHtml,
});

export async function renderPortableReview(source: string, version: number, mappingKey: string, options: PortableRenderOptions) {
  const store = readReviewComments(source);
  const bytes = new TextEncoder().encode(reviewContentKeySource(store.markdown));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const contentKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const render = (markdown: string, lines?: readonly (number | undefined)[]) =>
    review.renderReviewMarkdown(renderer, markdown, lines, mappingKey);
  if (isMarkdownPresentationSource(store.markdown)) {
    const presentation = renderPresentationPreview(store.markdown, render, options.presentationThemes,
      createFragmentDocument, options.presentationTheme, options.themeMode, { includeSourceRanges: true });
    return { ...review.buildReviewPreview(presentation.html, store, version, mappingKey, contentKey), mode: 'presentation' as const };
  }
  const body = renderDocumentPreviewBody(store.markdown, render);
  return { ...review.buildReviewPreview(body, store, version, mappingKey, contentKey), mode: 'document' as const };
}

export const readPortableReviewSelection = review.readPreviewSelection;

export async function createPortableReviewHost(source: string, sessionId: string, options: PortableRenderOptions) {
  if (typeof sessionId !== 'string' || !sessionId) throw new Error('A review session is required.');
  const parsed = readReviewComments(source);
  if (parsed.error) throw new Error(parsed.error);
  let markdown = source;
  let version = 1;
  let page = await renderPortableReview(markdown, version, 'portable', options);
  const applyAction = createReviewActionHandler(readPortableReviewSelection);
  return {
    snapshot: () => ({ markdown, version, body: page.body, mode: page.mode }),
    async review(request: ReviewRequest): Promise<void> {
      const current = page;
      const currentMarkdown = markdown;
      const currentVersion = version;
      await applyAction({ markdown: currentMarkdown, version: currentVersion, sessionId, preview: current.review }, request,
        async (updated, expectedVersion, expectedSessionId) => {
          if (version !== expectedVersion || sessionId !== expectedSessionId) return false;
          if (reviewContentKeySource(readReviewComments(currentMarkdown).markdown)
            !== reviewContentKeySource(readReviewComments(updated).markdown)) {
            throw new Error('The review action unexpectedly changed document content.');
          }
          const next = await renderPortableReview(updated, expectedVersion + 1, 'portable', options);
          if (version !== expectedVersion) return false;
          if (next.mode !== current.mode || next.review.blocks.length !== current.review.blocks.length
            || next.review.blocks.some((block, index) =>
              block.id !== current.review.blocks[index].id || block.text !== current.review.blocks[index].text)) {
            throw new Error('The review action changed the rendered document. Reload the file.');
          }
          markdown = updated;
          version = expectedVersion + 1;
          page = next;
          return true;
        });
    },
  };
}

export function createPortableReviewBridge(
  host: Awaited<ReturnType<typeof createPortableReviewHost>>, root: Element, sessionId: string,
) {
  const document = root.ownerDocument;
  const window = document.defaultView;
  if (!window) throw new Error('Review preview has no browser window.');
  let visible = true;
  let state: Record<string, unknown> = {};
  const post = (data: object) => window.dispatchEvent(new window.MessageEvent('message', { data }));
  return {
    reviewStandalone: true,
    getState: () => state,
    setState: (next: Record<string, unknown>) => { state = next; },
    async review(request: ReviewRequest): Promise<void> {
      if (request.action === 'ready') {
        post({ command: 'reviewVisibility', visible });
        return;
      }
      if (request.action === 'cancelReattach') return;
      try {
        if (request.action === 'toggleVisibility') {
          visible = !visible;
          post({ command: 'reviewVisibility', visible });
        } else {
          await host.review({ ...request, sessionId });
          const template = document.createElement('template');
          template.innerHTML = host.snapshot().body;
          const state = template.content.firstElementChild?.getAttribute('data-review-state');
          if (!state) throw new Error('The updated review state is unavailable.');
          root.setAttribute('data-review-state', state);
          document.dispatchEvent(new window.Event('md-document-updated'));
          document.dispatchEvent(new window.Event('md-portable-review-changed'));
        }
        post({ command: 'reviewResult', requestId: request.requestId });
        if (request.action === 'edit' && request.afterEdit === 'reattach') {
          post({ command: 'beginReviewReattach', id: request.id });
        }
      } catch (error) {
        post({ command: 'reviewResult', requestId: request.requestId, error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
