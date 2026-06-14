import { parseMarkdownPresentation, resolveMarkdownPresentation } from '@mfo/core';
import { distributeItemsAcrossSlots } from '@mfo/core';
import { resolvePreviewThemeSelection, type PreviewThemeRegistry } from './previewThemeRegistry';

export type PresentationPreview = {
  deckTitle: string;
  slideCount: number;
  html: string;
};

type SlideLayoutContext = {
  body: HTMLElement;
};

type SlideLayoutBuilder = (context: SlideLayoutContext) => string;

/**
 * Factory that creates a DOM Document from an HTML string.
 *
 * On Node this is backed by JSDOM; in a browser/WebView it uses the
 * native DOMParser API.
 */
export type CreateDocument = (html: string) => Document;

export function renderPresentationPreview(
  source: string,
  renderMarkdown: (markdown: string) => string,
  themeRegistry: PreviewThemeRegistry,
  createDocument: CreateDocument,
): PresentationPreview {
  const presentation = resolveMarkdownPresentation(parseMarkdownPresentation(source));
  const deckTitle = asString(presentation.meta.title) || 'Presentation';
  const deckAuthor = asString(presentation.meta.author);
  const themeSelection = resolvePreviewThemeSelection(asString(presentation.meta.theme), themeRegistry);
  const presentationRatio = asString(presentation.meta.ratio) || '16:9';
  const ratioClass = getRatioClass(presentationRatio);
  const canvasSize = getPresentationCanvasSize(presentationRatio);
  const slides = presentation.slides.length > 0
    ? presentation.slides
    : [{ template: 'default', body: '# Empty presentation\n\nAdd slide content to preview this deck.', notes: undefined }];

  const renderedSlides = slides.map((slide, index) => {
    const bodyHtml = renderMarkdown(slide.body);
    const templateName = slide.template.trim() || 'default';
    const layoutContext = createSlideLayoutContext(bodyHtml, createDocument);
    const title = extractHeading(layoutContext.body) || `Slide ${index + 1}`;

    return {
      index,
      title,
      templateName,
      templateClass: `presentation-template-${toClassToken(templateName)}`,
      bodyLayoutHtml: createSlideBodyLayout(layoutContext, templateName),
      notesHtml: slide.notes ? renderMarkdown(slide.notes) : '',
    };
  });

  const slidesHtml = renderedSlides.map((slide) => `
      <section class="presentation-slide ${slide.templateClass}${slide.index === 0 ? ' is-active' : ''}" data-slide-index="${slide.index}" data-slide-template="${escapeHtml(slide.templateName)}" data-slide-title="${escapeHtml(slide.title)}" aria-hidden="${slide.index === 0 ? 'false' : 'true'}">
        <div class="presentation-slide-shell">
          <div class="presentation-frame ${ratioClass}" data-presentation-fullscreen-target data-presentation-ratio="${escapeHtml(presentationRatio)}">
            <div class="presentation-canvas" data-design-width="${canvasSize.width}" data-design-height="${canvasSize.height}">
              <div class="presentation-surface">
                <article class="presentation-slide-body markdown-body">${slide.bodyLayoutHtml}</article>
              </div>
            </div>
          </div>
        </div>
      </section>`).join('');

  const filmstripHtml = renderedSlides.map((slide) => {
    return `
      <button class="presentation-thumb${slide.index === 0 ? ' is-active' : ''}" type="button" data-slide-target="${slide.index}" aria-label="Open slide ${slide.index + 1}">
        <span class="presentation-thumb-index">${slide.index + 1}</span>
        <span class="presentation-thumb-title">${escapeHtml(slide.title)}</span>
      </button>`;
  }).join('');

  const slidePanelDataJson = serializeJsonForHtml(JSON.stringify(renderedSlides.map((slide) => ({
    notesHtml: slide.notesHtml,
    templateName: slide.templateName,
    title: slide.title,
  }))));

  const html = `
    <section class="presentation-preview ${themeSelection.themeClassName}" data-slide-count="${slides.length}" data-presentation-theme="${escapeHtml(themeSelection.themeName)}" data-presentation-mermaid-theme-light="${escapeHtml(themeSelection.lightMermaidTheme)}" data-presentation-mermaid-theme-dark="${escapeHtml(themeSelection.darkMermaidTheme)}" data-presentation-mermaid-transparent-background-light="${themeSelection.lightMermaidTransparentBackground ? 'true' : 'false'}" data-presentation-mermaid-transparent-background-dark="${themeSelection.darkMermaidTransparentBackground ? 'true' : 'false'}">
      <header class="presentation-header">
        <div class="presentation-header-heading">
          <h1 class="presentation-header-title">${escapeHtml(deckTitle)}</h1>
          ${deckAuthor ? `<span class="presentation-header-author"> BY ${escapeHtml(deckAuthor)}</span>` : ''}
        </div>
        <div class="presentation-header-controls">
          <button type="button" class="presentation-control presentation-control-icon" data-presentation-action="previous" aria-label="Previous slide" title="Previous slide">
            <span class="presentation-icon presentation-icon-chevron presentation-icon-chevron-left" aria-hidden="true"></span>
          </button>
          <div class="presentation-status" aria-live="polite">
            <span data-presentation-current>1</span>
            <span>/</span>
            <span>${slides.length}</span>
          </div>
          <button type="button" class="presentation-control presentation-control-icon" data-presentation-action="next" aria-label="Next slide" title="Next slide">
            <span class="presentation-icon presentation-icon-chevron presentation-icon-chevron-right" aria-hidden="true"></span>
          </button>
          <button type="button" class="presentation-control presentation-control-icon" data-presentation-action="fullscreen" aria-label="Enter full screen" title="Enter full screen">
            <span class="presentation-icon presentation-icon-fullscreen" aria-hidden="true"></span>
          </button>
        </div>
      </header>
      <div class="presentation-stage">
        ${slidesHtml}
      </div>
      <div class="presentation-bottom-bar" data-presentation-bottom-bar>
        <div class="presentation-bottom-bar-tabs">
          <button class="presentation-tab" type="button" data-panel="notes" aria-label="Speaker Notes" title="Speaker Notes">
            <span class="presentation-icon presentation-icon-notes" aria-hidden="true"></span>
            Speaker Notes
          </button>
          <button class="presentation-tab" type="button" data-panel="slides" aria-label="Slide list" title="Slide list">
            <span class="presentation-icon presentation-icon-slides" aria-hidden="true"></span>
            Slide List
          </button>
          <button class="presentation-tab" type="button" data-panel="info" aria-label="Slide Info" title="Slide Info">
            <span class="presentation-icon presentation-icon-info" aria-hidden="true"></span>
            Slide Info
          </button>
        </div>
        <div class="presentation-bottom-panel" data-panel="notes" hidden>
          <div class="presentation-bottom-panel-notes markdown-body" data-presentation-panel-notes></div>
        </div>
        <div class="presentation-bottom-panel" data-panel="slides" hidden>
          <nav class="presentation-filmstrip" aria-label="Slides">
            ${filmstripHtml}
          </nav>
        </div>
        <div class="presentation-bottom-panel" data-panel="info" hidden>
          <div class="presentation-bottom-panel-info markdown-body" data-presentation-panel-info></div>
        </div>
      </div>
      <script type="application/json" data-presentation-slide-data>${slidePanelDataJson}</script>
    </section>`;

  return {
    deckTitle,
    slideCount: slides.length,
    html,
  };
}

