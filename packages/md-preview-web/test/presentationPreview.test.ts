import * as path from 'path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { isMarkdownPresentationSource } from '@mfo/core';
import { renderPresentationPreview } from '../src/presentation/presentationPreview';
import { loadPreviewThemeRegistry } from '../src/presentation/previewThemeRegistry';
import type { CreateDocument } from '../src/presentation/presentationPreview';

const previewThemeRegistry = loadPreviewThemeRegistry(path.resolve(__dirname, '..', 'assets', 'themes'));
const createDocument: CreateDocument = (html) => new JSDOM(html).window.document;

describe('presentation preview detection', () => {
  it('detects presentation markdown via explicit document kind', () => {
    expect(isMarkdownPresentationSource(`---
document: presentation
title: Deck
---

# Intro
`)).toBe(true);
  });

  it('keeps markdown files in text mode when document kind is missing', () => {
    expect(isMarkdownPresentationSource(`<!--slide: divider-->
# Intro

---

# Next
`)).toBe(false);
  });

  it('keeps markdown files in text mode for unrecognized document kinds', () => {
    expect(isMarkdownPresentationSource(`---
document: executive-summary
title: Deck
---

# Intro
`)).toBe(false);
  });

  it('keeps regular markdown on the legacy preview path', () => {
    expect(isMarkdownPresentationSource(`# README

This is a plain Markdown file.

---

## Details
`)).toBe(false);
  });
});

