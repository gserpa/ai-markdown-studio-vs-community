import { describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { webcrypto } from 'node:crypto';
import { readReviewComments, writeReviewComments } from '@mfo/core';

vi.mock('vscode', async () => {
  const path = await import('node:path');
  const { pathToFileURL, fileURLToPath } = await import('node:url');
  const file = (fsPath: string): unknown => ({ fsPath, scheme: 'file', fragment: '', toString: () => pathToFileURL(fsPath).href, with: () => file(fsPath) });
  return {
    ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
    window: { activeColorTheme: { kind: 1 }, showSaveDialog: vi.fn() },
    extensions: { getExtension: () => undefined },
    workspace: {
      fs: { readFile: (uri: { fsPath: string }) => import('node:fs/promises').then(fs => fs.readFile(uri.fsPath)) },
      getWorkspaceFolder: () => undefined,
      getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
    },
    Uri: { file, joinPath: (base: { fsPath: string }, ...segments: string[]) => file(path.join(base.fsPath, ...segments)),
      parse: (value: string) => value.startsWith('file:') ? file(fileURLToPath(value)) : { scheme: value.split(':')[0], toString: () => value } },
  };
});

import { buildExportHtmlArtifact, buildPortableReviewHtml, exportMarkdownAsHtml } from '../../../src/export/html/htmlExporter';
import { buildPreviewHtml } from '../../../src/panel/previewHtmlBuilder';
import { loadPreviewAssetManifest, selectPreviewStylesheetAssets } from '../../../src/util/previewAssetManifest';
import * as vscode from 'vscode';

const root = path.resolve(__dirname, '../../../../..');
const extension = { fsPath: root, scheme: 'file' } as never;
const fixtures = [
  { name: 'midnight-headings', expectedFonts: 6, source: '---\ndocument: presentation\ntheme: midnight-delivery\n---\n<!-- slide-label -->\nProgress\n\n# Title\n\n<!-- slide-subtitle -->\nPeriod one\n\nBody paragraph.' },

  { name: 'system-document', expectedFonts: 0, source: '---\ntheme: light\n---\n# Document\n\nA short paragraph.' },
  { name: 'midnight-document', expectedFonts: 6, source: '---\ntheme: midnight-delivery\n---\n# Document\n\nA paragraph with `code`.' },
  { name: 'inter-document', expectedFonts: 6, source: '---\ntheme: autumn-ember\n---\n# Document\n\nA paragraph with `code`.' },
  { name: 'fraunces-document', expectedFonts: 6, source: '---\ntheme: dark-aurora-noir\n---\n# Document\n\nA paragraph with `code`.' },
  { name: 'midnight-presentation', expectedFonts: 6, source: '---\ndocument: presentation\ntheme: midnight-delivery\n---\n# Delivery\n\nStatus report.' },
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
  it('exports the reviewable snapshot through the public HTML command without changing the source', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ams-export-command-'));
    const dialog = vi.spyOn(vscode.window, 'showSaveDialog');
    try {
      const fsPath = path.join(directory, 'document.md');
      const target = path.join(directory, 'document.html');
      const source = '# Test\n\nA target.\n\n![Pixel](pixel.png)\n';
      const start = source.indexOf('target');
      const annotated = writeReviewComments(source, [
        { id: '1', body: 'Review note', state: 'open', includeInAi: false, range: { start, end: start + 6 } },
      ]);
      writeFileSync(fsPath, annotated);
      writeFileSync(path.join(directory, 'pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64'));
      dialog.mockResolvedValue(vscode.Uri.file(target));
      const document = { fileName: fsPath, uri: vscode.Uri.file(fsPath), getText: () => annotated } as never;
      expect((await exportMarkdownAsHtml(extension, document))?.fsPath).toBe(target);
      const dom = new JSDOM(readFileSync(target, 'utf8'));
      try {
        const encoded = dom.window.document.getElementById('ams-portable-source')!.textContent!;
        const stored = readReviewComments(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')));
        expect(stored.comments[0].body).toBe('Review note');
        expect(stored.markdown.slice(stored.comments[0].range!.start, stored.comments[0].range!.end)).toBe('target');
        expect(stored.markdown).toContain('data:image/png;base64,');
        expect(dom.window.document.getElementById('ams-save-html')).not.toBeNull();
      } finally { dom.window.close(); }
      expect(readFileSync(fsPath, 'utf8')).toBe(annotated);
    } finally { dialog.mockRestore(); rmSync(directory, { recursive: true, force: true }); }
  });

  it('does not write an HTML file when export is cancelled or an image is unavailable', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ams-export-command-failure-'));
    const dialog = vi.spyOn(vscode.window, 'showSaveDialog');
    try {
      const fsPath = path.join(directory, 'document.md');
      const target = path.join(directory, 'document.html');
      const document = { fileName: fsPath, uri: vscode.Uri.file(fsPath), getText: () => '# Test\n\n![Missing](missing.png)' } as never;
      dialog.mockResolvedValueOnce(undefined).mockResolvedValueOnce(vscode.Uri.file(target));
      await expect(exportMarkdownAsHtml(extension, document)).resolves.toBeUndefined();
      await expect(exportMarkdownAsHtml(extension, document)).rejects.toThrow('missing.png');
      expect(existsSync(target)).toBe(false);
    } finally { dialog.mockRestore(); rmSync(directory, { recursive: true, force: true }); }
  });

  it.each([
    '<video src="https://example.test/clip.mp4"></video>',
    '<video poster="//example.test/poster.png"></video>',
    '<video><source src="https://example.test/clip.mp4"></video>',
    '<video><track src="https://example.test/captions.vtt"></video>',
    '<video src="ht&#10;tps://example.test/clip.mp4"></video>',
    '<video src="\\\\example.test\\clip.mp4"></video>',
  ])('rejects remote media when the resource setting is disabled: %s', async markup => {
    const config = vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, fallback: unknown) => key === 'allowRemoteResources' ? false : fallback,
    } as never);
    try {
      await expect(buildPortableReviewHtml(extension, documentFor('# Media\n\n' + markup))).rejects.toThrow('remote media is disabled');
    } finally { config.mockRestore(); }
  });

  it.each([
    '<img src="file://example.test/share/image.png">',
    '<img src="\\\\example.test\\share\\image.png">',
    '<img src="%5C%5Cexample.test%5Cshare%5Cimage.png">',
  ])('does not read network-share images when remote resources are disabled: %s', async markup => {
    const config = vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, fallback: unknown) => key === 'allowRemoteResources' ? false : fallback,
    } as never);
    const read = vi.spyOn(vscode.workspace.fs, 'readFile');
    try {
      await expect(buildPortableReviewHtml(extension, documentFor('# Images\n\n' + markup))).rejects.toThrow('Remote resources are disabled');
      expect(read).not.toHaveBeenCalled();
    } finally { read.mockRestore(); config.mockRestore(); }
  });

  it.each(['document', 'presentation'] as const)('keeps annotated %s rendering-only exports free of review data', async mode => {
    const source = `${mode === 'presentation' ? '---\ndocument: presentation\n---\n\n' : ''}# Heading\n\nVisible text.\n`;
    const start = source.indexOf('Visible');
    const annotated = writeReviewComments(source, [
      { id: '1', body: 'Private review note', state: 'open', includeInAi: false, range: { start, end: start + 7 } },
    ]);
    for (const assetMode of ['inline', 'external'] as const) {
      const artifact = await buildExportHtmlArtifact(extension, documentFor(annotated), { assetMode });
      expect(artifact.html).toContain('Visible text.');
      expect(artifact.html).not.toContain('Private review note');
      expect(artifact.html).not.toContain('review-comments');
      expect(artifact.html).not.toContain('data-review-state');
      expect(artifact.html).not.toContain('ams-portable-source');
      for (const asset of artifact.assets) expect(Buffer.from(asset.bytes).toString('utf8')).not.toContain('Private review note');
    }
  });

  it('rejects a portable export when a local image cannot be embedded', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ams-portable-missing-'));
    try {
      const fsPath = path.join(directory, 'missing.md');
      const source = '# Test\n\n![Missing](missing.png)\n';
      const document = { fileName: fsPath, uri: { fsPath, scheme: 'file', toString: () => pathToFileURL(fsPath).href }, getText: () => source };
      await expect(buildPortableReviewHtml(extension, document as never)).rejects.toThrow('missing.png');
      expect(document.getText()).toBe(source);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.each([
    ['document', true], ['document', false], ['presentation', true], ['presentation', false],
  ] as const)('builds a gated portable %s with allowRemoteResources=%s', async (mode, allowRemote) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ams-portable-test-'));
    const config = vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, fallback: unknown) => key === 'allowRemoteResources' ? allowRemote : fallback,
    } as never);
    try {
      const source = `---\n${mode === 'presentation' ? 'document: presentation' : 'title: Document'}\n---\n\n# Slide\n\nA target and $x^2$.\n\n![Pixel](pixel.png)\n\n\`</script><script>window.injected=true</script>\`\n`;
      const start = source.indexOf('target');
      const annotated = writeReviewComments(source, [
        { id: '1', body: 'Keep </script> as data', state: 'open', includeInAi: false, range: { start, end: start + 6 } },
      ]);
      const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64');
      writeFileSync(path.join(directory, 'pixel.png'), pixel);
      const fsPath = path.join(directory, 'deck.md');
      const document = { fileName: fsPath, uri: { fsPath, scheme: 'file', toString: () => pathToFileURL(fsPath).href }, getText: () => annotated } as never;
      const html = await buildPortableReviewHtml(extension, document);
      const dom = new JSDOM(html);
      try {
        const sourceData = dom.window.document.getElementById('ams-portable-source')!.textContent!;
        const markdown = JSON.parse(Buffer.from(sourceData, 'base64').toString('utf8'));
        const store = readReviewComments(markdown);
        expect(markdown).toContain('data:image/png;base64,');
        expect(store.comments[0]).toMatchObject({ body: 'Keep </script> as data', includeInAi: false });
        expect(store.markdown.slice(store.comments[0].range!.start, store.comments[0].range!.end)).toBe('target');
        expect(annotated).toContain('pixel.png');
        expect(dom.window.document.querySelector('script[data-ams-runtime="renderer"]')?.getAttribute('type')).toBe('application/x-ams-runtime');
        expect(dom.window.document.querySelectorAll('script:not([type])')).toHaveLength(allowRemote ? 1 : 2);
        const assets = [...dom.window.document.querySelectorAll<HTMLScriptElement>('script[data-ams-export-asset]')];
        expect(assets.length).toBeGreaterThan(0);
        expect(assets.every(script => script.type === 'application/x-ams-runtime')).toBe(true);
        expect(dom.window.document.querySelector('main.markdown-body, .presentation-slide')?.textContent).toContain('A target');
        if (mode === 'presentation') {
          expect(dom.window.document.querySelector('.presentation-export-fallback input:checked')).not.toBeNull();
          expect(dom.window.document.querySelector('script[data-presentation-slide-data]')).toBeNull();
        }
        const policy = dom.window.document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        if (allowRemote) expect(policy).toBeNull();
        else {
          expect(policy?.getAttribute('content')).toContain("connect-src 'none'");
          expect(policy?.getAttribute('content')).toContain('img-src data: blob:');
          expect(policy?.getAttribute('content')).toContain("script-src 'unsafe-inline' 'unsafe-eval' blob: data:");
        }
        const notices = dom.window.document.querySelector<HTMLTemplateElement>('template[data-ams-portable-notices]')!.content.textContent!;
        expect(notices).toContain('launder@1.7.1');
        expect(notices).toContain('Apostrophe Technologies');
        expect(notices).toContain('katex@');
        expect(notices).toContain('SIL OPEN FONT LICENSE');
        expect(stylesIn(html)).not.toContain('cdn.jsdelivr.net/npm/katex');
        expect(stylesIn(html)).toContain('data:font/woff2;base64,');
      } finally { dom.window.close(); }
      const downloads: Blob[] = [];
      const openLink = vi.fn();
      const browser = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        beforeParse(window) {
          Object.assign(window, { TextEncoder, TextDecoder, Blob });
          Object.defineProperty(window.crypto, 'subtle', { value: webcrypto.subtle });
          window.URL.createObjectURL = (blob: Blob) => { downloads.push(blob); return 'blob:portable-test'; };
          window.URL.revokeObjectURL = () => {};
          window.open = openLink;
          window.HTMLAnchorElement.prototype.click = function () {
            this.addEventListener('click', event => event.preventDefault(), { once: true });
            this.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
          };
          window.HTMLElement.prototype.scrollIntoView = () => {};
          Object.assign(window.Range.prototype, {
            getBoundingClientRect: () => ({ top: 20, bottom: 30, left: 20, right: 30, height: 10 }),
            getClientRects: () => [],
          });
        },
      });
      try {
        const page = browser.window.document;
        await vi.waitFor(() => expect(page.getElementById('ams-portable-controls')?.hidden).toBe(false), { timeout: 10000 });
        expect(Reflect.get(browser.window, 'injected')).toBeUndefined();
        const controls = page.getElementById('ams-portable-controls')!;
        const saveHtml = page.querySelector<HTMLButtonElement>('#ams-save-html')!;
        const saveMarkdown = page.querySelector<HTMLButtonElement>('#ams-save-markdown')!;
        if (mode === 'presentation') {
          expect(controls.parentElement?.classList.contains('presentation-bottom-bar-tabs')).toBe(true);
          expect(saveHtml.classList.contains('presentation-tab')).toBe(true);
          expect(saveMarkdown.classList.contains('presentation-tab')).toBe(true);
          expect(saveHtml.querySelector('svg path')?.getAttribute('d')).not.toBe(saveMarkdown.querySelector('svg path')?.getAttribute('d'));
        } else {
          expect(controls.parentElement).toBe(page.body);
          expect(saveHtml.classList.contains('presentation-tab')).toBe(false);
          expect(saveMarkdown.classList.contains('presentation-tab')).toBe(false);
        }
        if (!allowRemote) {
          page.dispatchEvent(new browser.window.Event('securitypolicyviolation'));
          expect(page.getElementById('ams-portable-resource-warning')!.textContent).toContain('blocked');
        }
        if (mode === 'presentation') page.querySelector<HTMLButtonElement>('.md-review-panel-item')!.click();
        else {
          page.querySelector<HTMLButtonElement>('button[aria-label="Review Comments"]')!.click();
          [...page.querySelectorAll<HTMLButtonElement>('aside button')].find(button => button.textContent === 'Edit')!.click();
        }
        const text = page.querySelector<HTMLTextAreaElement>('.md-review-composer textarea')!;
        text.value = 'Edited offline';
        text.dispatchEvent(new browser.window.Event('input', { bubbles: true }));
        page.querySelector<HTMLFormElement>('.md-review-composer')!.requestSubmit();
        await vi.waitFor(() => expect(JSON.parse(page.querySelector('[data-review-state]')!.getAttribute('data-review-state')!).comments[0].body).toBe('Edited offline'));
        const unload = new browser.window.Event('beforeunload', { cancelable: true });
        browser.window.dispatchEvent(unload);
        expect(unload.defaultPrevented).toBe(true);
        const notesTab = page.querySelector<HTMLButtonElement>('.presentation-tab[data-panel="notes"]');
        notesTab?.click();
        saveHtml.click();
        if (notesTab) expect(notesTab.classList.contains('is-active')).toBe(true);
        expect(downloads).toHaveLength(1);
        expect(openLink).not.toHaveBeenCalled();
        const savedHtml = await downloads[0].text();
        const saved = new JSDOM(savedHtml);
        try {
          const encoded = saved.window.document.getElementById('ams-portable-source')!.textContent!;
          const savedSource = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
          const savedReview = readReviewComments(savedSource);
          expect(savedReview.comments[0].body).toBe('Edited offline');
          expect(savedReview.markdown.slice(savedReview.comments[0].range!.start, savedReview.comments[0].range!.end)).toBe('target');
          expect(saved.window.document.querySelector('.md-review-panel')).toBeNull();
          expect(saved.window.document.querySelector<HTMLTemplateElement>('template[data-ams-portable-notices]')!.content.textContent).toContain('launder@1.7.1');
          expect(!!saved.window.document.querySelector('meta[http-equiv="Content-Security-Policy"]')).toBe(!allowRemote);
        } finally { saved.window.close(); }
        saveMarkdown.click();
        if (notesTab) expect(notesTab.classList.contains('is-active')).toBe(true);
        expect(readReviewComments(await downloads[1].text()).comments[0].body).toBe('Edited offline');
        expect(page.getElementById('ams-portable-status')!.textContent).toContain('Confirm that your browser saved');
        if (!allowRemote) expect(page.getElementById('ams-portable-resource-warning')!.textContent).toContain('blocked');
        expect(openLink).not.toHaveBeenCalled();
        browser.window.URL.createObjectURL = () => { throw new Error('Download unavailable'); };
        page.querySelector<HTMLButtonElement>('#ams-save-html')!.click();
        expect(page.getElementById('ams-portable-status')!.textContent).toContain('Download unavailable');
        expect(JSON.parse(page.querySelector('[data-review-state]')!.getAttribute('data-review-state')!).comments[0].body).toBe('Edited offline');
      } finally { browser.window.close(); }
    } finally { config.mockRestore(); rmSync(directory, { recursive: true, force: true }); }
  }, 20000);

  it.each(fixtures)('exports reusable CSS matching the inline $name export', async ({ name, source, expectedFonts }) => {
    const document = documentFor(source);
    const inline = await buildExportHtmlArtifact(extension, document, { assetMode: 'inline' });
    const external = await buildExportHtmlArtifact(extension, document, { assetMode: 'external' });
    const inlineCss = stylesIn(inline.html);
    const externalCss = Buffer.from(external.assets.find(asset => asset.mediaType.startsWith('text/css'))!.bytes).toString('utf8');
    expect(inlineCss.replace(/\s+/gu, '')).toBe(externalCss.replace(/\s+/gu, ''));
    expect(inline.html).toContain('<h1');
    if (name === 'midnight-headings') {
      const dom = new JSDOM(inline.html);
      try {
        expect(dom.window.document.querySelector('.presentation-slide-label')?.textContent).toContain('Progress');
        expect(dom.window.document.querySelector('.presentation-slide-subtitle')?.textContent).toContain('Period one');
        expect(dom.window.document.querySelector('.presentation-standard-content')?.textContent?.trim()).toBe('Body paragraph.');
        expect(external.html).toContain('presentation-slide-label');
      } finally { dom.window.close(); }
    }

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
    if (name === 'midnight-document') {
      expect(inline.html).toContain('document-theme-midnight-delivery');
      expect(inlineCss).toContain('--md-preview-content-bg: #0A1240;');
      expect(inlineCss.includes('font-family:"Inter"')).toBe(true);
    }
    if (name === 'midnight-presentation') {
      expect(inline.html).toContain('presentation-theme-midnight-delivery');
      expect(inlineCss).toContain('--presentation-surface-bg: #0A1240;');
      expect(inlineCss.includes('font-family:"Inter"')).toBe(true);
    }
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