function createSlideLayoutContext(bodyHtml: string, createDocument: CreateDocument): SlideLayoutContext {
  const doc = createDocument(`<body>${bodyHtml}</body>`);
  return {
    body: doc.body,
  };
}

function extractHeading(body: ParentNode): string {
  const heading = body.querySelector('h1, h2, h3');
  return heading?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
}

function createSlideBodyLayout(context: SlideLayoutContext, templateName: string): string {
  const normalizedTemplate = templateName.trim().toLowerCase();
  const layoutBuilder = slideLayoutBuilders[normalizedTemplate] ?? createStandardLayout;
  return layoutBuilder(context);
}

const slideLayoutBuilders: Record<string, SlideLayoutBuilder> = {
  cover: createCoverLayout,
  'two-columns': createTwoColumnLayout,
  'image-right': createImageRightLayout,
  'side-banner': createSideBannerLayout,
  'side-picture': createSidePictureLayout,
  'default-side': createDefaultSideLayout,
  'table-legend': createTableLegendLayout,
  table: createTableLayout,
  'divider-b': createDividerBLayout,
  'divider-c': createDividerCLayout,
  thanks: createThanksLayout,
  divider: createDividerLayout,
  'section-divider': createDividerLayout,
};

function createStandardLayout(context: SlideLayoutContext): string {
  const title = extractPrimaryHeading(context.body);
  const contentHtml = context.body.innerHTML.trim();
  return wrapStandardLayout(title, contentHtml);
}

