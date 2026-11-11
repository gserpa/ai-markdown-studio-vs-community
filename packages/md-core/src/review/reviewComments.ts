import MarkdownIt from 'markdown-it';

export type ReviewSelection = {
  quote: string;
  parts: ReviewAnchorPart[];
};

export type ReviewAnchorPart = {
  quote: string;
  startLine: number;
  endLine: number;
  source: string;
  before: string;
  after: string;
  renderedBefore: string;
  renderedAfter: string;
};

export type ReviewComment = {
  id: string;
  body: string;
  state: 'open' | 'revised';
  includeInAi: boolean;
  original: ReviewSelection;
  anchor?: ReviewSelection;
};

const marker = '<!-- markdown-ai-studio-review';
const parser = new MarkdownIt({ html: true });

export function readReviewComments(markdown: string): {
  markdown: string;
  comments: ReviewComment[];
  range?: { start: number; end: number };
  error?: string;
} {
  if (!markdown.includes(marker)) return { markdown, comments: [] };
  const offsets = lineOffsets(markdown);
  const blocks = parser.parse(markdown, {}).filter(token => token.type === 'html_block'
    && token.level === 0 && token.map && token.content.startsWith(marker));
  if (!blocks.length) return { markdown, comments: [] };
  const block = blocks[0];
  const first = offsets[block.map![0]];
  const end = offsets[block.map![1]] ?? markdown.length;
  const prefix = markdown.slice(0, first);
  const trailing = markdown.slice(end);
  // Preserve line numbers when text has been added after the metadata.
  const clean = trailing.length ? prefix + markdown.slice(first, end).replace(/[^\r\n]/gu, '') + trailing
    : prefix.replace(/(?:\r?\n){2}$/u, '');
  const range = { start: trailing.length ? first : clean.length, end };
  try {
    if (blocks.length !== 1) throw new Error();
    const match = block.content.match(/^<!-- markdown-ai-studio-review v1\n([\s\S]+)\n-->\s*$/u);
    if (!match) throw new Error();
    const comments: unknown = JSON.parse(match[1]);
    if (!Array.isArray(comments) || !comments.every(isReviewComment)
      || new Set(comments.map(comment => comment.id)).size !== comments.length) throw new Error();
    return { markdown: clean, comments, range };
  } catch {
    return { markdown: clean, comments: [], range, error: 'The embedded review comments could not be read. Repair the review block in the Markdown source.' };
  }
}

export function writeReviewComments(markdown: string, comments: readonly ReviewComment[]): string {
  const stored = readReviewComments(markdown);
  if (stored.error) throw new Error(stored.error);
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n';
  const tail = stored.range ? markdown.slice(stored.range.end) : '';
  const prefix = stored.range ? markdown.slice(0, stored.range.start) : markdown;
  if (!comments.length) return prefix + tail;
  const json = JSON.stringify(comments, null, 2)
    .replaceAll('--', '\\u002d\\u002d').replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('\x60', '\\u0060');
  const block = [marker + ' v1', json, '-->', ''].join('\n').replaceAll('\n', eol);
  const result = prefix + (tail.length ? '' : eol + eol) + block + tail;
  if (!readReviewComments(result).range) throw new Error('Close the Markdown block at the end of the file before adding review comments.');
  return result;
}

export function stripReviewComments(markdown: string): string {
  return readReviewComments(markdown).markdown;
}

export function lineOffsets(source: string): number[] {
  return [0, ...Array.from(source.matchAll(/\n/gu), match => match.index + 1)];
}

export function locateReviewPart(source: string, part: ReviewAnchorPart): { startLine: number; endLine: number } | undefined {
  const offsets = lineOffsets(source);
  const candidates: number[] = [];
  for (let index = source.indexOf(part.source); index !== -1; index = source.indexOf(part.source, index + 1)) {
    if (index !== 0 && source[index - 1] !== '\n') continue;
    const end = index + part.source.length;
    if (part.source.endsWith('\n') || end === source.length || /^\r?\n/u.test(source.slice(end))) candidates.push(index);
  }
  const contextual = candidates.filter(index => source.slice(0, index).endsWith(part.before)
    && source.slice(index + part.source.length).startsWith(part.after));
  const index = candidates.length === 1 ? candidates[0] : contextual.length === 1 ? contextual[0] : undefined;
  if (index === undefined) return candidates.length === 0 ? locateEditedReviewPart(source, offsets, part) : undefined;
  const startLine = lineAt(offsets, index);
  const endLine = lineAt(offsets, index + part.source.trimEnd().length - 1);
  const exact = part.source.indexOf(part.quote);
  if (exact !== -1 && part.source.indexOf(part.quote, exact + 1) === -1) {
    return { startLine: lineAt(offsets, index + exact), endLine: lineAt(offsets, index + exact + part.quote.length - 1) };
  }
  return { startLine, endLine };
}

function locateEditedReviewPart(source: string, offsets: readonly number[], part: ReviewAnchorPart) {
  const initial = part.source.indexOf(part.quote);
  if (initial === -1 || part.source.indexOf(part.quote, initial + 1) !== -1) return undefined;
  const before = (part.before + part.source.slice(0, initial)).slice(-48).split(/\r?\n/u).at(-1) ?? '';
  const after = (part.source.slice(initial + part.quote.length) + part.after).slice(0, 48).split(/\r?\n/u)[0];
  const candidates: number[] = [];
  for (let start = source.indexOf(part.quote); start !== -1; start = source.indexOf(part.quote, start + 1)) {
    const left = /[\p{L}\p{N}]/u.test(before) && source.slice(Math.max(0, start - before.length), start) === before;
    const end = start + part.quote.length;
    const right = /[\p{L}\p{N}]/u.test(after) && source.startsWith(after, end);
    if (left || right) candidates.push(start);
  }
  if (candidates.length !== 1) return undefined;
  return { startLine: lineAt(offsets, candidates[0]), endLine: lineAt(offsets, candidates[0] + part.quote.length - 1) };
}

function lineAt(offsets: readonly number[], offset: number): number {
  const line = offsets.findIndex(start => start > offset);
  return line === -1 ? offsets.length : Math.max(1, line);
}

function isReviewComment(value: unknown): value is ReviewComment {
  if (typeof value !== 'object' || !value) return false;
  const item = value as Partial<ReviewComment>;
  return typeof item.id === 'string' && typeof item.body === 'string' && typeof item.includeInAi === 'boolean'
    && (item.state === 'open' || item.state === 'revised') && isSelection(item.original)
    && (item.anchor === undefined || isSelection(item.anchor));
}

function isSelection(value: unknown): value is ReviewSelection {
  if (typeof value !== 'object' || !value) return false;
  const selection = value as Partial<ReviewSelection>;
  return typeof selection.quote === 'string' && selection.quote.length > 0
    && Array.isArray(selection.parts) && selection.parts.length > 0 && selection.parts.every(part =>
      part && typeof part === 'object' && Number.isSafeInteger(part.startLine) && part.startLine > 0
      && Number.isSafeInteger(part.endLine) && part.endLine >= part.startLine
      && [part.quote, part.source, part.before, part.after, part.renderedBefore, part.renderedAfter].every(field => typeof field === 'string')
      && part.quote.length > 0 && part.source.length > 0);
}
