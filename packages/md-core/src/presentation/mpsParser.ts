import { parse as parseYaml } from 'yaml';

export type PresentationMetadata = Record<string, unknown>;

export type MarkdownPresentationSlide = {
  template: string;
  body: string;
  notes?: string;
};

export type MarkdownPresentation = {
  meta: PresentationMetadata;
  slides: MarkdownPresentationSlide[];
};

type CoverSlideMetadata = {
  title?: string;
  subtitle?: string;
};

export type MarkdownDocumentKind = 'text' | 'presentation';

const DEFAULT_TEMPLATE = 'default';
const SLIDE_DIRECTIVE_PATTERN = /^<!--\s*slide\s*:\s*([^>]+?)\s*-->\s*/u;
const ANY_SLIDE_DIRECTIVE_PATTERN = /<!--\s*slide\s*:\s*[^>]+?\s*-->/gu;
const HTML_COMMENT_START = '<!--';
const HTML_COMMENT_END = '-->';

export function parseMarkdownPresentation(source: string): MarkdownPresentation {
  const normalized = stripBom(source);
  const { meta, body } = extractFrontMatter(normalized);
  const { chunks, startedWithSeparator } = splitSlides(body);
  const slides = chunks
    .filter((chunk, index) => index > 0 || startedWithSeparator || chunk.trim().length > 0)
    .map(parseSlideChunk);

  return {
    meta,
    slides,
  };
}

export function resolveMarkdownPresentation(presentation: MarkdownPresentation): MarkdownPresentation {
  const meta: PresentationMetadata = { ...presentation.meta };
  const slides = presentation.slides.map((slide) => ({ ...slide }));
  const frontMatterTitle = normalizeOptionalString(meta.title);
  const frontMatterSubtitle = normalizeOptionalString(meta.subtitle);
  const frontMatterAuthor = normalizeOptionalString(meta.author);
  const firstSlide = slides[0];

  if (firstSlide && isCoverSlide(firstSlide)) {
    const coverMetadata = extractCoverSlideMetadata(firstSlide.body);

    if (coverMetadata.title) {
      meta.title = coverMetadata.title;
    } else if (frontMatterTitle) {
      meta.title = frontMatterTitle;
    }

    if (coverMetadata.subtitle) {
      meta.subtitle = coverMetadata.subtitle;
    } else if (frontMatterSubtitle) {
      meta.subtitle = frontMatterSubtitle;
    }
  } else if (frontMatterTitle) {
    slides.unshift(createGeneratedCoverSlide(frontMatterTitle, frontMatterSubtitle, frontMatterAuthor));
    meta.title = frontMatterTitle;
    if (frontMatterSubtitle) {
      meta.subtitle = frontMatterSubtitle;
    }
  }

  const effectiveTitle = normalizeOptionalString(meta.title)
    ?? extractFirstPresentationTitle(slides);
  if (effectiveTitle) {
    meta.title = effectiveTitle;
  }

  const effectiveSubtitle = normalizeOptionalString(meta.subtitle);
  if (effectiveSubtitle) {
    meta.subtitle = effectiveSubtitle;
  }

  return {
    meta,
    slides,
  };
}

function extractFirstL1Heading(body: string): string | undefined {
  // Match first line starting with # (not ##)
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : undefined;
}

export function isMarkdownPresentationSource(source: string): boolean {
  return getMarkdownDocumentKind(source) === 'presentation';
}

export function getMarkdownDocumentKind(source: string): MarkdownDocumentKind {
  const normalized = stripBom(source);
  const { meta } = extractFrontMatter(normalized);
  return normalizeDocumentKind(meta.document);
}

export function extractMarkdownFrontMatterMeta(source: string): Record<string, unknown> {
  const normalized = stripBom(source);
  const lines = normalized.split(/\r?\n/u);
  if (lines.length < 3 || lines[0].trim() !== '---') {
    return {};
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() !== '---') {
      continue;
    }

    const yamlBlock = lines.slice(1, index).join('\n');
    const parsed = parseFrontMatterYaml(yamlBlock);
    if (!isFrontMatterRecord(parsed)) {
      return {};
    }

    return parsed as Record<string, unknown>;
  }

  return {};
}