function createCoverLayout(context: SlideLayoutContext): string {
  const title = extractPrimaryHeading(context.body);
  const media = extractFirstRenderableMedia(context.body);
  const contentHtml = context.body.innerHTML.trim();

  return `
    <div class="presentation-cover-layout">
      <section class="presentation-cover-copy">
        <div class="presentation-cover-copy-main">
          ${title ? `<h1 class="presentation-layout-title presentation-cover-title">${escapeHtml(title)}</h1>` : ''}
        </div>
        <div class="presentation-cover-copy-foot">
          ${contentHtml ? `<div class="presentation-cover-subtitle">${contentHtml}</div>` : ''}
        </div>
      </section>
      <aside class="presentation-cover-media${media ? '' : ' is-empty'}">${renderMediaSlotContent(media)}</aside>
    </div>`;
}

function createTwoColumnLayout(context: SlideLayoutContext): string {
  const title = extractPrimaryHeading(context.body);
  const headerHtml = extractLeadingContent(context.body);
  const sections = splitSections(context.body);
  if (sections.length < 2) {
    return wrapStandardLayout(title, context.body.innerHTML.trim(), ' presentation-standard-layout-two-columns');
  }

  const columnsHtml = distributeItemsAcrossSlots(sections, 2).map((columnSections) => {
    const contentHtml = columnSections.map((section) => {
      const heading = section.heading ? `<h2 class="presentation-column-heading">${escapeHtml(section.heading)}</h2>` : '';
      return `${heading}${section.contentHtml}`;
    }).join('');

    return `<section class="presentation-column">${contentHtml}</section>`;
  }).join('');

  const contentHtml = `${headerHtml ? `<div class="presentation-two-column-header">${headerHtml}</div>` : ''}<div class="presentation-two-column-grid">${columnsHtml}</div>`;
  return wrapStandardLayout(title, contentHtml, ' presentation-standard-layout-two-columns');
}

function createImageRightLayout(context: SlideLayoutContext): string {
  const title = extractPrimaryHeading(context.body);
  const media = extractFirstRenderableMedia(context.body);
  const textHtml = context.body.innerHTML.trim();
  const contentHtml = `
    <div class="presentation-image-right-grid${media ? '' : ' is-text-only'}">
      <section class="presentation-image-right-copy">${textHtml}</section>
      ${media ? `<aside class="presentation-image-right-media"><div class="presentation-image-frame">${renderMediaSlotContent(media)}</div></aside>` : ''}
    </div>`;

  return wrapStandardLayout(title, contentHtml, ' presentation-standard-layout-image-right');
}

function createSideBannerLayout(context: SlideLayoutContext): string {
  const title = extractPrimaryHeading(context.body);
  const media = extractFirstRenderableMedia(context.body);
  const contentHtml = context.body.innerHTML.trim();

  return `
    <div class="presentation-side-banner-layout">
      <aside class="presentation-side-banner-sidebar">
        ${title ? `<h1 class="presentation-layout-title presentation-side-banner-title">${escapeHtml(title)}</h1>` : ''}
      </aside>
      <section class="presentation-side-banner-main">
        <div class="presentation-side-banner-media${media ? '' : ' is-empty'}">
          ${renderMediaSlotContent(media)}
        </div>
        <div class="presentation-side-banner-content">${contentHtml}</div>
      </section>
    </div>`;
}

