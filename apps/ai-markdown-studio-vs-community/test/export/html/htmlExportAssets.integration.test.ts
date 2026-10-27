import { describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

vi.mock('vscode', async () => {
  const path = await import('node:path');
  const { pathToFileURL, fileURLToPath } = await import('node:url');
  const file = (fsPath: string): unknown => ({ fsPath, scheme: 'file', toString: () => pathToFileURL(fsPath).href });
  return {
    ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
    window: { activeColorTheme: { kind: 1 } },
    extensions: { getExtension: () => undefined },
    workspace: {
      getWorkspaceFolder: () => undefined,
      getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
    },
    Uri: { file, joinPath: (base: { fsPath: string }, ...segments: string[]) => file(path.join(base.fsPath, ...segments)),
      parse: (value: string) => value.startsWith('file:') ? file(fileURLToPath(value)) : { scheme: value.split(':')[0], toString: () => value } },
  };
});

import { buildExportHtmlArtifact } from '../../../src/export/html/htmlExporter';
import { buildPreviewHtml } from '../../../src/panel/previewHtmlBuilder';
import { loadPreviewAssetManifest, selectPreviewStylesheetAssets } from '../../../src/util/previewAssetManifest';

const root = path.resolve(__dirname, '../../../../..');
const extension = { fsPath: root, scheme: 'file' } as never;
const fixtures = [
  { name: 'system-document', expectedFonts: 0, source: '---\ntheme: light\n---\n# Document\n\nA short paragraph.' },
  { name: 'inter-document', expectedFonts: 6, source: '---\ntheme: autumn-ember\n---\n# Document\n\nA paragraph with `code`.' },
  { name: 'fraunces-document', expectedFonts: 6, source: '---\ntheme: dark-aurora-noir\n---\n# Document\n\nA paragraph with `code`.' },
  { name: 'presentation', expectedFonts: 0, source: '---\ndocument: presentation\ntheme: modern-blue\n---\n# Deck\n\nOpening slide.\n\n---\n\n# Second slide\n\nMore content.' },
  { name: 'media-presentation', expectedFonts: 0, source: '---\ndocument: presentation\ntheme: modern-blue\n---\n# Media\n\n![Pixel](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=)' },
  { name: 'math-document', expectedFonts: 0, source: '---\ntheme: light\n---\n# Math\n\n$x^2 + y^2 = z^2$' },
];

function documentFor(source: string) {
  const fsPath = path.join(root, 'export-baseline.md');
  return { fileName: fsPath, uri: { fsPath, scheme: 'file', toString: () => pathToFileURL(fsPath).href }, getText: () => source } as never;
}

function stylesIn(html: string): string {
  const dom = new JSDOM(html);
  try { return [...dom.window.document.querySelectorAll('style')].map(style => style.textContent).join('\n'); }
  finally { dom.window.close(); }
}

describe('HTML export with real built assets', () => {
  it.each(fixtures)('exports reusable CSS matching the inline $name export', async ({ name, source, expectedFonts }) => {
    const document = documentFor(source);
    const inline = await buildExportHtmlArtifact(extension, document, { assetMode: 'inline' });
    const external = await buildExportHtmlArtifact(extension, document, { assetMode: 'external' });
    const inlineCss = stylesIn(inline.html);
    const externalCss = Buffer.from(external.assets.find(asset => asset.mediaType.startsWith('text/css'))!.bytes).toString('utf8');
    expect(inlineCss.replace(/\s+/gu, '')).toBe(externalCss.replace(/\s+/gu, ''));
    expect(inline.html).toContain('<h1');
    const mode = source.includes('document: presentation') ? 'presentation' : 'document';
    const modules = selectPreviewStylesheetAssets(loadPreviewAssetManifest(extension), mode, name === 'media-presentation');
    const preview = buildPreviewHtml(extension, {
      cspSource: 'vscode-resource:', asWebviewUri: (value: { fsPath: string }) => ({ toString: () => value.fsPath }),
    } as never, document, src => src);
    const previewDom = new JSDOM(preview);
    try {
      const links = [...previewDom.window.document.querySelectorAll('link[rel="stylesheet"]')]
        .map(link => link.getAttribute('href')!).filter(href => !href.includes('themes') && !href.endsWith('katex.min.css'));
      const expectedLinks = modules.map(asset => path.join(root, 'assets', 'preview', ...asset.path.split('/')));
      expect(links).toEqual(expectedLinks);
      expect(new Set(links).size).toBe(links.length);
    } finally { previewDom.window.close(); }
    let previous = -1;
    for (const module of modules.slice(1)) {
      const css = readFileSync(path.join(root, 'assets', 'preview', module.path), 'utf8').trim();
      const index = inlineCss.indexOf(css);
      expect(index, module.path).toBeGreaterThan(previous);
      expect(inlineCss.indexOf(css, index + css.length), module.path).toBe(-1);
      previous = index;
    }
    expect(inlineCss.match(/\.mermaid-lightbox\s*\{/gu) ?? []).toHaveLength(name === 'media-presentation' ? 1 : 0);
    if (mode === 'presentation') expect(inlineCss).not.toContain('.document-preview-shell');
    expect([...inlineCss.matchAll(/data:font\/woff2;base64,/gu)]).toHaveLength(expectedFonts);
    if (name === 'inter-document') expect(inlineCss).not.toContain('font-family:Fraunces');
    if (name === 'fraunces-document') expect(inlineCss).not.toContain('font-family:Inter');
    expect(inlineCss).not.toMatch(/url\(['"]?\.\.\/fonts\//u);
    if (process.env.AMS_REPORT_EXPORT_SIZE === '1') {
      console.log(JSON.stringify({ fixture: name, htmlBytes: Buffer.byteLength(inline.html), cssBytes: Buffer.byteLength(inlineCss),
        embeddedFonts: [...inlineCss.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/gu)].length }));
    }
  });
});
