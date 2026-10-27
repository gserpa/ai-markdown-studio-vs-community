import type { PresentationSlideType } from '@mfo/core';

/** These values belong to preview themes; they are never Markdown slide directives. */
export const PRESENTATION_LAYOUT_CHOICES = {
  content: ['header-body', 'accent-side', 'accent-side-right'],
  cover: ['cover'],
  'two-column': ['balanced-columns', 'weighted-columns'],
  'illustrated-text': ['media-right', 'media-left', 'media-top', 'accent-side-image'],
  'featured-visual': ['large-media', 'media-top', 'accent-side-image'],
  brief: ['accent-side', 'accent-side-right', 'header-body'],
  divider: ['solid-divider', 'photo-divider', 'split-divider'],
  thanks: ['thanks'],
} as const;

export type PresentationLayoutName = typeof PRESENTATION_LAYOUT_CHOICES[PresentationSlideType][number];
export type PresentationLayoutMap = Partial<Record<PresentationSlideType, PresentationLayoutName>>;

export const DEFAULT_PRESENTATION_LAYOUTS = Object.fromEntries(
  Object.entries(PRESENTATION_LAYOUT_CHOICES).map(([type, choices]) => [type, choices[0]]),
) as Record<PresentationSlideType, PresentationLayoutName>;

export function normalizePresentationLayouts(value: unknown, theme: string): { layouts: PresentationLayoutMap; warnings: string[] } {
  const layouts: PresentationLayoutMap = {};
  const warnings: string[] = [];
  if (value === undefined) return { layouts, warnings };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { layouts, warnings: [`Presentation theme "${theme}" layouts must be an object.`] };
  }
  for (const [name, layout] of Object.entries(value)) {
    const type = name.trim().toLowerCase() as PresentationSlideType;
    const choices: readonly string[] | undefined = PRESENTATION_LAYOUT_CHOICES[type];
    if (!choices || typeof layout !== 'string' || !choices.includes(layout)) {
      warnings.push(`Presentation theme "${theme}" has an unsupported layout for "${name}". Use ${choices?.join(', ') ?? 'a canonical slide content type'}.`);
      continue;
    }
    layouts[type] = layout as PresentationLayoutName;
  }
  return { layouts, warnings };
}
