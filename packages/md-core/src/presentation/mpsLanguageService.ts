import { createMpsDocumentSchema, type MpsDirectiveSchema, type MpsDocumentSchema, type MpsFrontMatterFieldSchema } from './mpsSchema';

export type MpsValidationSeverity = 'error' | 'warning' | 'information';

export type MpsIssueCode =
  | 'unclosed-front-matter'
  | 'missing-document-kind'
  | 'noncanonical-frontmatter-key'
  | 'duplicate-frontmatter-key'
  | 'invalid-frontmatter-enum'
  | 'empty-frontmatter-value'
  | 'unknown-theme'
  | 'misplaced-slide-directive'
  | 'missing-slide-template'
  | 'unknown-slide-template';

export type MpsValidationIssue = {
  start: number;
  end: number;
  severity: MpsValidationSeverity;
  message: string;
  code?: MpsIssueCode;
  data?: Record<string, string | number | boolean>;
};

export type MpsCompletionKind = 'snippet' | 'property' | 'value' | 'directive';

export type MpsCompletionEntry = {
  label: string;
  kind: MpsCompletionKind;
  detail: string;
  documentation?: string;
  insertText: string;
  isSnippet?: boolean;
  replaceStart: number;
  replaceEnd: number;
};

export type MpsHoverEntry = {
  start: number;
  end: number;
  markdown: string;
};

export type MpsQuickFix = {
  title: string;
  start: number;
  end: number;
  newText: string;
};

type SourceLine = {
  index: number;
  text: string;
  start: number;
  end: number;
};

type FrontMatterEntry = {
  key: string;
  normalizedKey: string;
  value: string;
  valueNormalized: string;
  line: SourceLine;
  keyStart: number;
  keyEnd: number;
  valueStart: number;
  valueEnd: number;
};

type FrontMatterBlock = {
  exists: boolean;
  closed: boolean;
  startLine: number;
  endLine: number;
  openingLine?: SourceLine;
  closingLine?: SourceLine;
  entries: FrontMatterEntry[];
};

type MpsDocumentContext = {
  lines: SourceLine[];
  frontMatter: FrontMatterBlock;
  documentEntry?: FrontMatterEntry;
  isPresentation: boolean;
};

type DirectiveReference = {
  schema: MpsDirectiveSchema;
  start: number;
  end: number;
};

export function validateMpsSource(source: string, schema: MpsDocumentSchema = createMpsDocumentSchema()): MpsValidationIssue[] {
  const context = analyzeMpsSource(source);
  if (context.lines.length === 0) {
    return [];
  }

  const issues: MpsValidationIssue[] = [];
  const slideDirectiveCandidates = findSlideDirectiveCandidates(context.lines, context.frontMatter);
  const looksLikePresentation = slideDirectiveCandidates.length > 0 || context.isPresentation;

  if (context.frontMatter.exists && !context.frontMatter.closed) {
    issues.push(createIssue(
      context.frontMatter.openingLine?.start ?? 0,
      context.frontMatter.openingLine?.end ?? 3,
      'error',
      'Front matter must be closed with a second --- line.',
      'unclosed-front-matter',
    ));
    return issues;
  }

  if (looksLikePresentation && !context.isPresentation) {
    const target = context.documentEntry
      ? { start: context.documentEntry.valueStart, end: context.documentEntry.valueEnd || context.documentEntry.keyEnd }
      : context.frontMatter.openingLine
        ? { start: context.frontMatter.openingLine.start, end: context.frontMatter.openingLine.end }
        : slideDirectiveCandidates[0]
          ? { start: slideDirectiveCandidates[0].start, end: slideDirectiveCandidates[0].end }
          : { start: 0, end: Math.min(source.length, 3) };

    issues.push(createIssue(
      target.start,
      target.end,
      'warning',
      'Presentation files should declare document: presentation in top-level front matter so preview, export, and editor support activate consistently.',
      'missing-document-kind',
    ));
  }

  const seenKeys = new Map<string, FrontMatterEntry>();
  for (const entry of context.frontMatter.entries) {
    const field = schema.frontMatterFieldMap.get(entry.normalizedKey);
    if (!field) {
      continue;
    }

    if (entry.key !== field.name) {
      issues.push(createIssue(
        entry.keyStart,
        entry.keyEnd,
        'warning',
        `Use the canonical front matter key ${field.name}.`,
        'noncanonical-frontmatter-key',
        { canonicalKey: field.name },
      ));
    }

    const previous = seenKeys.get(entry.normalizedKey);
    if (previous) {
      issues.push(createIssue(
        entry.keyStart,
        entry.keyEnd,
        'warning',
        `Duplicate front matter key ${field.name}. Later values override earlier ones.`,
        'duplicate-frontmatter-key',
      ));
    } else {
      seenKeys.set(entry.normalizedKey, entry);
    }

    issues.push(...validateFrontMatterEntry(entry, field, schema));
  }

  issues.push(...validateSlideDirectives(context.lines, context.frontMatter, schema));
  return issues;
}

