import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: true });

export type PresentationHeadingRoles = { label?: string; subtitle?: string };
export type PresentationHeadingIssue = { start: number; end: number; message: string };
type Range = { start: number; end: number };
type Comment = Range & { content: string };

/** Source ranges let comment handling respect Markdown code, rather than scanning examples as instructions. */
export function readPresentationSource(source: string) {
  const offsets = [0];
  for (let index = 0; index < source.length; index += 1) if (source[index] === '\n') offsets.push(index + 1);
  const lineOffset = (line: number) => offsets[line] ?? source.length;
  const tokens = markdown.parse(source, {});
  const protectedRanges: Range[] = [];
  for (const token of tokens) {
    if (!token.map) continue;
    const start = lineOffset(token.map[0]);
    const end = lineOffset(token.map[1]);
    if (token.type === 'fence' || token.type === 'code_block') {
      protectedRanges.push({ start, end });
    } else if (token.type === 'inline' && token.children?.some(child => child.type === 'code_inline')) {
      const text = source.slice(start, end);
      for (let index = 0; index < text.length;) {
        if (text[index] !== '`' || isEscaped(text, index)) { index += 1; continue; }
        const length = runLength(text, index);
        let close = index + length;
        while (close < text.length) {
          close = text.indexOf('`', close);
          if (close < 0) break;
          const count = runLength(text, close);
          if (count === length) break;
          close += count;
        }
        if (close >= 0 && close < text.length) {
          protectedRanges.push({ start: start + index, end: start + close + length });
          index = close + length;
        } else index += length;
      }
    }
  }
  protectedRanges.sort((a, b) => a.start - b.start);
  const comments: Comment[] = [];
  let cursor = 0;
  let protectedIndex = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<!--', cursor);
    if (start < 0) break;
    while (protectedRanges[protectedIndex]?.end <= start) protectedIndex += 1;
    const protectedRange = protectedRanges[protectedIndex];
    if (protectedRange && start >= protectedRange.start && start < protectedRange.end) {
      cursor = protectedRange.end;
      continue;
    }
    if (isEscaped(source, start)) { cursor = start + 4; continue; }
    const end = findCommentEnd(source, start + 4);
    if (end < 0) break;
    comments.push({ start, end, content: source.slice(start + 4, end - 3) });
    cursor = end;
  }
  return { tokens, comments, lineOffset };
}

/** Only standalone top-level markers followed by one text paragraph become optional heading roles. */
export function extractPresentationHeadingRoles(source: string): {
  body: string; heading?: PresentationHeadingRoles; issues: PresentationHeadingIssue[];
} {
  if (!/<!--\s*slide-(?:label|subtitle)\b/iu.test(source)) return { body: source, issues: [] };
  const { tokens, comments, lineOffset } = readPresentationSource(source);
  const candidates: { role: keyof PresentationHeadingRoles; comment: Comment; paragraph?: Range }[] = [];
  const issues: PresentationHeadingIssue[] = [];
  const removals: (Range & { replacement?: string })[] = [];
  for (const token of tokens) {
    if (token.type !== 'html_block' || token.level !== 0 || !token.map) continue;
    const firstLine = token.content.split(/\r?\n/u)[0];
    if (/^ {0,3}<!--\s*slide-(?:label|subtitle)\b/iu.test(firstLine) && !firstLine.includes('-->')) {
      const start = lineOffset(token.map[0]) + source.slice(lineOffset(token.map[0])).indexOf('<!--');
      issues.push({ start, end: start + firstLine.trimStart().length, message: 'Close the heading marker with --> on the same line. Its source remains visible.' });
      removals.push({ start, end: start + 1, replacement: '&lt;' });
    }
  }
  for (const comment of comments) {
    if (/[\r\n]/u.test(source.slice(comment.start, comment.end))) continue;
    if (!/^\s*slide-(?:label|subtitle)\b/iu.test(comment.content)) continue;
    const match = comment.content.match(/^\s*slide-(label|subtitle)\s*$/iu);
    const tokenIndex = tokens.findIndex(token => token.type === 'html_block' && token.level === 0
      && token.map && lineOffset(token.map[0]) <= comment.start && lineOffset(token.map[1]) >= comment.end);
    if (tokenIndex < 0) continue;
    const token = tokens[tokenIndex];
    if (!match) {
      issues.push({ start: comment.start, end: comment.end, message: 'Use a standalone slide-label or slide-subtitle marker without arguments; put its text in the following paragraph.' });
      const replacement = source.slice(comment.start, comment.end).replace(/&/gu, '&amp;').replace(/</gu, '&lt;');
      removals.push({ ...comment, replacement });
      continue;
    }
    // Extra HTML/comments in this block make the association ambiguous; retain the text instead.
    const standalone = token.content.trim() === source.slice(comment.start, comment.end);
    const open = tokens[tokenIndex + 1];
    const inline = tokens[tokenIndex + 2];
    const close = tokens[tokenIndex + 3];
    const validParagraph = standalone && open?.type === 'paragraph_open' && open.level === 0 && open.map
      && inline?.type === 'inline' && close?.type === 'paragraph_close'
      && !inline.children?.some(child => child.type === 'image' || child.type === 'html_inline');
    candidates.push({
      role: match[1].toLowerCase() as keyof PresentationHeadingRoles,
      comment,
      paragraph: validParagraph && open.map ? { start: lineOffset(open.map[0]), end: lineOffset(open.map[1]) } : undefined,
    });
  }
  const roleCounts = { label: 0, subtitle: 0 };
  for (const candidate of candidates) roleCounts[candidate.role] += 1;
  const heading: PresentationHeadingRoles = {};
  for (const candidate of candidates) {
    const duplicates = roleCounts[candidate.role] > 1;
    if (duplicates || !candidate.paragraph) {
      issues.push({
        start: candidate.comment.start, end: candidate.comment.end,
        message: duplicates
          ? 'Use at most one slide-' + candidate.role + ' marker per slide. Its text remains in the body.'
          : 'Follow slide-' + candidate.role + ' with one top-level text paragraph. Headings, images and HTML are not heading-role values.',
      });
      continue;
    }
    heading[candidate.role] = source.slice(candidate.paragraph.start, candidate.paragraph.end).trim();
    removals.push(candidate.comment, candidate.paragraph);
  }
  let body = source;
  for (const range of removals.sort((a, b) => b.start - a.start)) body = body.slice(0, range.start) + (range.replacement ?? '') + body.slice(range.end);
  return { body, ...(Object.keys(heading).length ? { heading } : {}), issues };
}

