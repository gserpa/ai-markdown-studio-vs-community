import { sanitizeRenderedHtml, type PresentationHeadingRoles } from '@mfo/core';
import type { PresentationHeadingSlots } from './presentationLayouts';
import type { CreateDocument } from './presentationPreview';

/** The layout's supported slots decide visibility; unplaced optional fields never enter the body. */
export function placePresentationHeadingRoles(
  html: string,
  heading: PresentationHeadingRoles | undefined,
  slots: PresentationHeadingSlots,
  renderMarkdown: (source: string) => string,
  createDocument: CreateDocument,
): string {
  const labelPlacement = heading?.label && slots.label && slots.label !== 'none' ? slots.label : undefined;
  const subtitle = heading?.subtitle && slots.subtitle === 'below-title' ? heading.subtitle : undefined;
  if (!labelPlacement && !subtitle) return html;
  const doc = createDocument(html);
  const layout = doc.querySelector<HTMLElement>('.presentation-standard-layout');
  if (!layout) return html;
  let header = layout.querySelector<HTMLElement>(':scope > .presentation-standard-header');
  const role = (className: string, text: string) => {
    const element = doc.createElement('div');
    element.className = 'presentation-heading-role ' + className;
    element.innerHTML = sanitizeRenderedHtml(renderMarkdown(text));
    return element;
  };
  if (labelPlacement === 'above-title' || subtitle) {
    if (!header) {
      header = doc.createElement('header');
      header.className = 'presentation-standard-header';
      layout.prepend(header);
    }
    if (labelPlacement === 'above-title') header.prepend(role('presentation-slide-label', heading!.label!));
    if (subtitle) header.append(role('presentation-slide-subtitle', subtitle));
  }
  if (labelPlacement === 'footer') {
    const footer = doc.createElement('footer');
    footer.className = 'presentation-standard-footer';
    footer.append(role('presentation-slide-label', heading!.label!));
    layout.append(footer);
    layout.classList.add('has-role-footer');
    if (header) layout.classList.add('has-role-header');
  }
  return doc.body.innerHTML;
}