export function getMpsCompletions(source: string, offset: number, schema: MpsDocumentSchema = createMpsDocumentSchema()): MpsCompletionEntry[] {
  const context = analyzeMpsSource(source);
  const line = getLineAtOffset(context.lines, offset);
  if (!line) {
    return [];
  }

  const completions: MpsCompletionEntry[] = [];
  const prefix = line.text.slice(0, Math.max(0, offset - line.start));
  const withinFrontMatter = isWithinFrontMatter(context.frontMatter, line.index);

  if (shouldOfferFrontMatterSnippet(source, line, prefix, context.frontMatter)) {
    completions.push({
      label: 'MPS presentation header',
      kind: 'snippet',
      detail: 'Insert a complete Markdown Presentation Specification header and first slide.',
      documentation: 'Adds top-level front matter with the required document: presentation marker.',
      insertText: schema.frontMatterSnippet,
      isSnippet: true,
      replaceStart: line.start,
      replaceEnd: line.end,
    });
  }

  if (withinFrontMatter) {
    completions.push(...getFrontMatterCompletions(line, prefix, schema));
  }

  if (context.isPresentation) {
    completions.push(...getDirectiveCompletions(line, prefix, schema));
  }

  return dedupeCompletions(completions);
}

export function getMpsHover(source: string, offset: number, schema: MpsDocumentSchema = createMpsDocumentSchema()): MpsHoverEntry | undefined {
  const context = analyzeMpsSource(source);
  const frontMatterHover = getFrontMatterHover(context, offset, schema);
  if (frontMatterHover) {
    return frontMatterHover;
  }

  return getDirectiveHover(context, offset, schema);
}

export function getMpsQuickFixes(
  source: string,
  issue: MpsValidationIssue,
  schema: MpsDocumentSchema = createMpsDocumentSchema(),
): MpsQuickFix[] {
  const context = analyzeMpsSource(source);

  switch (issue.code) {
    case 'missing-document-kind': {
      if (context.documentEntry) {
        return [{
          title: 'Set document kind to presentation',
          start: context.documentEntry.valueStart,
          end: context.documentEntry.valueEnd,
          newText: 'presentation',
        }];
      }

      if (context.frontMatter.openingLine) {
        return [{
          title: 'Insert document: presentation',
          start: context.frontMatter.openingLine.end,
          end: context.frontMatter.openingLine.end,
          newText: '\ndocument: presentation',
        }];
      }

      return [{
        title: 'Insert presentation front matter',
        start: 0,
        end: 0,
        newText: '---\ndocument: presentation\n---\n\n',
      }];
    }
    case 'noncanonical-frontmatter-key': {
      const canonicalKey = typeof issue.data?.canonicalKey === 'string' ? issue.data.canonicalKey : undefined;
      return canonicalKey
        ? [{
          title: `Rename key to ${canonicalKey}`,
          start: issue.start,
          end: issue.end,
          newText: canonicalKey,
        }]
        : [];
    }
    case 'invalid-frontmatter-enum': {
      const allowedValues = typeof issue.data?.allowedValues === 'string'
        ? issue.data.allowedValues.split('|').filter((value) => value.length > 0)
        : [];

      return allowedValues.map((value) => ({
        title: `Set value to ${value}`,
        start: issue.start,
        end: issue.end,
        newText: value,
      }));
    }
    case 'empty-frontmatter-value': {
      const fieldName = typeof issue.data?.fieldName === 'string' ? issue.data.fieldName : undefined;
      if (fieldName === 'document') {
        return [{
          title: 'Set document kind to presentation',
          start: issue.start,
          end: issue.end,
          newText: 'presentation',
        }];
      }

      return [];
    }
    default:
      return [];
  }
}

