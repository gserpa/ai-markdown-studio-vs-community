import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createMarkdownRenderer } from '@mfo/core';
import { renderPresentationPreview } from '../src/presentation/presentationPreview';
import { loadPreviewThemeRegistryFromData } from '../src/presentation/previewThemeRegistry';

const md = createMarkdownRenderer();
const themes = loadPreviewThemeRegistryFromData([
  { name: 'plain' },
  { name: 'top', layouts: { content: { slots: { label: 'above-title', subtitle: 'below-title' } } } },
  { name: 'foot', extends: 'top', layouts: { content: { slots: { label: 'footer' } } } },
  { name: 'hidden', extends: 'top', layouts: { content: { slots: { label: 'none', subtitle: 'none' } } } },
]);
const body = '<!-- slide-label -->\nProgress\n\n# Title\n\n<!-- slide-subtitle -->\nPeriod **one**\n\nBody paragraph.';
function preview(theme: string, content = body) {
  return renderPresentationPreview('---\ndocument: presentation\ntheme: ' + theme + '\n---\n\n' + content,
    text => md.render(text), themes, html => new JSDOM(html).window.document);
}
function dom(theme: string, content = body) { return new JSDOM(preview(theme, content).html).window.document; }

describe('layout-controlled heading roles', () => {
  it('places text once above the title and below it, without adding to the body', () => {
    const doc = dom('top');
    const header = doc.querySelector('.presentation-standard-header')!;
    expect([...header.children].map(e => e.className)).toEqual(['presentation-heading-role presentation-slide-label',
      'presentation-layout-title presentation-standard-title', 'presentation-heading-role presentation-slide-subtitle']);
    expect(header.querySelector('strong')?.textContent).toBe('one');
    expect(doc.querySelector('.presentation-standard-content')?.textContent?.trim()).toBe('Body paragraph.');
    expect(doc.querySelectorAll('.presentation-slide-label')).toHaveLength(1);
  });

  it('uses the same source for a footer placement and retains inherited subtitle placement', () => {
    const doc = dom('foot');
    const header = doc.querySelector('.presentation-standard-header')!;
    expect(header.querySelector('.presentation-slide-label')).toBeNull();
    expect(doc.querySelector('.presentation-standard-footer .presentation-slide-label')?.textContent).toContain('Progress');
    expect(doc.querySelector('.presentation-slide-subtitle')?.textContent).toContain('Period one');
    expect(doc.querySelector('.presentation-standard-layout')?.classList.contains('has-role-footer')).toBe(true);
  });

  it.each(['plain', 'hidden'])('omits optional roles without moving them into body or reserving space: %s', theme => {
    const doc = dom(theme);
    expect(doc.querySelector('.presentation-heading-role')).toBeNull();
    expect(doc.querySelector('.presentation-standard-footer')).toBeNull();
    expect(doc.querySelector('.presentation-standard-title')?.textContent).toBe('Title');
    expect(doc.querySelector('.presentation-standard-content')?.textContent?.trim()).toBe('Body paragraph.');
    expect(preview(theme).warnings).toEqual([]);
  });

  it('adds no role markup or footer when no optional fields are supplied', () => {
    const content = '# Title\n\nAn ordinary paragraph.';
    expect(preview('top', content).html).toBe(preview('plain', content).html.replaceAll('presentation-theme-plain', 'presentation-theme-top').replaceAll('data-presentation-theme="plain"', 'data-presentation-theme="top"'));
  });

  it('retains invalid role values in body and renders escaped diagnostics', () => {
    const result = preview('top', '# Title\n\n<!-- slide-label -->\nFirst\n\n<!-- slide-label -->\nSecond');
    expect(result.warnings).toHaveLength(2);
    const doc = new JSDOM(result.html).window.document;
    expect(doc.querySelector('.presentation-diagnostics')?.textContent).toContain('at most one');
    expect(doc.querySelector('.presentation-standard-content')?.textContent).toContain('First');
    expect(doc.querySelector('.presentation-standard-content')?.textContent).toContain('Second');
  });

  it('can place optional heading text on a heading-free slide', () => {
    const doc = dom('top', '<!-- slide-label -->\nProgress\n\nBody paragraph.');
    expect(doc.querySelector('.presentation-standard-header .presentation-slide-label')?.textContent).toContain('Progress');
    expect(doc.querySelector('.presentation-layout-title')).toBeNull();
    expect(doc.querySelector('.presentation-standard-content')?.textContent).toContain('Body paragraph.');
  });

  it('does not execute markup supplied as a role value', () => {
    const doc = dom('top', '<!-- slide-label -->\n[Link](javascript:alert(1))\n\n# Title\n\nBody.');
    expect(doc.querySelector('.presentation-slide-label a[href^="javascript:"]')).toBeNull();
    expect(doc.querySelector('script:not([type="application/json"])')).toBeNull();
  });
});