function createSidePictureLayout(context: SlideLayoutContext): string {
  const title = extractPrimaryHeading(context.body);
  const media = extractFirstRenderableMedia(context.body);
  const contentHtml = context.body.innerHTML.trim();

  return `
    <div class="presentation-side-picture-layout">
      <aside class="presentation-side-picture-sidebar">
        ${title ? `<h1 class="presentation-layout-title presentation-side-picture-title">${escapeHtml(title)}</h1>` : ''}
      </aside>
      <section class="presentation-side-picture-main">
        <div class="presentation-side-picture-media${media ? '' : ' is-empty'}">
          ${renderMediaSlotContent(media)}
        </div>
        <div class="presentation-side-picture-content">${contentHtml}</div>
      </section>
    </div>`;
}

function createDefaultSideLayout(context: SlideLayoutContext): string {
  const title = extractPrimaryHeading(context.body);
  const contentHtml = context.body.innerHTML.trim();

  return `
    <div class="presentation-default-side-layout">
      <section class="presentation-default-side-content">${contentHtml}</section>
      <aside class="presentation-default-side-sidebar">
        ${title ? `<h1 class="presentation-layout-title presentation-default-side-title">${escapeHtml(title)}</h1>` : ''}
      </aside>
    </div>`;
}

function createTableLegendLayout(context: SlideLayoutContext): string {
  const title = extractPrimaryHeading(context.body);
  const table = extractFirstElement(context.body, 'table');
  const contentHtml = context.body.innerHTML.trim();

  return `
    <div class="presentation-table-legend-layout">
      <header class="presentation-table-legend-header">
        ${title ? `<h1 class="presentation-layout-title presentation-table-legend-title">${escapeHtml(title)}</h1>` : ''}
      </header>
      <div class="presentation-table-legend-grid">
        <section class="presentation-table-legend-copy">${contentHtml}</section>
        <section class="presentation-table-legend-table">${table?.outerHTML ?? ''}</section>
      </div>
    </div>`;
}

function createDividerLayout(context: SlideLayoutContext): string {
  const title = extractPrimaryHeading(context.body);
  const media = extractFirstRenderableMedia(context.body);
  const contentHtml = context.body.innerHTML.trim();

  return `
    <div class="presentation-divider-layout${media ? ' has-background-media' : ''}">
      ${media ? `<div class="presentation-divider-background">${renderMediaSlotContent(media)}</div>` : ''}
      <div class="presentation-divider-overlay"></div>
      <div class="presentation-divider-content">
        ${title ? `<h1 class="presentation-layout-title presentation-divider-title">${escapeHtml(title)}</h1>` : ''}
        ${contentHtml ? `<div class="presentation-divider-subtitle">${contentHtml}</div>` : ''}
      </div>
    </div>`;
}

function createTableLayout(context: SlideLayoutContext): string {
  const title = extractPrimaryHeading(context.body);
  const contentHtml = context.body.innerHTML.trim();
  return wrapStandardLayout(title, contentHtml, ' presentation-standard-layout-table');
}

function createDividerBLayout(context: SlideLayoutContext): string {
  const title = extractPrimaryHeading(context.body);
  const media = extractFirstRenderableMedia(context.body);
  const contentHtml = context.body.innerHTML.trim();

  return `
    <div class="presentation-divider-b-layout${media ? ' has-background-media' : ''}">
      ${media ? `<div class="presentation-divider-b-background">${renderMediaSlotContent(media)}</div>` : ''}
      <div class="presentation-divider-b-overlay"></div>
      <div class="presentation-divider-b-content">
        ${title ? `<h1 class="presentation-layout-title presentation-divider-b-title">${escapeHtml(title)}</h1>` : ''}
        ${contentHtml ? `<div class="presentation-divider-b-subtitle">${contentHtml}</div>` : ''}
      </div>
    </div>`;
}

function createDividerCLayout(context: SlideLayoutContext): string {
  const title = extractPrimaryHeading(context.body);
  const media = extractFirstRenderableMedia(context.body);
  const contentHtml = context.body.innerHTML.trim();

  return `
    <div class="presentation-divider-c-layout">
      <aside class="presentation-divider-c-media${media ? '' : ' is-empty'}">${renderMediaSlotContent(media)}</aside>
      <section class="presentation-divider-c-panel">
        ${title ? `<h1 class="presentation-layout-title presentation-divider-c-title">${escapeHtml(title)}</h1>` : ''}
        ${contentHtml ? `<div class="presentation-divider-c-subtitle">${contentHtml}</div>` : ''}
      </section>
    </div>`;
}

