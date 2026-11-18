import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import {
  createMarkdownRenderer, lineOffsets, readReviewComments, reviewRangeLines, sanitizeRenderedHtml,
  type ReviewComment, type ReviewRange,
} from '@mfo/core';

type ReviewBlock = { id: string; text: string; startLine: number; endLine: number };
type ReviewSlice = { id: string; start: number; end: number };
const anchorRenderer = createMarkdownRenderer();
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
      originalQuote: comment.range ? store.markdown.slice(comment.range.start, comment.range.end) : 'Selection unavailable',
      originalLines: comment.range ? reviewRangeLines(store.markdown, comment.range) : { startLine: 0, endLine: 0 },
      placement: locatePlacement(store.markdown, comment, blocks),
    }));
    root.setAttribute('data-review-state', JSON.stringify({
      version, contentKey: createHash('sha256').update(store.markdown.replace(/^\uFEFF?---[ \t]*\r?\n---[ \t]*\r?\n/u, '')).digest('hex'), comments, error: store.error,
    }));
    return { body: dom.window.document.body.innerHTML, review: { version, blocks } satisfies ReviewPreview };
  } finally {
    dom.window.close();
  }
}

function locatePlacement(markdown: string, comment: ReviewComment, blocks: ReviewBlock[]) {
  if (!comment.range) return undefined;
  const offsets = lineOffsets(markdown);
  const lines = reviewRangeLines(markdown, comment.range);
  const relevant = blocks.filter(block => block.startLine <= lines.endLine && block.endLine >= lines.startLine);
  const pieces = relevant.map(block => {
    const from = offsets[block.startLine - 1];
    const to = offsets[block.endLine] ?? markdown.length;
    const source = markdown.slice(from, to);
    const start = Math.max(from, comment.range!.start) - from;
    const end = Math.min(to, comment.range!.end) - from;
    const slice = renderedSlice(source, start, end, block.text);
    return slice ? { id: block.id, ...slice } : undefined;
  });
  return pieces.length && pieces.every(piece => piece !== undefined) ? { slices: pieces, ...lines } : undefined;
}

function renderedSlice(source: string, start: number, end: number, blockText: string) {
  const atLineStart = start === 0 || source[start - 1] === '\n';
  const previousLineStart = source.lastIndexOf('\n', start - 2) + 1;
  const previousLine = source.slice(previousLineStart, start).trim();
  const standalone = atLineStart && (start === 0 || !previousLine || previousLine === '---');
  const moved = atLineStart && !standalone;
  const open = moved ? start - (source[start - 2] === '\r' ? 2 : 1) : start;
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const marked = source.slice(0, open) + '<!--review:1-->' + (standalone ? eol : '')
    + source.slice(open, end) + '<!--/review:1-->' + source.slice(end);
  const dom = new JSDOM('<body>' + anchorRenderer.render(marked) + '</body>');
  try {
    const walker = dom.window.document.createTreeWalker(dom.window.document.body, dom.window.NodeFilter.SHOW_TEXT | dom.window.NodeFilter.SHOW_COMMENT);
    let text = '';
    let startOffset: number | undefined;
    let endOffset: number | undefined;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === dom.window.Node.TEXT_NODE) text += node.textContent ?? '';
      else if (node.textContent === 'review:1') startOffset = text.length;
      else if (node.textContent === '/review:1') endOffset = text.length;
    }
    const blockOffset = text.indexOf(blockText);
    if (startOffset === undefined || endOffset === undefined || blockOffset < 0) return undefined;
    const first = Math.max(startOffset + (moved ? 1 : 0), blockOffset) - blockOffset;
    const last = Math.min(endOffset, blockOffset + blockText.length) - blockOffset;
    return first < last ? { start: first, end: last } : undefined;
  } finally {
    dom.window.close();
  }
}

export function readPreviewSelection(markdown: string, preview: ReviewPreview, input: unknown): ReviewRange {
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
    const candidates: number[] = [];
    for (let position = source.indexOf(quote); position !== -1; position = source.indexOf(quote, position + 1)) {
      candidates.push(position);
    }
    const matches = candidates.filter(position => {
      const slice = renderedSlice(source, position, position + quote.length, block.text);
      return slice?.start === value.start && slice.end === value.end;
    });
    if (matches.length !== 1) {
      throw new Error('This selection cannot be mapped uniquely to Markdown. Select a smaller passage.');
    }
    return { start: start + matches[0], end: start + matches[0] + quote.length };
  });
  const range = { start: parts[0].start, end: parts[parts.length - 1].end };
  if (parts.some((part, index) => index > 0 && part.start < parts[index - 1].end)
    || range.end - range.start > 50_000) throw new Error('Select a smaller passage in the preview.');
  return range;
}