describe('renderPresentationPreview', () => {
  it('prepends an implicit cover slide when front matter defines deck metadata', () => {
    const preview = renderPresentationPreview(`---
document: presentation
title: Deck Title
subtitle: Demo Subtitle
author: Ada
---

# Opening

Hello world.
`, (markdown) => `<div class="rendered">${markdown}</div>`, previewThemeRegistry, createDocument);

    expect(preview.deckTitle).toBe('Deck Title');
    expect(preview.slideCount).toBe(2);
    expect(preview.html).toContain(' BY Ada');
    expect(preview.html).toContain('presentation-template-cover');
    expect(preview.html).toContain('Demo Subtitle');
  });

  it('uses an explicit first cover slide as deck metadata without adding another cover', () => {
    const preview = renderPresentationPreview(`---
document: presentation
title: Front Matter Title
subtitle: Front Matter Subtitle
---

<!--slide: cover-->
# Custom Cover Title

Custom Cover Subtitle

---

# Opening
`, (markdown) => markdown
      .replace(/^# (.+)$/gmu, '<h1>$1</h1>')
      .replace(/^(Custom Cover Subtitle)$/gmu, '<p>$1</p>')
      .replace(/\n\n+/gu, ''), previewThemeRegistry, createDocument);

    expect(preview.deckTitle).toBe('Custom Cover Title');
    expect(preview.slideCount).toBe(2);
    expect(preview.html).toContain('Custom Cover Subtitle');
    expect(preview.html.match(/presentation-template-cover/gu)?.length).toBe(1);
  });

  it('renders a compact header with controls plus notes, slide info, and filmstrip html', () => {
    const preview = renderPresentationPreview(`---
document: presentation
---

# Opening

Hello world.

<!--notes: note-->

---

<!--slide: divider-->
# Closing
`, (markdown) => `<div class="rendered">${markdown}</div>`, previewThemeRegistry, createDocument);

  const dom = new JSDOM(preview.html);
  const slideDataElement = dom.window.document.querySelector('[data-presentation-slide-data]');
  const slideData = JSON.parse(slideDataElement?.textContent ?? '[]');

    expect(preview.deckTitle).toBe('Opening');
    expect(preview.slideCount).toBe(2);
    expect(preview.html).toContain('class="presentation-header-title"');
    expect(preview.html).toContain('>Opening</h1>');
    expect(preview.html).toContain('Speaker Notes');
    expect(preview.html).toContain('data-slide-target="1"');
    expect(preview.html).toContain('presentation-template-divider');
    expect(preview.html).toContain('data-presentation-action="fullscreen"');
    expect(preview.html).toContain('data-presentation-action="previous"');
    expect(preview.html).toContain('data-presentation-action="next"');
    expect(preview.html).toContain('data-presentation-bottom-bar');
    expect(preview.html).toContain('data-panel="notes"');
    expect(preview.html).toContain('data-panel="slides"');
    expect(preview.html).toContain('data-panel="info"');
  expect(slideDataElement).not.toBeNull();
  expect(slideData).toHaveLength(2);
  expect(slideData[0]?.notesHtml).toContain('<div class="rendered">note</div>');
  expect(slideData[1]?.templateName).toBe('divider');
  expect(slideData[1]?.title).toBe('Slide 2');
    expect(preview.html).toContain('class="presentation-canvas"');
    expect(preview.html).toContain('data-design-width="1280"');
    expect(preview.html).toContain('data-design-height="720"');
    expect(preview.html).toContain('class="presentation-content-fit" data-presentation-content-fit');
    expect(preview.html).toContain('data-presentation-theme="auto"');
  expect(preview.html).not.toContain('presentation-notes-pool');
  expect(preview.html).not.toContain('presentation-info-pool');
    expect(preview.html).not.toContain('presentation-controls');
    expect(preview.html).not.toContain('presentation-eyebrow');
    expect(preview.html).not.toContain('presentation-subtitle');
    expect(preview.html).not.toContain('presentation-meta');
    expect(preview.html).not.toContain('presentation-slide-chrome');
    expect(preview.html).not.toContain('presentation-slide-number');
    expect(preview.html).not.toContain('presentation-slide-template');
  });

  it('renders template-aware html for two-columns and image-right slides', () => {
    const preview = renderPresentationPreview(`---
document: presentation
---

<!--slide: two-columns-->
# Compare

## Left side

- Alpha

## Right side

- Beta

---

<!--slide: image-right-->
# Photo

Intro text.

![Alt text](https://example.com/test.png)
`, (markdown) => markdown
      .replace(/^# (.+)$/gmu, '<h1>$1</h1>')
      .replace(/^## (.+)$/gmu, '<h2>$1</h2>')
      .replace(/^- (.+)$/gmu, '<ul><li>$1</li></ul>')
      .replace(/!\[(.*?)\]\((.*?)\)/gu, '<img alt="$1" src="$2" />')
      .replace(/\n\n+/gu, ''), previewThemeRegistry, createDocument);

    expect(preview.html).toContain('presentation-two-column-grid');
    expect(preview.html).toContain('presentation-column-heading');
    expect(preview.html).toContain('presentation-illustrated-grid');
    expect(preview.html).toContain('presentation-image-frame');
    expect(preview.html).toContain('presentation-standard-header');
    expect(preview.html).toContain('https://example.com/test.png');
  });

  it('renders a featured visual with its description in one flow', () => {
    const preview = renderPresentationPreview(`---
document: presentation
---

<!--slide: image-center-->
# System flow

The request enters through the gateway.

![System flow](https://example.com/system-flow.png)

The service returns a validated response.
`, (markdown) => markdown
      .replace(/^# (.+)$/gmu, '<h1>$1</h1>')
      .replace(/^(The request enters through the gateway\.|The service returns a validated response\.)$/gmu, '<p>$1</p>')
      .replace(/!\[(.*?)\]\((.*?)\)/gu, '<img alt="$1" src="$2" />')
      .replace(/\n\n+/gu, ''), previewThemeRegistry, createDocument);

    const document = createDocument(preview.html);
    const layout = document.querySelector('.presentation-featured-layout');

    expect(layout).not.toBeNull();
    expect(layout?.querySelector('.presentation-featured-copy')).not.toBeNull();
    expect(layout?.querySelector('.presentation-featured-copy')?.textContent).toContain('The request enters through the gateway.');
    expect(layout?.querySelector('.presentation-featured-media img')?.getAttribute('src')).toBe('https://example.com/system-flow.png');
    expect(layout?.querySelector('.presentation-featured-copy')).not.toBeNull();
    expect(layout?.querySelector('.presentation-featured-copy')?.textContent).toContain('The service returns a validated response.');
  });

  it('bounds default-layout media between the surrounding Markdown content', () => {
    const preview = renderPresentationPreview(`---
document: presentation
---

<!--slide: default-->
# Landmark

Context before the image.

![Landmark](https://example.com/landmark.png)

Context after the image.
`, (markdown) => markdown
      .replace(/^# (.+)$/gmu, '<h1>$1</h1>')
      .replace(/^(Context before the image\.|Context after the image\.)$/gmu, '<p>$1</p>')
      .replace(/!\[(.*?)\]\((.*?)\)/gu, '<img alt="$1" src="$2" />')
      .replace(/\n\n+/gu, ''), previewThemeRegistry, createDocument);

    const document = createDocument(preview.html);
    const layout = document.querySelector('.presentation-standard-layout-flow .presentation-standard-content');
    expect([...layout!.children].map(node => node.tagName)).toEqual(['P', 'DIV', 'P']);
    expect(layout?.firstElementChild?.textContent).toContain('Context before the image.');
    expect(layout?.querySelector('img')?.getAttribute('src')).toBe('https://example.com/landmark.png');
    expect(layout?.querySelector('img')?.closest('.presentation-image-frame')).not.toBeNull();
    expect(layout?.lastElementChild?.textContent).toContain('Context after the image.');
  });

  it('does not reserve an empty trailing text region on default media slides', () => {
    const preview = renderPresentationPreview(`---
document: presentation
---

<!--slide: default-->
# Landmark

Context before the image.

![Landmark](https://example.com/landmark.png)
`, (markdown) => markdown
      .replace(/^# (.+)$/gmu, '<h1>$1</h1>')
      .replace(/^Context before the image\.$/gmu, '<p>Context before the image.</p>')
      .replace(/!\[(.*?)\]\((.*?)\)/gu, '<img alt="$1" src="$2" />')
      .replace(/\n\n+/gu, ''), previewThemeRegistry, createDocument);

    const document = createDocument(preview.html);
    const layout = document.querySelector('.presentation-standard-layout-flow .presentation-standard-content');
    expect([...layout!.children].map(node => node.tagName)).toEqual(['P', 'DIV']);
    expect(layout?.querySelector('footer')).toBeNull();
  });

  it('preserves multiple tables and media in source order when an unknown layout uses default', () => {
    const preview = renderPresentationPreview('---\ndocument: presentation\n---\n<!--slide: custom-layout-->\n# Mixed',
      () => '<h1>Mixed</h1><p>Before</p><table><tr><td>A</td></tr></table><p>Between</p><img src="a.png"><div class="mermaid">graph LR; A-->B</div><table><tr><td>B</td></tr></table><p>After</p>',
      previewThemeRegistry, createDocument);
    const document = createDocument(preview.html);
    const body = document.querySelector('.presentation-standard-layout-flow .presentation-standard-content');
    expect([...body!.children].map(node => node.tagName)).toEqual(['P', 'TABLE', 'P', 'DIV', 'DIV', 'TABLE', 'P']);
    expect(body?.querySelectorAll('.presentation-layout-media-shell')).toHaveLength(2);
  });

  it('distributes overflow two-column sections across both columns in order', () => {
    const preview = renderPresentationPreview(`---
document: presentation
---

<!--slide: two-columns-->
# Compare

## One

Alpha

## Two

Beta

## Three

Gamma

## Four

Delta
`, (markdown) => markdown
      .replace(/^# (.+)$/gmu, '<h1>$1</h1>')
      .replace(/^## (.+)$/gmu, '<h2>$1</h2>')
      .replace(/^(Alpha|Beta|Gamma|Delta)$/gmu, '<p>$1</p>')
      .replace(/\n\n+/gu, ''), previewThemeRegistry, createDocument);

    const dom = new JSDOM(preview.html);
    const columns = [...dom.window.document.querySelectorAll('.presentation-column')];
    const firstColumnText = columns[0]?.textContent ?? '';
    const secondColumnText = columns[1]?.textContent ?? '';

    expect(columns).toHaveLength(2);
    expect(firstColumnText.indexOf('One')).toBeGreaterThanOrEqual(0);
    expect(firstColumnText.indexOf('Alpha')).toBeGreaterThan(firstColumnText.indexOf('One'));
    expect(firstColumnText.indexOf('Two')).toBeGreaterThan(firstColumnText.indexOf('Alpha'));
    expect(firstColumnText.indexOf('Beta')).toBeGreaterThan(firstColumnText.indexOf('Two'));
    expect(firstColumnText).not.toContain('Three');
    expect(secondColumnText.indexOf('Three')).toBeGreaterThanOrEqual(0);
    expect(secondColumnText.indexOf('Gamma')).toBeGreaterThan(secondColumnText.indexOf('Three'));
    expect(secondColumnText.indexOf('Four')).toBeGreaterThan(secondColumnText.indexOf('Gamma'));
    expect(secondColumnText.indexOf('Delta')).toBeGreaterThan(secondColumnText.indexOf('Four'));
    expect(secondColumnText).not.toContain('One');
  });

  it('uses a fixed 4:3 design canvas for 4:3 presentations', () => {
    const preview = renderPresentationPreview(`---
document: presentation
ratio: 4:3
---

# Intro
`, (markdown) => markdown.replace(/^# (.+)$/gmu, '<h1>$1</h1>'), previewThemeRegistry, createDocument);

    expect(preview.html).toContain('data-presentation-ratio="4:3"');
    expect(preview.html).toContain('data-design-width="1280"');
    expect(preview.html).toContain('data-design-height="960"');
  });

  it('normalizes theme aliases for preview rendering', () => {
    const preview = renderPresentationPreview(`---
document: presentation
theme: modern-blue
---

# Intro
`, (markdown) => markdown.replace(/^# (.+)$/gmu, '<h1>$1</h1>'), previewThemeRegistry, createDocument);

    expect(preview.html).toContain('data-presentation-theme="modern-blue"');
    expect(preview.html).toContain('presentation-theme-modern-blue');
  });

  it('uses the configured default theme when front matter does not specify one', () => {
    const preview = renderPresentationPreview(`---
document: presentation
---

# Intro
`, (markdown) => markdown.replace(/^# (.+)$/gmu, '<h1>$1</h1>'), previewThemeRegistry, createDocument, 'black');

    expect(preview.html).toContain('data-presentation-theme="black"');
    expect(preview.html).toContain('presentation-theme-black');
  });

  it('prefers a front-matter theme over the configured default theme', () => {
    const preview = renderPresentationPreview(`---
document: presentation
theme: modern-blue
---

# Intro
`, (markdown) => markdown.replace(/^# (.+)$/gmu, '<h1>$1</h1>'), previewThemeRegistry, createDocument, 'black');

    expect(preview.html).toContain('data-presentation-theme="modern-blue"');
    expect(preview.html).not.toContain('presentation-theme-black');
  });

  it('renders text-only cover slides with the empty media column preserved', () => {
    const preview = renderPresentationPreview(`---
document: presentation
theme: black
---

<!--slide: cover-->
# Alpha Centauri

> Quote line
`, (markdown) => markdown
      .replace(/^# (.+)$/gmu, '<h1>$1</h1>')
      .replace(/^> (.+)$/gmu, '<blockquote><p>$1</p></blockquote>')
      .replace(/\n\n+/gu, ''), previewThemeRegistry, createDocument);

    const dom = new JSDOM(preview.html);
    const coverMedia = dom.window.document.querySelector('.presentation-cover-media');

    expect(coverMedia).not.toBeNull();
    expect(coverMedia?.classList.contains('is-empty')).toBe(true);
    expect(coverMedia?.querySelector('.presentation-layout-media-fill')).not.toBeNull();
    expect(preview.html).toContain('presentation-theme-black');
  });

  it('moves Mermaid diagrams into media slots when the layout has one and keeps them embedded otherwise', () => {
    const preview = renderPresentationPreview(`---
document: presentation
---

<!--slide: image-right-->
# Diagram Slide

Intro text.

<div class="mermaid">graph TD; A-->B;</div>

---

# Embedded Diagram

<div class="mermaid">graph TD; C-->D;</div>
`, (markdown) => markdown
      .replace(/^# (.+)$/gmu, '<h1>$1</h1>')
      .replace(/^Intro text\.$/gmu, '<p>Intro text.</p>')
      .replace(/<div class="mermaid">([\s\S]*?)<\/div>/gu, '<div class="mermaid">$1</div>')
      .replace(/\n\n+/gu, ''), previewThemeRegistry, createDocument);

    const dom = new JSDOM(preview.html);
    const slides = [...dom.window.document.querySelectorAll('.presentation-slide')];
    const imageRightSlide = slides[0];
    const defaultSlide = slides[1];

    expect(imageRightSlide?.querySelector('.presentation-illustrated-media .mermaid')?.textContent).toContain('graph TD; A-->B;');
    expect(imageRightSlide?.querySelector('.presentation-illustrated-copy .mermaid')).toBeNull();
    expect(defaultSlide?.querySelector('.presentation-standard-content .mermaid')?.textContent).toContain('graph TD; C-->D;');
  });

});
