import MarkdownIt from 'markdown-it';
import { isMap, parseDocument } from 'yaml';

export type ReviewRange = { start: number; end: number };
export type ReviewComment = {
  id: string;
  body: string;
  state: 'open' | 'resolved';
  includeInAi: boolean;
  range?: ReviewRange;
};

const key = 'review-comments';
const marker = /<!--(\/?)review:([1-9]\d*)-->/gu;
const parser = new MarkdownIt({ html: true });

type FrontMatter = { end: number; contentStart: number; contentEnd: number };

function codeRanges(source: string): ReviewRange[] {
  const offsets = lineOffsets(source);
  const ranges: ReviewRange[] = [];
  for (const token of parser.parse(source, {})) {
    if (!token.map) continue;
    const start = offsets[token.map[0]];
    const end = offsets[token.map[1]] ?? source.length;
    if (token.type === 'fence' || token.type === 'code_block') {
      ranges.push({ start, end });
    } else if (token.type === 'inline') {
      const code = /(?<!\\)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/gu;
      for (const match of source.slice(start, end).matchAll(code)) {
        ranges.push({ start: start + match.index, end: start + match.index + match[0].length });
      }
    }
  }
  return ranges;
}

function frontMatter(source: string): FrontMatter | undefined {
  const opening = source.match(/^\uFEFF?---[ \t]*\r?\n/u);
  if (!opening) return undefined;
  const closing = /^---[ \t]*(?:\r?\n|$)/gmu;
  closing.lastIndex = opening[0].length;
  const match = closing.exec(source);
  if (!match) return undefined;
  return { end: closing.lastIndex, contentStart: opening[0].length, contentEnd: match.index };
}

export function readReviewComments(source: string): {
  markdown: string;
  comments: ReviewComment[];
  range?: { start: number; end: number };
  error?: string;
} {
  const front = frontMatter(source);
  if (!front) return { markdown: source, comments: [] };
  const yaml = source.slice(front.contentStart, front.contentEnd);
  if (!new RegExp(`^${key}\\s*:`, 'mu').test(yaml)) return { markdown: source, comments: [] };
  try {
    const document = parseDocument(yaml);
    if (document.errors.length || !isMap(document.contents)) throw new Error();
    const pair = document.contents.items.find(item => String(item.key) === key);
    if (!pair || !pair.key || !pair.value || !('range' in pair.key) || !('range' in pair.value)
      || !pair.key.range || !pair.value.range) throw new Error();
    const data: unknown = document.toJS()[key];
    if (!Array.isArray(data)) throw new Error();
    const comments: ReviewComment[] = data.map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error();
      const entries = Object.entries(entry);
      if (entries.length !== 1 || !validId(entries[0][0])) throw new Error();
      const [id, value] = entries[0];
      if (typeof value === 'string' && value.trim()) return { id, body: value, state: 'open', includeInAi: true };
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      const detail = value as { text?: unknown; ai?: unknown; state?: unknown };
      if (typeof detail.text !== 'string' || !detail.text.trim()
        || (detail.ai !== undefined && typeof detail.ai !== 'boolean')
        || (detail.state !== undefined && detail.state !== 'open' && detail.state !== 'resolved')) throw new Error();
      return { id, body: detail.text, state: detail.state ?? 'open', includeInAi: detail.ai ?? true };
    });
    if (new Set(comments.map(comment => comment.id)).size !== comments.length) throw new Error();
    const start = front.contentStart + pair.key.range[0];
    const end = front.contentStart + pair.value.range[2];
    const withoutMetadata = source.slice(0, start) + source.slice(end);
    const ids = new Set(comments.map(comment => comment.id));
    const positions = new Map<string, { open: number[]; close: number[] }>();
    const protectedRanges = codeRanges(withoutMetadata);
    let markdown = '';
    let last = 0;
    for (const match of withoutMetadata.matchAll(marker)) {
      if (!ids.has(match[2]) || match.index < front.end - (end - start)
        || protectedRanges.some(range => match.index >= range.start && match.index < range.end)) continue;
      markdown += withoutMetadata.slice(last, match.index);
      const position = positions.get(match[2]) ?? { open: [], close: [] };
      const after = match.index + match[0].length;
      const newline = withoutMetadata.slice(after).match(/^\r?\n/u)?.[0] ?? '';
      const standaloneOpen = !match[1] && newline && (match.index === 0 || withoutMetadata[match.index - 1] === '\n');
      (match[1] ? position.close : position.open).push(markdown.length + (!match[1] && newline && !standaloneOpen ? newline.length : 0));
      positions.set(match[2], position);
      last = after + (standaloneOpen ? newline.length : 0);
    }
    markdown += withoutMetadata.slice(last);
    for (const comment of comments) {
      const position = positions.get(comment.id);
      if (position?.open.length === 1 && position.close.length === 1 && position.open[0] < position.close[0]) {
        comment.range = { start: position.open[0], end: position.close[0] };
      }
    }
    return { markdown, comments, range: { start, end } };
  } catch {
    return { markdown: source, comments: [], error: 'The review-comments front matter could not be read. Repair it in the Markdown source.' };
  }
}

