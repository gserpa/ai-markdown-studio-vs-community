export type MpsFieldKind = 'string' | 'enum' | 'path';

export type MpsFrontMatterFieldSchema = {
  name: string;
  kind: MpsFieldKind;
  description: string;
  allowedValues?: readonly string[];
  suggestions?: readonly string[];
};

export type MpsDirectiveSchema = {
  name: string;
  description: string;
};

export type MpsDocumentSchema = {
  frontMatterFields: readonly MpsFrontMatterFieldSchema[];
  frontMatterFieldMap: ReadonlyMap<string, MpsFrontMatterFieldSchema>;
  builtInTemplateNames: readonly string[];
  knownThemeNames: readonly string[];
  directives: readonly MpsDirectiveSchema[];
  frontMatterSnippet: string;
};

const BUILT_IN_TEMPLATE_NAMES = [
  'default',
  'cover',
  'divider',
  'section-divider',
  'divider-b',
  'divider-c',
  'two-columns',
  'image-right',
  'table',
  'thanks',
] as const;

const FRONT_MATTER_FIELDS: readonly Omit<MpsFrontMatterFieldSchema, 'suggestions'>[] = [
  {
    name: 'document',
    kind: 'enum',
    description: 'Marks the Markdown file as a slide deck handled by AI Markdown Studio.',
    allowedValues: ['presentation'],
  },
  {
    name: 'title',
    kind: 'string',
    description: 'Presentation title used for deck metadata and implicit cover generation.',
  },
  {
    name: 'subtitle',
    kind: 'string',
    description: 'Optional deck subtitle used by cover layouts and preview metadata.',
  },
  {
    name: 'author',
    kind: 'string',
    description: 'Optional author name rendered on generated cover slides.',
  },
  {
    name: 'theme',
    kind: 'enum',
    description: 'Presentation theme hint for preview rendering and generated PPTX output.',
  },
  {
    name: 'ratio',
    kind: 'enum',
    description: 'Target slide aspect ratio.',
    allowedValues: ['16:9', '4:3'],
  },
  {
    name: 'language',
    kind: 'string',
    description: 'Optional presentation language tag.',
  },
  {
    name: 'template',
    kind: 'path',
    description: 'Optional PPTX template path used for template-backed export. Custom slide template names can resolve directly when the PPTX exposes matching template markers.',
  },
  {
    name: 'templateManifest',
    kind: 'path',
    description: 'Optional sparse PPTX override manifest used for aliases, placeholder corrections, and explicit fallback policy. Base slide bindings can still be inferred from the PPTX template.',
  },
] as const;

const DIRECTIVES: readonly MpsDirectiveSchema[] = [
  {
    name: 'slide',
    description: 'Assigns a slide template to the current slide. Must appear exactly once as the first non-whitespace content after the slide separator and before any slide body content. Built-in layouts resolve automatically, and custom names can resolve through PPTX template markers or manifest aliases.',
  },
  {
    name: 'notes',
    description: 'Adds speaker notes that are removed from visible slide content.',
  },
  {
    name: 'speaker notes',
    description: 'Adds speaker notes that are removed from visible slide content.',
  },
] as const;

export function createMpsDocumentSchema(themeNames: Iterable<string> = []): MpsDocumentSchema {
  const normalizedThemeNames = uniqueNormalizedStrings(['auto', 'default', ...themeNames]);
  const frontMatterFields = FRONT_MATTER_FIELDS.map((field) => {
    if (field.name !== 'theme') {
      return { ...field };
    }

    return {
      ...field,
      suggestions: normalizedThemeNames,
    } satisfies MpsFrontMatterFieldSchema;
  });

  const frontMatterFieldMap = new Map(frontMatterFields.map((field) => [field.name.toLowerCase(), field]));

  return {
    frontMatterFields,
    frontMatterFieldMap,
    builtInTemplateNames: [...BUILT_IN_TEMPLATE_NAMES],
    knownThemeNames: normalizedThemeNames,
    directives: [...DIRECTIVES],
    frontMatterSnippet: [
      '---',
      'document: presentation',
      'title: ${1:Deck Title}',
      'subtitle: ${2:Optional subtitle}',
      'author: ${3:Author}',
      'theme: ${4:auto}',
      'ratio: ${5:16:9}',
      '---',
      '',
      '# ${6:Opening}',
      '',
      '${7:Start here}',
    ].join('\n'),
  };
}

const MARKDOWN_DOCUMENT_FRONT_MATTER_FIELD: Omit<MpsFrontMatterFieldSchema, 'suggestions'> = {
  name: 'theme',
  kind: 'enum',
  description: 'Document preview theme. Overrides the default theme from VS Code settings.',
};

/**
 * Creates a minimal front matter schema for plain Markdown document files.
 * Only the `theme` field is offered — no presentation-specific fields or directives.
 */
export function createMarkdownDocumentSchema(themeNames: Iterable<string> = []): MpsDocumentSchema {
  const normalizedThemeNames = uniqueNormalizedStrings(['auto', ...themeNames]);
  const themeField: MpsFrontMatterFieldSchema = {
    ...MARKDOWN_DOCUMENT_FRONT_MATTER_FIELD,
    suggestions: normalizedThemeNames,
  };

  const frontMatterFieldMap = new Map([[themeField.name, themeField]]);

  return {
    frontMatterFields: [themeField],
    frontMatterFieldMap,
    builtInTemplateNames: [],
    knownThemeNames: normalizedThemeNames,
    directives: [],
    frontMatterSnippet: ['---', 'theme: ${1:auto}', '---', '', '${2}'].join('\n'),
  };
}

function uniqueNormalizedStrings(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const normalizedValues: string[] = [];

  for (const value of values) {
    const normalized = normalizeToken(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    normalizedValues.push(normalized);
  }

  return normalizedValues.sort((left, right) => left.localeCompare(right));
}

function normalizeToken(value: string): string {
  return String(value ?? '').trim().toLowerCase();
}
