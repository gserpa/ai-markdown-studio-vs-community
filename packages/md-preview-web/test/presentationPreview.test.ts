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
    expect(preview.html).toContain('presentation-image-right-grid');
    expect(preview.html).toContain('presentation-image-frame');
    expect(preview.html).toContain('presentation-standard-header');
    expect(preview.html).toContain('https://example.com/test.png');
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

    expect(imageRightSlide?.querySelector('.presentation-image-right-media .mermaid')?.textContent).toContain('graph TD; A-->B;');
    expect(imageRightSlide?.querySelector('.presentation-image-right-copy .mermaid')).toBeNull();
    expect(defaultSlide?.querySelector('.presentation-standard-content .mermaid')?.textContent).toContain('graph TD; C-->D;');
  });

  it('renders preview-only layout structures for cover, side variants, table legend, and divider', () => {
    const preview = renderPresentationPreview(`---
document: presentation
---

<!--slide: cover-->
# Cover

Deck subtitle

![Cover image](https://example.com/cover.png)

---

<!--slide: side-banner-->
# Side Banner

![Banner image](https://example.com/banner.png)

Banner text

---

<!--slide: side-picture-->
# Side Picture

![Picture image](https://example.com/picture.png)

Picture text

---

<!--slide: default-side-->
# Default Side

Default side text

---

<!--slide: table-legend-->
# Table Legend

Legend copy

| Name | Value |
| --- | --- |
| Alpha | 1 |

---

<!--slide: divider-->
# Divider

Divider subtitle

![Divider image](https://example.com/divider.png)
`, (markdown) => markdown
      .replace(/^# (.+)$/gmu, '<h1>$1</h1>')
      .replace(/^\| (.+) \|$/gmu, (_match, content) => `<tr>${content.split(' | ').map((cell: string) => `<td>${cell}</td>`).join('')}</tr>`)
      .replace(/(<tr>.*<\/tr>)\n(<tr>.*<\/tr>)/gsu, '<table>$1$2</table>')
      .replace(/!\[(.*?)\]\((.*?)\)/gu, '<img alt="$1" src="$2" />')
      .replace(/^(Deck subtitle|Banner text|Picture text|Default side text|Legend copy|Divider subtitle)$/gmu, '<p>$1</p>')
      .replace(/<table><tr><td>---<\/td><td>---<\/td><\/tr>/gu, '<table>')
      .replace(/\n\n+/gu, ''), previewThemeRegistry, createDocument);

    const dom = new JSDOM(preview.html);
    const document = dom.window.document;

    expect(document.querySelector('.presentation-cover-layout')).not.toBeNull();
    expect(document.querySelector('.presentation-cover-media img')?.getAttribute('src')).toBe('https://example.com/cover.png');
    expect(document.querySelector('.presentation-side-banner-layout')).not.toBeNull();
    expect(document.querySelector('.presentation-side-banner-media img')?.getAttribute('src')).toBe('https://example.com/banner.png');
    expect(document.querySelector('.presentation-side-picture-layout')).not.toBeNull();
    expect(document.querySelector('.presentation-side-picture-media img')?.getAttribute('src')).toBe('https://example.com/picture.png');
    expect(document.querySelector('.presentation-default-side-layout')).not.toBeNull();
    expect(document.querySelector('.presentation-default-side-sidebar .presentation-default-side-title')?.textContent).toContain('Default Side');
    expect(document.querySelector('.presentation-table-legend-layout')).not.toBeNull();
    expect(document.querySelector('.presentation-table-legend-table table')).not.toBeNull();
    expect(document.querySelector('.presentation-divider-layout.has-background-media')).not.toBeNull();
    expect(document.querySelector('.presentation-divider-background img')?.getAttribute('src')).toBe('https://example.com/divider.png');
  });
});
