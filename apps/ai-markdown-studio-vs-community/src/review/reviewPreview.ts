import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import {
  createMarkdownRenderer, lineOffsets, locateReviewPart, readReviewComments, sanitizeRenderedHtml,
  type ReviewComment, type ReviewSelection,
} from '@mfo/core';

type ReviewBlock = { id: string; text: string; startLine: number; endLine: number };
type ReviewSlice = { id: string; start: number; end: number };
export type ReviewPreview = {
  version: number;
  blocks: ReviewBlock[];
};

export function renderReviewMarkdown(
  renderer: ReturnType<typeof createMarkdownRenderer>, markdown: string,
  lines: readonly (number | undefined)[] | undefined, key: string,
): string {
  if (!lines) return sanitizeRenderedHtml(renderer.render(markdown));
  const env = {};
  const tokens = renderer.parse(markdown, env);
  const mappedTypes = new Set(['paragraph_open', 'heading_open', 'list_item_open', 'table_open', 'code_block', 'fence']);
  for (const [index, token] of tokens.entries()) {
    if (!token.map || !mappedTypes.has(token.type) || token.hidden) continue;
    if (token.type === 'list_item_open' && !tokens[index + 1]?.hidden) continue;
    const span = lines.slice(token.map[0], token.map[1]).filter((line): line is number => line !== undefined);
    if (span.length) token.attrSet('data-review-block', key + ':' + span[0] + ':' + span[span.length - 1]);
  }
  const { rules } = renderer.renderer;
  const fence = rules.fence;
  const code = rules.code_block;
  if (fence) rules.fence = (...args) => markCodeBlock(fence(...args), args[0][args[1]].attrGet('data-review-block'));
  if (code) rules.code_block = (...args) => markCodeBlock(code(...args), args[0][args[1]].attrGet('data-review-block'));
  try {
    return sanitizeRenderedHtml(renderer.renderer.render(tokens, renderer.options, env));
  } finally {
    rules.fence = fence;
    rules.code_block = code;
  }
}

function markCodeBlock(html: string, marker: string | null): string {
  return marker && /^\w+:\d+:\d+$/u.test(marker) ? html.replace(/^<pre\b/u, '<pre data-review-block="' + marker + '"') : html;
}

export function buildReviewPreview(body: string, rawMarkdown: string, version: number, key: string) {
  const store = readReviewComments(rawMarkdown);
  const dom = new JSDOM(body);
  try {
    const root = dom.window.document.body.firstElementChild!;
    const blocks: ReviewBlock[] = [];
    for (const node of root.querySelectorAll('[data-review-block]')) {
      const [scope, from, to] = (node.getAttribute('data-review-block') ?? '').split(':');
      const text = node.textContent ?? '';
      if (scope !== key || !text.trim()) {
        node.removeAttribute('data-review-block');
        continue;
      }
      const id = String(blocks.length);
      node.setAttribute('data-review-block', id);
      blocks.push({ id, text, startLine: Number(from), endLine: Number(to) });
    }
    const comments = store.comments.map(comment => ({
      id: comment.id, body: comment.body, state: comment.state, includeInAi: comment.includeInAi,
      originalQuote: comment.original.quote, originalLines: selectionLines(comment.original),
      placement: locatePlacement(store.markdown, comment, blocks),
    }));
    root.setAttribute('data-review-state', JSON.stringify({
      version, contentKey: createHash('sha256').update(store.markdown).digest('hex'), comments, error: store.error,
    }));
    return { body: dom.window.document.body.innerHTML, review: { version, blocks } satisfies ReviewPreview };
  } finally {
    dom.window.close();
  }
}

function selectionLines(selection: ReviewSelection) {
  return {
    startLine: Math.min(...selection.parts.map(part => part.startLine)),
    endLine: Math.max(...selection.parts.map(part => part.endLine)),
  };
}

function locatePlacement(markdown: string, comment: ReviewComment, blocks: ReviewBlock[]) {
  const pieces = (comment.anchor ?? comment.original).parts.map(part => {
    const lines = locateReviewPart(markdown, part);
    if (!lines) return undefined;
    const matches = blocks.flatMap(block => {
      if (block.startLine > lines.startLine || block.endLine < lines.endLine) return [];
      const starts: number[] = [];
      for (let start = block.text.indexOf(part.quote); start !== -1; start = block.text.indexOf(part.quote, start + 1)) {
        starts.push(start);
      }
      return starts.map(start => ({
        id: block.id, start, end: start + part.quote.length, ...lines,
        contextMatches: block.text.slice(0, start).endsWith(part.renderedBefore)
          && block.text.slice(start + part.quote.length).startsWith(part.renderedAfter),
      }));
    });
    const contextual = matches.filter(match => match.contextMatches);
    return matches.length === 1 ? matches[0] : contextual.length === 1 ? contextual[0] : undefined;
  });
  if (!pieces.every(piece => piece !== undefined)) return undefined;
  return {
    slices: pieces.map(({ id, start, end }) => ({ id, start, end })),
    startLine: Math.min(...pieces.map(piece => piece.startLine)),
    endLine: Math.max(...pieces.map(piece => piece.endLine)),
  };
}

export function readPreviewSelection(markdown: string, preview: ReviewPreview, input: unknown): ReviewSelection {
  if (!Array.isArray(input) || !input.length || input.length > 200) throw new Error('Select text in the Markdown preview.');
  const offsets = lineOffsets(markdown);
  const parts = input.map((value: ReviewSlice) => {
    const block = value && preview.blocks.find(item => item.id === value.id);
    if (!block || !Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end)
      || value.start < 0 || value.end > block.text.length || value.start >= value.end) throw new Error('Select text in the current preview.');
    const start = offsets[block.startLine - 1];
    const end = offsets[block.endLine] ?? markdown.length;
    const source = markdown.slice(start, end);
    const quote = block.text.slice(value.start, value.end);
    const part = {
      quote, source, startLine: block.startLine, endLine: block.endLine,
      before: markdown.slice(Math.max(0, start - 100), start), after: markdown.slice(end, end + 100),
      renderedBefore: block.text.slice(Math.max(0, value.start - 64), value.start),
      renderedAfter: block.text.slice(value.end, value.end + 64),
    };
    // Refine the original line even when another copy of the same block occurs elsewhere.
    const position = source.indexOf(quote);
    if (position !== -1 && source.indexOf(quote, position + 1) === -1) {
      part.startLine += lineOffsets(source.slice(0, position)).length - 1;
      part.endLine = part.startLine + lineOffsets(quote).length - 1;
    }
    return part;
  });
  const quote = parts.map(part => part.quote).join('\n');
  if (!quote.trim() || quote.length > 50_000) throw new Error('Select a smaller passage in the preview.');
  return { quote, parts };
}