function runLength(source: string, start: number): number {
  let end = start;
  while (source[end] === '`') end += 1;
  return end - start;
}

function isEscaped(source: string, index: number): boolean {
  let slashes = 0;
  while (index > 0 && source[--index] === '\\') slashes += 1;
  return slashes % 2 === 1;
}

/** Preserve the established rule allowing backticked "-->" examples inside actual notes. */
function findCommentEnd(source: string, start: number): number {
  let inlineLength = 0;
  for (let index = start; index < source.length - 2;) {
    if (source[index] === '`') {
      const length = runLength(source, index);
      if (!inlineLength) inlineLength = length;
      else if (inlineLength === length) inlineLength = 0;
      index += length;
    } else if (!inlineLength && source.startsWith('-->', index)) return index + 3;
    else index += 1;
  }
  return -1;
}

export type PresentationRegionIssue = { start: number; end: number; message: string };

/** Split only standalone top-level region boundaries, preserving source order and code examples. */
export function splitPresentationRegions(source: string): { regions: string[]; issues: PresentationRegionIssue[]; safeSource?: string } {
  if (!/<!--\s*region-break\b/iu.test(source)) return { regions: [source], issues: [] };
  const { tokens, comments, lineOffset } = readPresentationSource(source);
  const malformed: { start: number; end: number }[] = [];
  for (const token of tokens) {
    if (token.type !== 'html_block' || token.level !== 0 || !token.map) continue;
    const line = token.content.split(/\r?\n/u)[0];
    if (/^ {0,3}<!--\s*region-break\b/iu.test(line) && !/^ {0,3}<!--\s*region-break\s*-->\s*$/iu.test(line)) {
      const start = lineOffset(token.map[0]) + line.indexOf('<!--');
      malformed.push({ start, end: start + line.trimStart().length });
    }
  }
  let safeSource = source;
  for (const marker of [...malformed].reverse()) safeSource = safeSource.slice(0, marker.start) + '&lt;' + safeSource.slice(marker.start + 1);
  const malformedIssues = malformed.map(marker => ({ ...marker, message: 'Use a standalone region-break marker without arguments. Its source remains visible.' }));
  const boundaries = comments.filter(comment => /^\s*region-break\s*$/iu.test(comment.content)
    && tokens.some(token => token.type === 'html_block' && token.level === 0 && token.map
      && lineOffset(token.map[0]) <= comment.start && lineOffset(token.map[1]) >= comment.end
      && token.content.trim() === source.slice(comment.start, comment.end)));
  if (!boundaries.length) return { regions: [source], issues: malformedIssues, ...(malformed.length ? { safeSource } : {}) };
  const issues: PresentationRegionIssue[] = [...malformedIssues];
  const regions: string[] = [];
  let start = 0;
  for (const boundary of boundaries) {
    const region = source.slice(start, boundary.start).trim();
    regions.push(region);
    if (!region) issues.push({ start: boundary.start, end: boundary.end, message: 'Each content area must contain text or another visible element.' });
    start = boundary.end;
  }
  const last = source.slice(start).trim();
  regions.push(last);
  for (let index = 0; index < regions.length; index += 1) {
    if (!regions[index]) continue;
    let visible = index === 0 ? extractPresentationHeadingRoles(regions[index]).body : regions[index];
    for (const comment of [...readPresentationSource(visible).comments].reverse()) {
      visible = visible.slice(0, comment.start) + visible.slice(comment.end);
    }
    if (index === 0) visible = visible.trimStart().replace(/^ {0,3}#{1,2}[ \t]+[^\r\n]*(?:\r?\n|$)/u, '');
    if (!visible.trim()) {
      const boundary = boundaries[Math.min(index, boundaries.length - 1)];
      issues.push({ start: boundary.start, end: boundary.end, message: index === 0
        ? 'The first content area needs content after the slide title.'
        : 'Each content area must contain text or another visible element.' });
    }
  }
  if (!last) {
    const boundary = boundaries[boundaries.length - 1];
    issues.push({ start: boundary.start, end: boundary.end, message: 'Each content area must contain text or another visible element.' });
  }
  if (regions.length > 4) {
    const boundary = boundaries[3];
    issues.push({ start: boundary.start, end: boundary.end, message: 'Use at most four content areas on a slide.' });
  }
  return { regions, issues, ...(malformed.length ? { safeSource } : {}) };
}