function createThanksLayout(context: SlideLayoutContext): string {
  const title = extractPrimaryHeading(context.body);
  const media = extractFirstRenderableMedia(context.body);
  const contentHtml = context.body.innerHTML.trim();

  return `
    <div class="presentation-thanks-layout">
      <div class="presentation-thanks-top">
        <div class="presentation-thanks-media${media ? '' : ' is-empty'}">${renderMediaSlotContent(media)}</div>
        <div class="presentation-thanks-note${contentHtml ? '' : ' is-empty'}">${contentHtml}</div>
      </div>
      <div class="presentation-thanks-bottom">
        ${title ? `<h1 class="presentation-layout-title presentation-thanks-title">${escapeHtml(title)}</h1>` : ''}
      </div>
    </div>`;
}

function splitSections(body: HTMLElement): Array<{ heading?: string; contentHtml: string }> {
  const sections: Array<{ heading?: string; contentHtml: string }> = [];
  let currentHeading = '';
  let currentContent: string[] = [];
  let seenSectionHeading = false;

  for (const child of [...body.children]) {
    if (child.tagName === 'H2') {
      seenSectionHeading = true;
      if (currentHeading || currentContent.length > 0) {
        sections.push({ heading: currentHeading || undefined, contentHtml: currentContent.join('') });
      }

      currentHeading = child.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
      currentContent = [];
      continue;
    }

    if (!seenSectionHeading) {
      continue;
    }

    currentContent.push(child.outerHTML);
  }

  if (currentHeading || currentContent.length > 0) {
    sections.push({ heading: currentHeading || undefined, contentHtml: currentContent.join('') });
  }

  return sections.filter((section) => section.heading || section.contentHtml.trim().length > 0);
}

function extractLeadingContent(body: HTMLElement): string {
  const parts: string[] = [];

  for (const child of [...body.children]) {
    if (child.tagName === 'H2') {
      break;
    }

    parts.push(child.outerHTML);
  }

  return parts.join('');
}

function wrapStandardLayout(title: string, contentHtml: string, extraClasses = ''): string {
  const hasContent = contentHtml.trim().length > 0;
  return `
    <div class="presentation-standard-layout${extraClasses}">
      ${title ? `<header class="presentation-standard-header"><h1 class="presentation-layout-title presentation-standard-title">${escapeHtml(title)}</h1></header>` : ''}
      <section class="presentation-standard-content${hasContent ? '' : ' is-empty'}">${contentHtml}</section>
    </div>`;
}

function extractPrimaryHeading(body: HTMLElement): string {
  const first = body.firstElementChild;
  if (!first || (first.tagName !== 'H1' && first.tagName !== 'H2')) {
    return '';
  }

  const title = first.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
  first.remove();
  return title;
}

function extractFirstElement(body: HTMLElement, selector: string): Element | undefined {
  const element = body.querySelector(selector);
  if (!element) {
    return undefined;
  }

  element.remove();
  return element;
}

function extractFirstRenderableMedia(body: HTMLElement): Element | undefined {
  return extractFirstElement(body, 'img, div.mermaid');
}

function renderMediaSlotContent(media: Element | undefined): string {
  if (!media) {
    return '<div class="presentation-layout-media-fill"></div>';
  }

  const mediaKindClass = media.tagName === 'IMG' ? 'is-image' : 'is-diagram';
  return `<div class="presentation-layout-media-shell ${mediaKindClass}">${media.outerHTML}</div>`;
}

function getRatioClass(ratio: string): string {
  return ratio.trim() === '4:3' ? 'presentation-ratio-4-3' : 'presentation-ratio-16-9';
}

function getPresentationCanvasSize(ratio: string): { width: number; height: number } {
  return ratio.trim() === '4:3'
    ? { width: 1280, height: 960 }
    : { width: 1280, height: 720 };
}

function toClassToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '') || 'default';
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function serializeJsonForHtml(value: string): string {
  return value
    .replace(/</gu, '\\u003c')
    .replace(/>/gu, '\\u003e')
    .replace(/&/gu, '\\u0026')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029');
}