function validateFrontMatterEntry(
  entry: FrontMatterEntry,
  field: MpsFrontMatterFieldSchema,
  schema: MpsDocumentSchema,
): MpsValidationIssue[] {
  const issues: MpsValidationIssue[] = [];
  const valueStart = entry.valueStart || entry.keyEnd;
  const valueEnd = entry.valueEnd || entry.keyEnd;

  if ((field.kind === 'string' || field.kind === 'path') && entry.valueNormalized.length === 0) {
    issues.push(createIssue(
      valueStart,
      valueEnd,
      'warning',
      `${field.name} should not be empty.`,
      'empty-frontmatter-value',
      { fieldName: field.name },
    ));
    return issues;
  }

  if (field.allowedValues && entry.valueNormalized.length > 0 && !field.allowedValues.includes(entry.valueNormalized)) {
    issues.push(createIssue(
      valueStart,
      valueEnd,
      'error',
      `${field.name} must be one of: ${field.allowedValues.join(', ')}.`,
      'invalid-frontmatter-enum',
      { fieldName: field.name, allowedValues: field.allowedValues.join('|') },
    ));
    return issues;
  }

  if (field.name === 'theme' && entry.valueNormalized.length > 0 && !schema.knownThemeNames.includes(entry.valueNormalized)) {
    issues.push(createIssue(
      valueStart,
      valueEnd,
      'warning',
      `Unknown theme ${entry.value}. Built-in suggestions are ${schema.knownThemeNames.join(', ')}.`,
      'unknown-theme',
    ));
  }

  return issues;
}

function validateSlideDirectives(lines: SourceLine[], frontMatter: FrontMatterBlock, schema: MpsDocumentSchema): MpsValidationIssue[] {
  const issues: MpsValidationIssue[] = [];
  const startLineIndex = frontMatter.closed ? frontMatter.endLine + 1 : 0;
  let inFence: { marker: string; length: number } | undefined;
  let slideHasContent = false;
  let slideDirectiveSeen = false;

  for (const line of lines.slice(startLineIndex)) {
    const trimmed = line.text.trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/u);

    if (inFence) {
      if (fenceMatch && fenceMatch[1][0] === inFence.marker && fenceMatch[1].length >= inFence.length) {
        inFence = undefined;
      }
      continue;
    }

    if (fenceMatch) {
      inFence = { marker: fenceMatch[1][0], length: fenceMatch[1].length };
      slideHasContent = true;
      continue;
    }

    if (trimmed === '---') {
      slideHasContent = false;
      slideDirectiveSeen = false;
      continue;
    }

    const directiveMatch = findSlideDirectiveMatch(line.text);
    if (directiveMatch) {
      const templateName = directiveMatch[1].trim();
      const templateOffset = directiveMatch.index ?? 0;
      const valueStart = line.start + templateOffset + directiveMatch[0].indexOf(directiveMatch[1]);
      const valueEnd = valueStart + directiveMatch[1].length;

      if (slideDirectiveSeen || slideHasContent) {
        issues.push(createIssue(
          line.start,
          line.end,
          'error',
          'Slide directives must appear only once and at the start of a slide.',
          'misplaced-slide-directive',
        ));
      }

      if (!templateName) {
        issues.push(createIssue(
          valueStart,
          Math.max(valueStart + 1, valueEnd),
          'error',
          'Slide directives require a template name.',
          'missing-slide-template',
        ));
      } else if (!schema.builtInTemplateNames.includes(templateName.toLowerCase())) {
        issues.push(createIssue(
          valueStart,
          valueEnd,
          'warning',
          `Template ${templateName} is not a built-in layout. This is valid only when your export flow maps it through a PPTX template manifest.`,
          'unknown-slide-template',
        ));
      }

      slideDirectiveSeen = true;
      continue;
    }

    if (trimmed.length > 0) {
      slideHasContent = true;
    }
  }

  return issues;
}