export function stripMarkdownFrontMatter(source: string): string {
  const normalized = stripBom(source);
  const lines = normalized.split(/\r?\n/u);
  if (lines.length < 3 || lines[0].trim() !== '---') {
    return normalized;
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      const yamlBlock = lines.slice(1, index).join('\n');
      if (yamlBlock.trim().length > 0 && !isFrontMatterRecord(parseFrontMatterYaml(yamlBlock))) {
        return normalized;
      }

      return lines.slice(index + 1).join('\n');
    }
  }

  return normalized;
}

function extractFrontMatter(source: string): { meta: PresentationMetadata; body: string } {
  const lines = source.split(/\r?\n/u);
  if (lines.length < 3 || lines[0].trim() !== '---') {
    return { meta: {}, body: source };
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() !== '---') {
      continue;
    }

    const yamlBlock = lines.slice(1, index).join('\n');
    const parsed = parseFrontMatterYaml(yamlBlock);
    if (!isFrontMatterRecord(parsed)) {
      return { meta: {}, body: source };
    }

    return {
      meta: parsed,
      body: lines.slice(index + 1).join('\n'),
    };
  }

  return { meta: {}, body: source };
}

function parseFrontMatterYaml(yamlBlock: string): unknown {
  try {
    return parseYaml(yamlBlock);
  } catch {
    // Keep preview/rendering resilient when front matter contains invalid YAML.
    return undefined;
  }
}

function parseSlideChunk(chunk: string): MarkdownPresentationSlide {
  const trimmedChunk = trimOuterBlankLines(chunk);

  let template = DEFAULT_TEMPLATE;
  let remaining = trimmedChunk;
  const initialDirectiveMatch = remaining.match(SLIDE_DIRECTIVE_PATTERN);
  if (initialDirectiveMatch) {
    template = initialDirectiveMatch[1].trim() || DEFAULT_TEMPLATE;
    remaining = remaining.slice(initialDirectiveMatch[0].length);
  }

  const trailingDirectives = [...remaining.matchAll(ANY_SLIDE_DIRECTIVE_PATTERN)];
  if (trailingDirectives.length > 0) {
    throw new Error('Slide directives must appear only once and at the start of a slide.');
  }

  const extractedComments = extractSpeakerNotes(remaining);
  const collectedNotes = extractedComments.notes
    .filter((value): value is string => Boolean(value && value.trim()))
    .join('\n\n');

  return {
    template,
    body: trimOuterBlankLines(extractedComments.body),
    notes: collectedNotes || undefined,
  };
}

function splitSlides(source: string): { chunks: string[]; startedWithSeparator: boolean } {
  const lines = source.split(/\r?\n/u);
  const chunks: string[] = [];
  const current: string[] = [];
  let startedWithSeparator = false;
  let fence: { marker: string; length: number } | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/u);

    if (fence) {
      current.push(line);
      if (fenceMatch && fenceMatch[1][0] === fence.marker && fenceMatch[1].length >= fence.length) {
        fence = undefined;
      }
      continue;
    }

    if (fenceMatch) {
      fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length };
      current.push(line);
      continue;
    }

    if (trimmed === '---') {
      if (chunks.length === 0 && current.every((value) => value.trim().length === 0)) {
        startedWithSeparator = true;
      }

      chunks.push(current.join('\n'));
      current.length = 0;
      continue;
    }

    current.push(line);
  }

  chunks.push(current.join('\n'));

  if (startedWithSeparator && chunks.length > 0) {
    chunks.shift();
  }

  return { chunks, startedWithSeparator };
}

function isFrontMatterRecord(value: unknown): value is PresentationMetadata {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0;
}

function trimOuterBlankLines(value: string): string {
  return value.replace(/^\s*\n/u, '').replace(/\n\s*$/u, '');
}

const SPEAKER_NOTES_PATTERN = /^\s*(notes|speaker\s+notes)\s*:\s*([\s\S]*)$/iu;
function extractSpeakerNotes(source: string): { body: string; notes: string[] } {
  const notes: string[] = [];
  const bodyParts: string[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const commentStart = source.indexOf(HTML_COMMENT_START, cursor);
    if (commentStart < 0) {
      bodyParts.push(source.slice(cursor));
      break;
    }

    bodyParts.push(source.slice(cursor, commentStart));

    const commentEnd = findHtmlCommentEnd(source, commentStart + HTML_COMMENT_START.length);
    if (commentEnd < 0) {
      bodyParts.push(source.slice(commentStart));
      break;
    }

    const rawContent = source.slice(commentStart + HTML_COMMENT_START.length, commentEnd - HTML_COMMENT_END.length);
    const content = trimOuterBlankLines(rawContent);
    if (content) {
      const match = content.match(SPEAKER_NOTES_PATTERN);
      if (match) {
        notes.push(match[2].trim());
      }
    }

    cursor = commentEnd;
  }

  return {
    body: bodyParts.join(''),
    notes,
  };
}