export function writeReviewComments(source: string, comments: readonly ReviewComment[]): string {
  const stored = readReviewComments(source);
  if (stored.error) throw new Error(stored.error);
  const clean = stored.markdown;
  if (new Set(comments.map(comment => comment.id)).size !== comments.length
    || comments.some(comment => !validId(comment.id) || !comment.body.trim())) {
    throw new Error('Review comments must have unique numeric IDs and non-empty text.');
  }
  const events: { offset: number; text: string; order: number }[] = [];
  const eol = clean.includes('\r\n') ? '\r\n' : '\n';
  for (const comment of comments) {
    if (!comment.range) continue;
    const { start, end } = comment.range;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= end || end > clean.length) {
      throw new Error('The review selection is no longer valid. Reattach the comment.');
    }
    const atLineStart = start === 0 || clean[start - 1] === '\n';
    const previousLineStart = clean.lastIndexOf('\n', start - 2) + 1;
    const previousLine = clean.slice(previousLineStart, start).trim();
    const standalone = atLineStart && (start === 0 || !previousLine || previousLine === '---');
    const openOffset = atLineStart && !standalone ? start - (clean[start - 2] === '\r' ? 2 : 1) : start;
    events.push({ offset: openOffset, text: `<!--review:${comment.id}-->` + (standalone ? eol : ''), order: 0 });
    events.push({ offset: end, text: `<!--/review:${comment.id}-->`, order: 1 });
  }
  let marked = clean;
  for (const event of events.sort((a, b) => b.offset - a.offset || a.order - b.order)) {
    marked = marked.slice(0, event.offset) + event.text + marked.slice(event.offset);
  }
  if (parser.render(marked).replace(/^<!--review:[1-9]\d*-->\r?\n/gmu, '').replace(marker, '')
    !== parser.render(clean).replace(marker, '')) {
    throw new Error('This selection cannot be marked without changing the Markdown rendering. Select text within a Markdown text block.');
  }
  if (!comments.length) return marked;
  const entries = comments.map(comment => {
    const value = JSON.stringify(comment.body);
    if (comment.includeInAi && comment.state === 'open') return `  - ${comment.id}: ${value}`;
    return `  - ${comment.id}:${eol}      text: ${value}${comment.includeInAi ? '' : `${eol}      ai: false`}${comment.state === 'open' ? '' : `${eol}      state: resolved`}`;
  });
  const block = [key + ':', ...entries, ''].join(eol);
  const front = frontMatter(marked);
  const bom = marked.startsWith('\uFEFF') ? '\uFEFF' : '';
  const result = front ? marked.slice(0, front.contentEnd) + block + marked.slice(front.contentEnd)
    : bom + '---' + eol + block + '---' + eol + marked.slice(bom.length);
  const verified = readReviewComments(result);
  if (verified.error || verified.comments.length !== comments.length
    || comments.some(comment => {
      const actual = verified.comments.find(item => item.id === comment.id);
      return !actual || actual.body !== comment.body || actual.state !== comment.state || actual.includeInAi !== comment.includeInAi
        || (comment.range && (!actual.range || clean.slice(comment.range.start, comment.range.end)
          !== verified.markdown.slice(actual.range.start, actual.range.end)));
    })) {
    throw new Error('Review comments could not be saved safely. Check the front matter and selected Markdown.');
  }
  return result;
}

function validId(id: string): boolean {
  return /^[1-9]\d*$/u.test(id) && Number.isSafeInteger(Number(id));
}

export function stripReviewComments(markdown: string): string {
  return readReviewComments(markdown).markdown;
}

export function lineOffsets(source: string): number[] {
  return [0, ...Array.from(source.matchAll(/\n/gu), match => match.index + 1)];
}

export function reviewRangeLines(source: string, range: ReviewRange): { startLine: number; endLine: number } {
  const offsets = lineOffsets(source);
  const lineAt = (offset: number) => {
    const line = offsets.findIndex(start => start > offset);
    return line === -1 ? offsets.length : Math.max(1, line);
  };
  return { startLine: lineAt(range.start), endLine: lineAt(range.end - 1) };
}