function getFrontMatterCompletions(line: SourceLine, prefix: string, schema: MpsDocumentSchema): MpsCompletionEntry[] {
  const completions: MpsCompletionEntry[] = [];
  const trimmedPrefix = prefix.trimStart();
  const leadingWhitespace = prefix.length - trimmedPrefix.length;
  const colonIndex = prefix.indexOf(':');

  if (colonIndex < 0) {
    const partialKey = trimmedPrefix.toLowerCase();
    const replaceStart = line.start + leadingWhitespace;
    const replaceEnd = line.start + prefix.length;

    for (const field of schema.frontMatterFields) {
      if (partialKey && !field.name.toLowerCase().startsWith(partialKey)) {
        continue;
      }

      completions.push({
        label: field.name,
        kind: 'property',
        detail: 'Front matter key',
        documentation: field.description,
        insertText: `${field.name}: `,
        replaceStart,
        replaceEnd,
      });
    }

    return completions;
  }

  const rawKey = prefix.slice(0, colonIndex).trim();
  const field = schema.frontMatterFieldMap.get(rawKey.toLowerCase());
  if (!field) {
    return completions;
  }

  const rawValuePrefix = prefix.slice(colonIndex + 1);
  const valueIndent = rawValuePrefix.match(/^\s*/u)?.[0].length ?? 0;
  const valuePrefix = rawValuePrefix.slice(valueIndent).toLowerCase();
  const replaceStart = line.start + colonIndex + 1 + valueIndent;
  const replaceEnd = line.start + prefix.length;
  const suggestions = field.allowedValues ?? field.suggestions ?? [];

  for (const value of suggestions) {
    if (valuePrefix && !value.startsWith(valuePrefix)) {
      continue;
    }

    completions.push({
      label: value,
      kind: 'value',
      detail: `${field.name} value`,
      documentation: field.description,
      insertText: value,
      replaceStart,
      replaceEnd,
    });
  }

  return completions;
}

function getDirectiveCompletions(line: SourceLine, prefix: string, schema: MpsDocumentSchema): MpsCompletionEntry[] {
  const completions: MpsCompletionEntry[] = [];
  if (isOffsetInsideInlineCode(line.text, prefix.length)) {
    return completions;
  }

  const suffix = line.text.slice(prefix.length);
  const slideDirectiveMatch = prefix.match(/<!--\s*slide\s*:\s*([\w-]*)$/iu);
  if (slideDirectiveMatch) {
    const partialTemplate = slideDirectiveMatch[1].toLowerCase();
    const replaceStart = line.start + prefix.length - slideDirectiveMatch[1].length;
    const replaceEnd = line.start + prefix.length;
    const insertSuffix = suffix.trimStart().startsWith('-->') ? '' : '-->';

    for (const templateName of schema.builtInTemplateNames) {
      if (partialTemplate && !templateName.startsWith(partialTemplate)) {
        continue;
      }

      completions.push({
        label: templateName,
        kind: 'value',
        detail: 'Built-in slide template',
        documentation: 'Assigns a built-in layout to the current slide.',
        insertText: `${templateName}${insertSuffix}`,
        replaceStart,
        replaceEnd,
      });
    }

    return completions;
  }

  if (!/^\s*<!--?\s*[\w\s:-]*$/u.test(prefix)) {
    return completions;
  }

  const replaceStart = line.start;
  const replaceEnd = line.start + prefix.length;

  completions.push(
    {
      label: '<!--slide: ...-->',
      kind: 'directive',
      detail: 'Insert a slide template directive.',
      documentation: 'Must appear at the start of a slide. Built-in layouts resolve automatically, and custom names can resolve through PPTX template markers or manifest aliases/overrides.',
      insertText: '<!--slide: ${1|default,cover,divider,section-divider,two-columns,image-right|}-->',
      isSnippet: true,
      replaceStart,
      replaceEnd,
    },
    {
      label: '<!--notes: ...-->',
      kind: 'directive',
      detail: 'Insert speaker notes.',
      documentation: 'Speaker notes are stripped from visible slide content and exported as notes.',
      insertText: '<!--notes: ${1:Speaker note}-->',
      isSnippet: true,
      replaceStart,
      replaceEnd,
    },
    {
      label: '<!--speaker notes: ...-->',
      kind: 'directive',
      detail: 'Insert speaker notes.',
      documentation: 'Equivalent to <!--notes: ...--> and supported case-insensitively by the parser.',
      insertText: '<!--speaker notes: ${1:Speaker note}-->',
      isSnippet: true,
      replaceStart,
      replaceEnd,
    },
  );

  return completions;
}

