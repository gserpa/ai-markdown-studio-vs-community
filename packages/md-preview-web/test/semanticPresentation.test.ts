import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { createMarkdownRenderer } from '@mfo/core';
import { renderPresentationPreview } from '../src/presentation/presentationPreview';
import { loadPreviewThemeRegistryFromData } from '../src/presentation/previewThemeRegistry';

const markdown = createMarkdownRenderer();
const createDocument = (html: string) => new JSDOM(html).window.document;
const source = (type: string, body: string, theme = 'left') => `---\ndocument: presentation\ntheme: ${theme}\n---\n<!--slide: ${type}-->\n# Topic\n\n${body}`;
const registry = loadPreviewThemeRegistryFromData([
  { name: 'left', layouts: { 'illustrated-text': 'media-left', brief: 'accent-side' }, tokens: {} },
  { name: 'right', extends: 'left', layouts: { 'illustrated-text': 'media-right', brief: 'accent-side-right' }, tokens: {} },
]);

describe('semantic presentation layouts', () => {
  it('lets two themes place the same content differently', () => {
    const render = (theme: string) => createDocument(renderPresentationPreview(source('illustrated-text', 'Explanation.\n\n![Photo](https://example.com/photo.png)', theme), text => markdown.render(text), registry, createDocument).html);
    expect(render('left').querySelector('.presentation-illustrated-grid.is-media-left')).not.toBeNull();
    expect(render('right').querySelector('.presentation-illustrated-grid.is-media-left')).toBeNull();
    expect(render('left').querySelector('[data-slide-layout]')?.getAttribute('data-slide-template')).toBe('illustrated-text');
  });

  it('renders optional-heading columns using the explicit boundary', () => {
    const html = renderPresentationPreview(source('two-column', 'First group.\n\n<!--column-break-->\n\nSecond group.'), text => markdown.render(text), registry, createDocument).html;
    const columns = [...createDocument(html).querySelectorAll('.presentation-column')];
    expect(columns.map(column => column.textContent?.trim())).toEqual(['First group.', 'Second group.']);
  });

  it('uses a compact body for a brief and one description flow for featured visuals', () => {
    const brief = createDocument(renderPresentationPreview(source('brief', '1. Introduction\n2. Next steps'), text => markdown.render(text), registry, createDocument).html);
    expect(brief.querySelector('.presentation-accent-content ol')).not.toBeNull();
    const visual = createDocument(renderPresentationPreview(source('featured-visual', 'Before.\n\n![Photo](https://example.com/photo.png)\n\nAfter.'), text => markdown.render(text), registry, createDocument).html);
    expect(visual.querySelector('.presentation-featured-copy')?.textContent).toContain('Before.');
    expect(visual.querySelector('.presentation-featured-copy')?.textContent).toContain('After.');
    expect(visual.querySelector('.presentation-featured-media img')).not.toBeNull();
    const panelThemes = loadPreviewThemeRegistryFromData([{ name: 'panel', layouts: { 'featured-visual': 'accent-side-image' }, tokens: {} }]);
    const panel = createDocument(renderPresentationPreview(source('featured-visual', '![Photo](https://example.com/photo.png)\n\nDescription.', 'panel'), text => markdown.render(text), panelThemes, createDocument).html);
    expect(panel.querySelector('.presentation-accent-main.has-media .presentation-accent-media img')).not.toBeNull();
    expect(panel.querySelector('.presentation-accent-content')?.textContent).toContain('Description.');
  });

  it('migrates retired directives before rendering instead of keeping legacy builders', () => {
    const html = renderPresentationPreview(source('image-right', 'Text.\n\n![Photo](https://example.com/photo.png)'), text => markdown.render(text), registry, createDocument).html;
    expect(html).toContain('data-slide-template="illustrated-text"');
    expect(html).not.toContain('presentation-image-right');
  });

  it('inherits layouts by type and rejects incompatible choices', () => {
    expect(registry.themes.get('right')?.layouts?.brief).toBe('accent-side-right');
    const invalid = loadPreviewThemeRegistryFromData([{ name: 'invalid', layouts: { content: 'media-left' }, tokens: {} }]);
    expect(invalid.warnings).toHaveLength(1);
    expect(invalid.themes.get('invalid')?.layouts?.content).toBe('header-body');
  });

  it('shares divider structure between solid and photographic theme treatments', () => {
    const themes = loadPreviewThemeRegistryFromData([{ name: 'photo', layouts: { divider: 'photo-divider' }, tokens: {} }]);
    const html = renderPresentationPreview(source('divider', 'Section subtitle.\n\n![Photo](https://example.com/photo.png)', 'photo'), text => markdown.render(text), themes, createDocument).html;
    const divider = createDocument(html).querySelector('.presentation-divider-layout.is-photo');
    expect(divider?.querySelector('.presentation-divider-content')?.textContent).toContain('Section subtitle.');
    expect(divider?.querySelector('.presentation-divider-background img')).not.toBeNull();
  });
});