describe('bounded theme layout inheritance', () => {
  it('inherits objects by slot, resets when changing variants, and keeps legacy strings', () => {
    const registry = loadPreviewThemeRegistryFromData([
      { name: 'parent', layouts: { content: { variant: 'header-body', slots: { label: 'above-title', subtitle: 'below-title' } } } },
      { name: 'child', extends: 'parent', layouts: { content: { slots: { label: 'footer' } } } },
      { name: 'different', extends: 'child', layouts: { content: { variant: 'accent-side' } } },
      { name: 'legacy', extends: 'child', layouts: { content: 'header-body' } },
      { name: 'nothing' },
    ]);
    expect(registry.warnings).toEqual([]);
    expect(registry.themes.get('child')?.layouts?.content).toEqual({ variant: 'header-body', slots: { label: 'footer', subtitle: 'below-title' } });
    expect(registry.themes.get('different')?.layouts?.content).toEqual({ variant: 'accent-side', slots: {} });
    expect(registry.themes.get('legacy')?.layouts?.content).toBe('header-body');
    expect(registry.themes.get('nothing')?.layouts?.content).toBe('header-body');
  });

  it.each([
    { slots: { label: 'sideways', subtitle: 'below-title' } },
    { slots: { label: 'above-title', invented: true } },
    { variant: 'accent-side', slots: { label: 'above-title' } },
    { variant: 'media-right', slots: { label: 'above-title' } },
    { slots: null },
    { bodyRegions: { 4: 'grid' } },
    { variant: null },
    { slots: { label: null } },
  ])('rejects an invalid entry as a whole: %j', local => {
    const parent = { variant: 'header-body', slots: { label: 'footer', subtitle: 'below-title' } };
    const registry = loadPreviewThemeRegistryFromData([
      { name: 'parent', layouts: { content: parent } },
      { name: 'invalid', extends: 'parent', layouts: { content: local } },
    ]);
    expect(registry.warnings.length).toBeGreaterThan(0);
    expect(registry.themes.get('invalid')?.layouts?.content).toEqual(parent);
  });
});

describe('multiple content areas', () => {
  it.each([2, 3, 4])('renders %s ordered areas with the title outside the grid', count => {
    const content = '# Title\n\n' + Array.from({ length: count }, (_, index) => 'Area ' + (index + 1)).join('\n\n<!-- region-break -->\n\n');
    const doc = dom('top', content);
    expect(doc.querySelector('.presentation-standard-title')?.textContent).toBe('Title');
    expect([...doc.querySelectorAll('.presentation-region')].map(element => element.textContent?.trim()))
      .toEqual(Array.from({ length: count }, (_, index) => 'Area ' + (index + 1)));
  });

  it('places optional heading fields and ordered areas together', () => {
    const content = '<!-- slide-label -->\nProgress\n\n# Title\n\n<!-- slide-subtitle -->\nPeriod\n\nFirst\n\n<!-- region-break -->\nSecond';
    const doc = dom('top', content);
    expect(doc.querySelector('.presentation-standard-header .presentation-slide-label')?.textContent).toContain('Progress');
    expect(doc.querySelector('.presentation-standard-title')?.textContent).toBe('Title');
    expect(doc.querySelector('.presentation-standard-header .presentation-slide-subtitle')?.textContent).toContain('Period');
    expect([...doc.querySelectorAll('.presentation-region')].map(e => e.textContent?.trim())).toEqual(['First', 'Second']);
  });

  it('shows content in normal flow and warns if the selected layout cannot place areas', () => {
    const registry = loadPreviewThemeRegistryFromData([{ name: 'side', layouts: { content: 'accent-side' } }]);
    const result = renderPresentationPreview('---\ndocument: presentation\ntheme: side\n---\n# Title\n\nFirst\n\n<!-- region-break -->\nSecond',
      text => md.render(text), registry, html => new JSDOM(html).window.document);
    expect(result.warnings.join(' ')).toContain('normal flow');
    const doc = new JSDOM(result.html).window.document;
    expect(doc.querySelector('.presentation-region-grid')).toBeNull();
    expect(doc.querySelector('.presentation-accent-content')?.textContent).toContain('First');
    expect(doc.querySelector('.presentation-accent-content')?.textContent).toContain('Second');
  });
});

describe('content area theme configuration', () => {
  it('inherits a primary-wide arrangement and keeps ordinary slides unaffected', () => {
    const registry = loadPreviewThemeRegistryFromData([
      { name: 'parent', layouts: { content: { variant: 'header-body', regions: 'primary-wide' } } },
      { name: 'child', extends: 'parent' },
    ]);
    expect(registry.warnings).toEqual([]);
    const result = renderPresentationPreview('---\ndocument: presentation\ntheme: child\n---\n# Title\n\nPrimary\n\n<!-- region-break -->\nSecondary',
      text => md.render(text), registry, html => new JSDOM(html).window.document);
    const doc = new JSDOM(result.html).window.document;
    expect(doc.querySelector('.presentation-region-grid.presentation-regions-primary-wide')).not.toBeNull();
    expect([...doc.querySelectorAll('.presentation-region')].map(e => e.textContent?.trim())).toEqual(['Primary', 'Secondary']);
  });
  it('rejects an incompatible area arrangement without applying the local entry', () => {
    const registry = loadPreviewThemeRegistryFromData([{ name: 'bad', layouts: { content: { variant: 'accent-side', regions: 'primary-wide' } } }]);
    expect(registry.warnings.join(' ')).toContain('unsupported');
    expect(registry.themes.get('bad')?.layouts?.content).toBe('header-body');
  });
});
