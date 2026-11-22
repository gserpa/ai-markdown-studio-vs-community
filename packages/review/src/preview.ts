import {
  componentReviewRange, lineOffsets, readReviewComments, reviewRangeLines,
  type createMarkdownRenderer,
  type ReviewComment, type ReviewRange,
} from '@mfo/core';

type ReviewBlock = { id: string; text: string; startLine: number; endLine: number; component?: boolean };
export type ReviewPreview = {
  version: number;
  blocks: ReviewBlock[];
};

export type ReviewPreviewAdapters = {
  createDocument(html: string): { document: Document; dispose(): void };
  renderAnchor(markdown: string): string;
  sanitize(html: string): string;
};

export function createReviewPreviewTools(adapters: ReviewPreviewAdapters) {
  return {
    renderReviewMarkdown: (renderer: ReturnType<typeof createMarkdownRenderer>, markdown: string,
      lines: readonly (number | undefined)[] | undefined, key: string) =>
      renderReviewMarkdown(adapters, renderer, markdown, lines, key),
    buildReviewPreview: (body: string, store: ReturnType<typeof readReviewComments>, version: number, key: string, contentKey: string) =>
      buildReviewPreview(adapters, body, store, version, key, contentKey),
    readPreviewSelection: (markdown: string, preview: ReviewPreview, input: unknown) =>
      readPreviewSelection(adapters, markdown, preview, input),
  };
}

export function reviewContentKeySource(markdown: string): string {
  return markdown.replace(/^\uFEFF?---[ \t]*\r?\n---[ \t]*\r?\n/u, '');
}

export function renderReviewMarkdown(
  adapters: ReviewPreviewAdapters, renderer: ReturnType<typeof createMarkdownRenderer>, markdown: string,
  lines: readonly (number | undefined)[] | undefined, key: string,
): string {
  if (!lines) return adapters.sanitize(renderer.render(markdown));
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
  if (fence) rules.fence = (...args) => {
    const token = args[0][args[1]];
    const html = fence(...args);
    const component = token.info.trim().split(/\s+/u)[0]?.toLowerCase() === 'component';
    const marker = token.attrGet('data-review-block');
    return component && marker && /^\w+:\d+:\d+$/u.test(marker)
      ? html.replace(/^<(section|table)\b/u, '<$1 data-review-block="' + marker + '" data-review-component="true"')
      : markCodeBlock(html, marker);
  };
  if (code) rules.code_block = (...args) => markCodeBlock(code(...args), args[0][args[1]].attrGet('data-review-block'));
  try {
    return adapters.sanitize(renderer.renderer.render(tokens, renderer.options, env));
  } finally {
    rules.fence = fence;
    rules.code_block = code;
  }
}

function markCodeBlock(html: string, marker: string | null): string {
  return marker && /^\w+:\d+:\d+$/u.test(marker) ? html.replace(/^<pre\b/u, '<pre data-review-block="' + marker + '"') : html;
}

function buildReviewPreview(adapters: ReviewPreviewAdapters, body: string, store: ReturnType<typeof readReviewComments>,
  version: number, key: string, contentKey: string) {
  const dom = adapters.createDocument(body);
  try {
    const root = dom.document.body.firstElementChild;
    if (!root) throw new Error('Review preview has no root element.');
    const blocks: ReviewBlock[] = [];
    const lineCount = lineOffsets(store.markdown).length;
    for (const node of root.querySelectorAll('[data-review-block]')) {
      const [scope, from, to, ...extra] = (node.getAttribute('data-review-block') ?? '').split(':');
      const text = node.textContent ?? '';
      const startLine = Number(from);
      const endLine = Number(to);
      if (scope !== key || extra.length || !/^[1-9]\d*$/u.test(from ?? '') || !/^[1-9]\d*$/u.test(to ?? '')
        || !Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine)
        || startLine > endLine || endLine > lineCount || !text.trim()) {
        node.removeAttribute('data-review-block');
        continue;
      }
      const id = String(blocks.length);
      node.setAttribute('data-review-block', id);
      blocks.push({ id, text, startLine, endLine, ...(node.getAttribute('data-review-component') === 'true' ? { component: true } : {}) });
    }
    const comments = store.comments.map(comment => ({
      id: comment.id, body: comment.body, state: comment.state, includeInAi: comment.includeInAi,
      originalQuote: comment.range ? store.markdown.slice(comment.range.start, comment.range.end) : 'Selection unavailable',
      originalLines: comment.range ? reviewRangeLines(store.markdown, comment.range) : { startLine: 0, endLine: 0 },
      placement: locatePlacement(adapters, store.markdown, comment, blocks),
    }));
    root.setAttribute('data-review-state', JSON.stringify({
      version, contentKey, comments, error: store.error,
    }));
    return { body: dom.document.body.innerHTML, review: { version, blocks } satisfies ReviewPreview };
  } finally {
    dom.dispose();
  }
}