function getFrontMatterHover(context: MpsDocumentContext, offset: number, schema: MpsDocumentSchema): MpsHoverEntry | undefined {
  for (const entry of context.frontMatter.entries) {
    if (offset < entry.keyStart || offset > entry.keyEnd) {
      continue;
    }

    const field = schema.frontMatterFieldMap.get(entry.normalizedKey);
    if (!field) {
      return undefined;
    }

    const lines = [`**${field.name}**`, '', field.description];
    const values = field.allowedValues ?? field.suggestions;
    if (values && values.length > 0) {
      lines.push('', `Suggested values: ${values.join(', ')}`);
    }

    return {
      start: entry.keyStart,
      end: entry.keyEnd,
      markdown: lines.join('\n'),
    };
  }

  return undefined;
}

function getDirectiveHover(context: MpsDocumentContext, offset: number, schema: MpsDocumentSchema): MpsHoverEntry | undefined {
  const line = getLineAtOffset(context.lines, offset);
  if (!line) {
    return undefined;
  }

  const reference = findDirectiveReference(line, offset, schema);
  if (!reference) {
    return undefined;
  }

  const lines = [`**${reference.schema.name}**`, '', reference.schema.description];
  if (reference.schema.name === 'slide') {
    lines.push('', `Built-in templates: ${schema.builtInTemplateNames.join(', ')}`);
    lines.push('Custom template names can resolve through PPTX `template: ...` markers or sparse manifest aliases/overrides.');
  }

  return {
    start: reference.start,
    end: reference.end,
    markdown: lines.join('\n'),
  };
}

function findDirectiveReference(line: SourceLine, offset: number, schema: MpsDocumentSchema): DirectiveReference | undefined {
  if (isOffsetInsideInlineCode(line.text, Math.max(0, offset - line.start))) {
    return undefined;
  }

  for (const directive of schema.directives) {
    const directivePattern = directive.name === 'speaker notes'
      ? /<!--\s*(speaker\s+notes)\s*:/iu
      : directive.name === 'notes'
        ? /<!--\s*(notes)\s*:/iu
        : /<!--\s*(slide)\s*:/iu;
    const match = line.text.match(directivePattern);
    if (!match) {
      continue;
    }

    const name = match[1];
    const nameStartInLine = line.text.indexOf(name, match.index ?? 0);
    const start = line.start + nameStartInLine;
    const end = start + name.length;
    if (offset >= start && offset <= end) {
      return { schema: directive, start, end };
    }
  }

  return undefined;
}

function shouldOfferFrontMatterSnippet(source: string, line: SourceLine, prefix: string, frontMatter: FrontMatterBlock): boolean {
  if (frontMatter.exists) {
    return false;
  }

  if (line.index !== 0) {
    return false;
  }

  if (source.trim().length === 0) {
    return true;
  }

  return prefix.trim().length === 0 && line.text.trim().length === 0;
}

function isWithinFrontMatter(frontMatter: FrontMatterBlock, lineIndex: number): boolean {
  if (!frontMatter.exists) {
    return false;
  }

  const endLine = frontMatter.closed ? frontMatter.endLine : Number.MAX_SAFE_INTEGER;
  return lineIndex > frontMatter.startLine && lineIndex < endLine;
}

function analyzeMpsSource(source: string): MpsDocumentContext {
  const lines = createSourceLines(source);
  const frontMatter = parseFrontMatter(lines);
  const documentEntry = frontMatter.entries.find((entry) => entry.normalizedKey === 'document');

  return {
    lines,
    frontMatter,
    documentEntry,
    isPresentation: documentEntry?.valueNormalized === 'presentation',
  };
}

function parseFrontMatter(lines: SourceLine[]): FrontMatterBlock {
  const firstLine = lines[0];
  if (!firstLine || firstLine.text.trim() !== '---') {
    return {
      exists: false,
      closed: false,
      startLine: -1,
      endLine: -1,
      entries: [],
    };
  }

  const entries: FrontMatterEntry[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.text.trim() === '---') {
      return {
        exists: true,
        closed: true,
        startLine: 0,
        endLine: index,
        openingLine: firstLine,
        closingLine: line,
        entries,
      };
    }

    const fieldMatch = line.text.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/u);
    if (!fieldMatch) {
      continue;
    }

    const key = fieldMatch[1];
    const value = fieldMatch[2];
    const fieldStart = line.text.indexOf(key);
    const valueStartInLine = line.text.indexOf(value, fieldStart + key.length);
    entries.push({
      key,
      normalizedKey: key.toLowerCase(),
      value,
      valueNormalized: normalizeYamlScalar(value),
      line,
      keyStart: line.start + Math.max(0, fieldStart),
      keyEnd: line.start + Math.max(0, fieldStart) + key.length,
      valueStart: line.start + Math.max(0, valueStartInLine),
      valueEnd: line.start + Math.max(0, valueStartInLine) + value.length,
    });
  }

  return {
    exists: true,
    closed: false,
    startLine: 0,
    endLine: lines.length - 1,
    openingLine: firstLine,
    entries,
  };
}

function createSourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let lineStart = 0;
  let lineIndex = 0;

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '\n') {
      continue;
    }

    const textEnd = index > lineStart && source[index - 1] === '\r' ? index - 1 : index;
    lines.push({
      index: lineIndex,
      text: source.slice(lineStart, textEnd),
      start: lineStart,
      end: textEnd,
    });

    lineStart = index + 1;
    lineIndex += 1;
  }

  lines.push({
    index: lineIndex,
    text: source.slice(lineStart),
    start: lineStart,
    end: source.length,
  });

  return lines;
}

function getLineAtOffset(lines: SourceLine[], offset: number): SourceLine | undefined {
  const clampedOffset = Math.max(0, offset);
  return lines.find((line) => clampedOffset >= line.start && clampedOffset <= line.end)
    ?? lines.at(-1);
}

function findSlideDirectiveCandidates(lines: SourceLine[], frontMatter: FrontMatterBlock): SourceLine[] {
  const startLineIndex = frontMatter.closed ? frontMatter.endLine + 1 : 0;
  const candidates: SourceLine[] = [];
  let inFence: { marker: string; length: number } | undefined;

  for (const line of lines.slice(startLineIndex)) {
    const trimmed = line.text.trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/u);

    if (inFence) {
      if (fenceMatch && fenceMatch[1][0] === inFence.marker && fenceMatch[1].length >= inFence.length) {
        inFence = undefined;
      }
      continue;
    }

    if (fenceMatch) {
      inFence = { marker: fenceMatch[1][0], length: fenceMatch[1].length };
      continue;
    }

    if (findSlideDirectiveMatch(line.text)) {
      candidates.push(line);
    }
  }

  return candidates;
}

function findSlideDirectiveMatch(text: string): RegExpMatchArray | null {
  return maskInlineCode(text).match(/<!--\s*slide\s*:\s*([^>]*?)\s*-->/u);
}

function isOffsetInsideInlineCode(text: string, offset: number): boolean {
  const ranges = getInlineCodeRanges(text);
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

function maskInlineCode(text: string): string {
  if (!text.includes('`')) {
    return text;
  }

  const chars = [...text];
  for (const range of getInlineCodeRanges(text)) {
    for (let index = range.start; index < range.end; index += 1) {
      chars[index] = ' ';
    }
  }

  return chars.join('');
}

function getInlineCodeRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '`') {
      continue;
    }

    let fenceLength = 1;
    while (index + fenceLength < text.length && text[index + fenceLength] === '`') {
      fenceLength += 1;
    }

    const marker = '`'.repeat(fenceLength);
    const closingIndex = text.indexOf(marker, index + fenceLength);
    if (closingIndex < 0) {
      index += fenceLength - 1;
      continue;
    }

    ranges.push({ start: index, end: closingIndex + fenceLength });
    index = closingIndex + fenceLength - 1;
  }

  return ranges;
}

function normalizeYamlScalar(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim().toLowerCase();
  }

  return trimmed.toLowerCase();
}

function createIssue(
  start: number,
  end: number,
  severity: MpsValidationSeverity,
  message: string,
  code?: MpsIssueCode,
  data?: Record<string, string | number | boolean>,
): MpsValidationIssue {
  return {
    start,
    end: Math.max(start + 1, end),
    severity,
    message,
    code,
    data,
  };
}

function dedupeCompletions(completions: MpsCompletionEntry[]): MpsCompletionEntry[] {
  const seen = new Set<string>();
  const deduped: MpsCompletionEntry[] = [];

  for (const completion of completions) {
    const key = `${completion.kind}:${completion.label}:${completion.replaceStart}:${completion.replaceEnd}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(completion);
  }

  return deduped;
}