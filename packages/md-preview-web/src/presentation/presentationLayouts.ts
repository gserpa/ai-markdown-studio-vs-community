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
export type PresentationHeadingSlots = {
  label?: 'above-title' | 'footer' | 'none';
  subtitle?: 'below-title' | 'none';
};
export type PresentationLayoutOverride = { variant?: PresentationLayoutName; slots?: PresentationHeadingSlots; regions?: 'balanced' | 'primary-wide' };
export type PresentationLayoutMap = Partial<Record<PresentationSlideType, PresentationLayoutName | PresentationLayoutOverride>>;

export const DEFAULT_PRESENTATION_LAYOUTS = Object.fromEntries(
  Object.entries(PRESENTATION_LAYOUT_CHOICES).map(([type, choices]) => [type, choices[0]]),
) as Record<PresentationSlideType, PresentationLayoutName>;

// These built-in layouts share the standard header/body structure. No theme identity belongs here.
const HEADING_LAYOUTS = new Set<PresentationLayoutName>([
  'header-body', 'balanced-columns', 'weighted-columns', 'media-right', 'media-left', 'media-top', 'large-media',
]);

export function effectivePresentationLayout(value: PresentationLayoutName | PresentationLayoutOverride): {
  variant: PresentationLayoutName; slots: PresentationHeadingSlots; regions?: 'balanced' | 'primary-wide';
} {
  return typeof value === 'string'
    ? { variant: value, slots: {} }
    : { variant: value.variant ?? 'header-body', slots: value.slots ?? {}, ...(value.regions ? { regions: value.regions } : {}) };
}

export function normalizePresentationLayouts(value: unknown, theme: string): { layouts: PresentationLayoutMap; warnings: string[] } {
  const layouts: PresentationLayoutMap = {};
  const warnings: string[] = [];
  if (value === undefined) return { layouts, warnings };
  if (!isRecord(value)) return { layouts, warnings: ['Presentation theme "' + theme + '" layouts must be an object.'] };
  for (const [name, layout] of Object.entries(value)) {
    const type = name.trim().toLowerCase() as PresentationSlideType;
    const choices: readonly string[] | undefined = Object.hasOwn(PRESENTATION_LAYOUT_CHOICES, type) ? PRESENTATION_LAYOUT_CHOICES[type] : undefined;
    const invalid = () => warnings.push('Presentation theme "' + theme + '" has an unsupported layout for "' + name + '". Use ' + (choices?.join(', ') ?? 'a canonical slide content type') + ' with supported heading slots.');
    if (!choices) { invalid(); continue; }
    if (typeof layout === 'string' && choices.includes(layout)) {
      layouts[type] = layout as PresentationLayoutName;
      continue;
    }
    if (!isRecord(layout) || Object.keys(layout).some(key => key !== 'variant' && key !== 'slots' && key !== 'regions')
      || (Object.hasOwn(layout, 'variant') && (typeof layout.variant !== 'string' || !choices.includes(layout.variant)))
      || (Object.hasOwn(layout, 'slots') && !validSlots(layout.slots))
      || (Object.hasOwn(layout, 'regions') && (type !== 'content' || !['balanced', 'primary-wide'].includes(layout.regions as string)))) {
      invalid();
      continue;
    }
    if (typeof layout.variant === 'string' && !HEADING_LAYOUTS.has(layout.variant as PresentationLayoutName)
      && isRecord(layout.slots) && Object.values(layout.slots).some(placement => placement !== 'none')) {
      invalid();
      continue;
    }
    layouts[type] = {
      ...(typeof layout.variant === 'string' ? { variant: layout.variant as PresentationLayoutName } : {}),
      ...(isRecord(layout.slots) ? { slots: { ...layout.slots } as PresentationHeadingSlots } : {}),
      ...(layout.regions === 'balanced' || layout.regions === 'primary-wide' ? { regions: layout.regions } : {}),
    };
  }
  return { layouts, warnings };
}

/** A bad local entry leaves the complete inherited/default entry in place. */
export function resolvePresentationLayouts(base: PresentationLayoutMap | undefined, local: PresentationLayoutMap | undefined, theme: string): {
  layouts: PresentationLayoutMap; warnings: string[];
} {
  const layouts: PresentationLayoutMap = { ...DEFAULT_PRESENTATION_LAYOUTS, ...base };
  const warnings: string[] = [];
  for (const [key, value] of Object.entries(local ?? {})) {
    const type = key as PresentationSlideType;
    if (typeof value === 'string') { layouts[type] = value; continue; }
    if (!value) continue;
    const previous = effectivePresentationLayout(layouts[type] ?? DEFAULT_PRESENTATION_LAYOUTS[type]);
    const variant = value.variant ?? previous.variant;
    const slots = { ...(variant === previous.variant ? previous.slots : {}), ...value.slots };
    const regions = value.regions ?? (variant === previous.variant ? previous.regions : undefined);
    if (regions && variant !== 'header-body') {
      warnings.push('Presentation theme "' + theme + '" requests content areas unsupported by "' + variant + '". The inherited/default layout is retained.');
      continue;
    }
    if (!HEADING_LAYOUTS.has(variant) && Object.values(slots).some(placement => placement !== 'none')) {
      warnings.push('Presentation theme "' + theme + '" requests heading slots unsupported by "' + variant + '". The inherited/default layout is retained.');
      continue;
    }
    layouts[type] = { variant, slots, ...(regions ? { regions } : {}) };
  }
  return { layouts, warnings };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validSlots(value: unknown): boolean {
  return isRecord(value) && Object.entries(value).every(([key, placement]) =>
    key === 'label' ? ['above-title', 'footer', 'none'].includes(placement as string)
      : key === 'subtitle' && ['below-title', 'none'].includes(placement as string));
}