function locatePlacement(adapters: ReviewPreviewAdapters, markdown: string, comment: ReviewComment, blocks: ReviewBlock[]) {
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
    const wholeComponent = block.component ? componentReviewRange(source) : undefined;
    if (wholeComponent && start === wholeComponent.start && end === wholeComponent.end) {
      return { id: block.id, start: 0, end: block.text.length };
    }
    const slice = renderedSlice(adapters, source, start, end, block.text, block.component);
    return slice ? { id: block.id, ...slice } : undefined;
  });
  return pieces.length && pieces.every(piece => piece !== undefined) ? { slices: pieces, ...lines } : undefined;
}

function renderedSlice(adapters: ReviewPreviewAdapters, source: string, start: number, end: number, blockText: string, component = false) {
  if (component) {
    const open = '<!--review:1-->';
    const close = '<!--/review:1-->';
    const marked = source.slice(0, start) + open + source.slice(start, end) + close + source.slice(end);
    const dom = adapters.createDocument('<body>' + adapters.renderAnchor(marked) + '</body>');
    try {
      const text = dom.document.body.textContent ?? '';
      const first = text.indexOf(open);
      const last = text.indexOf(close);
      if (first < 0 || last < first || text.indexOf(open, first + open.length) !== -1
        || text.indexOf(close, last + close.length) !== -1) return undefined;
      const plain = text.slice(0, first) + text.slice(first + open.length, last) + text.slice(last + close.length);
      const blockOffset = plain.indexOf(blockText);
      if (blockOffset < 0 || first < blockOffset || last - open.length > blockOffset + blockText.length) return undefined;
      return { start: first - blockOffset, end: last - open.length - blockOffset };
    } finally {
      dom.dispose();
    }
  }
  const atLineStart = start === 0 || source[start - 1] === '\n';
  const previousLineStart = source.lastIndexOf('\n', start - 2) + 1;
  const previousLine = source.slice(previousLineStart, start).trim();
  const standalone = atLineStart && (start === 0 || !previousLine || previousLine === '---');
  const moved = atLineStart && !standalone;
  const open = moved ? start - (source[start - 2] === '\r' ? 2 : 1) : start;
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const marked = source.slice(0, open) + '<!--review:1-->' + (standalone ? eol : '')
    + source.slice(open, end) + '<!--/review:1-->' + source.slice(end);
  const dom = adapters.createDocument('<body>' + adapters.renderAnchor(marked) + '</body>');
  try {
    const walker = dom.document.createTreeWalker(dom.document.body, 4 | 128);
    let text = '';
    let startOffset: number | undefined;
    let endOffset: number | undefined;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === 3) text += node.textContent ?? '';
      else if (node.textContent === 'review:1') startOffset = text.length;
      else if (node.textContent === '/review:1') endOffset = text.length;
    }
    const blockOffset = text.indexOf(blockText);
    if (startOffset === undefined || endOffset === undefined || blockOffset < 0) return undefined;
    const first = Math.max(startOffset + (moved ? 1 : 0), blockOffset) - blockOffset;
    const last = Math.min(endOffset, blockOffset + blockText.length) - blockOffset;
    return first < last ? { start: first, end: last } : undefined;
  } finally {
    dom.dispose();
  }
}

export function readPreviewSelection(adapters: ReviewPreviewAdapters, markdown: string, preview: ReviewPreview, input: unknown): ReviewRange {
  if (!Array.isArray(input) || !input.length || input.length > 200) throw new Error('Select text in the Markdown preview.');
  if (!preview || !Array.isArray(preview.blocks)) throw new Error('Select text in the current preview.');
  const offsets = lineOffsets(markdown);
  const parts = input.map((value: unknown) => {
    if (!value || typeof value !== 'object' || !('id' in value) || !('start' in value) || !('end' in value)
      || typeof value.id !== 'string' || typeof value.start !== 'number' || typeof value.end !== 'number') {
      throw new Error('Select text in the current preview.');
    }
    const block = preview.blocks.find(item => item && item.id === value.id);
    if (!block || typeof block.text !== 'string' || !Number.isSafeInteger(block.startLine) || !Number.isSafeInteger(block.endLine)
      || block.startLine < 1 || block.endLine < block.startLine || block.endLine > offsets.length
      || !Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end)
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
      const slice = renderedSlice(adapters, source, position, position + quote.length, block.text, block.component);
      return slice !== undefined && slice.start === value.start && slice.end === value.end;
    });
    if (matches.length !== 1) {
      if (input.length === 1 && block.component && 'multipleObjects' in value && value.multipleObjects === true) {
        const wholeComponent = componentReviewRange(source);
        if (wholeComponent) return { start: start + wholeComponent.start, end: start + wholeComponent.end };
      }
      throw new Error('This selection cannot be mapped uniquely to Markdown. Select a smaller passage.');
    }
    return { start: start + matches[0], end: start + matches[0] + quote.length };
  });
  const range = { start: parts[0].start, end: parts[parts.length - 1].end };
  if (parts.some((part, index) => index > 0 && part.start < parts[index - 1].end)
    || range.end - range.start > 50_000) throw new Error('Select a smaller passage in the preview.');
  return range;
}