function findHtmlCommentEnd(source: string, fromIndex: number): number {
  let index = fromIndex;
  let inlineCodeFenceLength = 0;

  while (index < source.length - 2) {
    const current = source[index];

    if (current === '`') {
      const runLength = countRepeatedCharacters(source, index, '`');
      if (inlineCodeFenceLength === 0) {
        inlineCodeFenceLength = runLength;
      } else if (runLength === inlineCodeFenceLength) {
        inlineCodeFenceLength = 0;
      }

      index += runLength;
      continue;
    }

    if (inlineCodeFenceLength === 0 && source[index] === '-' && source[index + 1] === '-' && source[index + 2] === '>') {
      return index + HTML_COMMENT_END.length;
    }

    index += 1;
  }

  return -1;
}

function countRepeatedCharacters(source: string, fromIndex: number, character: string): number {
  let index = fromIndex;

  while (index < source.length && source[index] === character) {
    index += 1;
  }

  return index - fromIndex;
}

function isDirectiveComment(content: string): boolean {
  const normalized = trimOuterBlankLines(content);
  if (!normalized) {
    return false;
  }

  if (/^slide\s*:/iu.test(normalized) || /^notes\s*$/iu.test(normalized)) {
    return true;
  }

  const lines = normalized
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.length > 0 && lines.every((line) => /^[_$a-z][\w-]*\s*:/iu.test(line));
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/u, '');
}

function normalizeDocumentKind(value: unknown): MarkdownDocumentKind {
  return typeof value === 'string' && value.trim().toLowerCase() === 'presentation'
    ? 'presentation'
    : 'text';
}

function isCoverSlide(slide: MarkdownPresentationSlide | undefined): boolean {
  return slide?.template.trim().toLowerCase() === 'cover';
}

function createGeneratedCoverSlide(title: string, subtitle?: string, author?: string): MarkdownPresentationSlide {
  const blocks = [`# ${title}`];
  if (subtitle) {
    blocks.push(subtitle);
  }
  if (author) {
    blocks.push(author);
  }

  return {
    template: 'cover',
    body: blocks.join('\n\n'),
  };
}

function extractCoverSlideMetadata(body: string): CoverSlideMetadata {
  const title = extractFirstL1Heading(body);
  const remainingBody = removeLeadingHeadingBlock(body);
  const subtitle = extractFirstMeaningfulMarkdownBlock(remainingBody);

  return {
    title,
    subtitle,
  };
}

function extractFirstPresentationTitle(slides: MarkdownPresentationSlide[]): string | undefined {
  for (const slide of slides) {
    const title = extractFirstL1Heading(slide.body);
    if (title) {
      return title;
    }
  }

  return undefined;
}

function removeLeadingHeadingBlock(body: string): string {
  const lines = body.split(/\r?\n/u);
  const remaining: string[] = [];
  let removedHeading = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!removedHeading) {
      if (/^#\s+/u.test(trimmed)) {
        removedHeading = true;
      }
      continue;
    }

    remaining.push(line);
  }

  return trimOuterBlankLines(remaining.join('\n'));
}

function extractFirstMeaningfulMarkdownBlock(body: string): string | undefined {
  const blocks = trimOuterBlankLines(body)
    .split(/\n\s*\n/u)
    .map((block) => normalizeMarkdownBlockText(block))
    .filter((block) => block.length > 0);

  return blocks[0];
}

function normalizeMarkdownBlockText(block: string): string {
  const trimmedBlock = trimOuterBlankLines(block);
  if (!trimmedBlock || /^(`{3,}|~{3,})/u.test(trimmedBlock)) {
    return '';
  }

  const normalizedLines = trimmedBlock
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(stripMarkdownLinePrefix)
    .join(' ');

  return normalizeWhitespaceLikeText(stripMarkdownInlineFormatting(normalizedLines));
}

function stripMarkdownLinePrefix(line: string): string {
  return line
    .replace(/^>+\s*/u, '')
    .replace(/^[-*+]\s+/u, '')
    .replace(/^\d+[.)]\s+/u, '');
}

function stripMarkdownInlineFormatting(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/[*_~]+/gu, '');
}

function normalizeWhitespaceLikeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
