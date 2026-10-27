/** Authoring names describe content; preview themes and PPTX templates choose placement. */
export const PRESENTATION_SLIDE_TYPES = [
  'content', 'cover', 'two-column', 'illustrated-text', 'featured-visual', 'brief', 'divider', 'thanks',
] as const;

export type PresentationSlideType = typeof PRESENTATION_SLIDE_TYPES[number];

export const LEGACY_SLIDE_TYPE_REPLACEMENTS: Readonly<Record<string, readonly PresentationSlideType[]>> = {
  default: ['content'],
  'two-columns': ['two-column'],
  'image-right': ['illustrated-text'],
  'image-center': ['featured-visual'],
  table: ['content'],
  'table-legend': ['two-column', 'content'],
  'side-banner': ['illustrated-text', 'featured-visual'],
  'side-picture': ['featured-visual', 'illustrated-text'],
  'default-side': ['brief', 'content'],
  'section-divider': ['divider'],
  'divider-b': ['divider'],
  'divider-c': ['divider'],
};

/** Temporary data migration only: every renderer receives current types. */
export function normalizePresentationSlideType(name: string): string {
  const normalized = name.trim().toLowerCase() || 'content';
  return LEGACY_SLIDE_TYPE_REPLACEMENTS[normalized]?.[0] ?? normalized;
}

export type SlideTypeMigration = {
  start: number;
  end: number;
  slide: number;
  legacyType: string;
  replacements: readonly PresentationSlideType[];
};

/** An explicit boundary allows column bodies without visible H2 headings. */
export function splitPresentationColumns(markdown: string): [string, string] | undefined {
  const lines = markdown.split(/\r?\n/u);
  let fence: { marker: string; length: number } | undefined;
  let boundary = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    const match = trimmed.match(/^(`{3,}|~{3,})/u);
    if (fence) {
      if (match && match[1][0] === fence.marker && match[1].length >= fence.length) fence = undefined;
    } else if (match) {
      fence = { marker: match[1][0], length: match[1].length };
    } else if (/^<!--\s*column-break\s*-->$/iu.test(trimmed)) {
      if (boundary >= 0) throw new Error('A two-column slide supports exactly one column-break marker.');
      boundary = index;
    }
  }
  return boundary < 0 ? undefined : [lines.slice(0, boundary).join('\n'), lines.slice(boundary + 1).join('\n')];
}
