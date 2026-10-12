import MarkdownIt from 'markdown-it';

export type ImageEmbeddingResult = { markdown: string; embedded: number; failures: Array<{ source: string; message: string }> };
type ImageUse = { start: number; end: number; source: string; replacement: (data: string) => string };

/** Rewrite parsed image uses only, leaving code, normal links and reference definitions intact. */
export async function embedMarkdownImages(markdown: string, load: (source: string) => Promise<string>): Promise<ImageEmbeddingResult> {
  const md = new MarkdownIt({ html: true });
  const uses: ImageUse[] = [];
  const lines = markdown.split('\n');
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) { lineOffsets.push(offset); offset += line.length + 1; }
  let sourceMap: number[] = [];
  let parsingImage = false;
  // Use the installed parser's image rule so reference, escaped and nested syntax agree with preview.
  // Select by registered rule name, never function.name (which bundlers can rename).
  const ruleParser = new MarkdownIt({ html: true });
  ruleParser.inline.ruler.enableOnly(['image']);
  const imageRule = ruleParser.inline.ruler.getRules('')[0];
  if (!imageRule) throw new Error('Markdown image parser is unavailable.');
  md.inline.ruler.before('image', 'embed-image-use', (state, silent) => {
    if (silent || parsingImage || state.src.slice(state.pos, state.pos + 2) !== '![') return false;
    const start = state.pos;
    const labelEnd = md.helpers.parseLinkLabel(state, start + 1, false);
    let matched: boolean;
    parsingImage = true;
    try { matched = imageRule(state, silent); } finally { parsingImage = false; }
    if (!matched) return false;
    const token = state.tokens[state.tokens.length - 1];
    const source = token.attrGet('src');
    const title = token.attrGet('title');
    if (source && sourceMap[start] !== undefined && sourceMap[state.pos - 1] !== undefined) {
      const label = state.src.slice(start, labelEnd + 1);
      const titleSuffix = title ? ' "' + title.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : '';
      const alt = md.renderer.renderInlineAsText(token.children ?? [], md.options, state.env);
      uses.push({ start: sourceMap[start], end: sourceMap[state.pos - 1] + 1, source,
        // Markdown-it permits only a subset of image MIME types in data links.
        // Other formats (such as SVG and AVIF) remain valid images as HTML in Markdown.
        replacement: (data) => md.validateLink(data)
          ? label + '(<' + data + '>' + titleSuffix + ')'
          : '<img src="' + md.utils.escapeHtml(data) + '" alt="' + md.utils.escapeHtml(alt) + '"'
            + (title ? ' title="' + md.utils.escapeHtml(title) + '"' : '') + '>' });
    }
    return true;
  });
  const addHtmlImages = (html: string, map: number[]) => {
    if (/^\s*<(?:script|style|pre)\b/iu.test(html)) return;
    for (const tag of html.matchAll(/<!--[\s\S]*?-->|<img\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/giu)) {
      if (tag[0].startsWith('<!--')) continue;
      const attr = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu.exec(tag[0]);
      if (!attr) continue;
      const value = attr[1] ?? attr[2] ?? attr[3];
      const valueOffset = attr.index + attr[0].indexOf('=') + 1;
      const prefix = attr[0].slice(attr[0].indexOf('=') + 1);
      const start = tag.index! + valueOffset + prefix.indexOf(value);
      if (!value || map[start] === undefined || map[start + value.length - 1] === undefined) continue;
      uses.push({ start: map[start], end: map[start + value.length - 1] + 1,
        source: md.utils.unescapeAll(value), replacement: (data) => data });
    }
  };
  ruleParser.inline.ruler.enableOnly(['html_inline']);
  const htmlRule = ruleParser.inline.ruler.getRules('')[0];
  md.inline.ruler.before('html_inline', 'embed-html-image-use', (state, silent) => {
    const start = state.pos;
    if (silent || !htmlRule?.(state, silent)) return false;
    addHtmlImages(state.src.slice(start, state.pos), sourceMap.slice(start, state.pos));
    return true;
  });
  md.core.ruler.at('inline', (state) => {
    let blockMap: [number, number] = [0, lines.length];
    let mappedUntil = 0;
    for (const token of state.tokens) {
      if (token.map) blockMap = token.map;
      if (token.type !== 'inline' && token.type !== 'html_block') continue;
      sourceMap = mapContent(token, blockMap, lines, lineOffsets, mappedUntil);
      if (sourceMap.length) mappedUntil = sourceMap[token.content.length - 1] + 1;
      if (token.type === 'html_block') addHtmlImages(token.content, sourceMap);
      else {
        token.children = [];
        state.md.inline.parse(token.content, state.md, state.env, token.children);
      }
    }
  });
  md.parse(markdown, {});
  const cache = new Map<string, Promise<string>>();
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  const failures: ImageEmbeddingResult['failures'] = [];
  for (const use of uses) {
    if (/^data:image\//iu.test(use.source)) continue;
    try {
      let pending = cache.get(use.source);
      if (!pending) { pending = load(use.source); cache.set(use.source, pending); }
      replacements.push({ start: use.start, end: use.end, value: use.replacement(await pending) });
    } catch (error) {
      if (!failures.some((failure) => failure.source === use.source)) failures.push({ source: use.source, message: error instanceof Error ? error.message : String(error) });
    }
  }
  let result = markdown;
  for (const edit of replacements.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  return { markdown: result, embedded: replacements.length, failures };
}

function mapContent(token: { content: string }, range: [number, number], lines: string[], offsets: number[], mappedUntil: number): number[] {
  const map: number[] = [];
  let lineIndex = range[0];
  const contentLines = token.content.split('\n');
  if (contentLines[contentLines.length - 1] === '') contentLines.pop();
  for (const contentLine of contentLines) {
    let column = -1;
    while (lineIndex < range[1]) {
      column = lines[lineIndex].indexOf(contentLine, Math.max(0, mappedUntil - offsets[lineIndex]));
      if (column >= 0) break;
      lineIndex++;
    }
    if (column < 0) return [];
    for (let i = 0; i < contentLine.length; i++) map.push(offsets[lineIndex] + column + i);
    map.push(offsets[lineIndex] + lines[lineIndex].length);
    lineIndex++;
  }
  return map;
}
