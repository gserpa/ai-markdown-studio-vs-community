import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

vi.mock('node:fs/promises', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  return {
  readFile: vi.fn(async (filePath: string) => {
    if (filePath.includes('preview-mermaid.') && filePath.endsWith('.css')) return '.mermaid-lightbox { position: fixed; }';
    if (filePath.endsWith('.css') && !filePath.endsWith('katex.min.css')) {
      return '.markdown-body { color: black; }';
    }

    if (filePath.endsWith('katex.min.css')) {
      return '';
    }

    if (filePath.includes('preview-core-runtime.')) return fs.readFileSync(path.resolve(__dirname, '../../../../../packages/md-preview-web/assets/preview.js'), 'utf8');
    if (filePath.includes('preview-theme-runtime.')) return fs.readFileSync(path.resolve(__dirname, '../../../../../packages/md-preview-web/assets/preview-theme-runtime.js'), 'utf8');
    if (filePath.includes('preview-document-runtime.')) return 'window.__mfoPreviewModeRuntime?.startDocument();';
    if (filePath.includes('preview-presentation-runtime.')) return 'window.__mfoPreviewModeRuntime?.startPresentation();';
    if (filePath.includes('preview-visualizations-runtime.')) return 'window.__exportChartRuntime = "</script><img id=script-breakout>";';
    if (filePath.includes('preview-visualizations-notices.')) return 'Chart dependencies\nCopyright <authors> & contributors\n</template><script>bad()</script>\n';

    return 'window.mermaid = {};';
  }),
  writeFile: vi.fn(),
  stat: vi.fn(async () => ({ size: 1, mtimeMs: 1, ctimeMs: 1 })),
  };
});

vi.mock('@mfo/preview-web', () => ({
  buildDocumentThemeCssArtifact: vi.fn((_registry, themeName: string) => ({
    family: 'document',
    themeName: themeName || 'auto',
    themeClassName: themeName === 'light' ? 'document-theme-light' : 'document-theme-auto',
    contentHash: 'document-theme-hash',
    fileName: 'themes/document/test.css',
    css: [
    '[data-md-preview-root].document-theme-light {',
    '  --md-preview-body-color: #111111;',
    '  --md-preview-heading-color: #1e3a8a;',
    '  --md-preview-link-color: #0969da;',
    '  --md-preview-content-bg: linear-gradient(180deg, #ffffff, #eff6ff);',
    '  --md-preview-code-bg: #d7e8ff;',
    '}',
  ].join('\n'),
  })),
  buildPreviewThemeCssArtifact: vi.fn((_registry, themeName: string) => ({
    family: 'presentation',
    themeName: themeName || 'auto',
    themeClassName: `presentation-theme-${themeName || 'auto'}`,
    contentHash: 'presentation-theme-hash',
    fileName: 'themes/presentation/test.css',
    css: '.presentation-preview { color: white; }',
  })),
  renderPresentationPreview: vi.fn((source: string) => ({
    deckTitle: 'Deck Title',
    slideCount: 2,
    html: source.includes('document: presentation')
      ? '<section class="presentation-preview"><div class="presentation-stage"><section class="presentation-slide is-active"><article class="presentation-slide-body markdown-body"><h1>Deck Title</h1></article></section><section class="presentation-slide"><article class="presentation-slide-body markdown-body"><h1>Opening</h1></article></section></div></section>'
      : '',
    themeSelection: {
      themeName: 'auto',
      themeClassName: 'presentation-theme-auto',
      lightMermaidTheme: 'default',
      darkMermaidTheme: 'dark',
      lightMermaidTransparentBackground: false,
      darkMermaidTransparentBackground: false,
    },
  })),
  resolveDocumentThemeSelection: vi.fn((themeName: string) => ({
    themeName: themeName || 'auto',
    themeClassName: themeName === 'light' ? 'document-theme-light' : 'document-theme-auto',
    themeMode: themeName === 'light' ? 'light' : 'auto',
    lightMermaidTheme: 'default',
    darkMermaidTheme: themeName === 'light' ? 'default' : 'dark',
    lightMermaidTransparentBackground: false,
    darkMermaidTransparentBackground: false,
  })),
}));

vi.mock('../../../src/document/documentThemeSupport', () => ({
  loadDocumentThemeRegistryForDocument: vi.fn(() => ({
    themes: new Map(),
    aliases: new Map(),
    defaultDarkThemeName: 'dark',
    defaultLightThemeName: 'light',
    warnings: [],
  })),
}));

vi.mock('../../../src/presentation/previewThemeSupport', () => ({
  loadPreviewThemeRegistryForDocument: vi.fn(() => ({ themes: new Map(), aliases: new Map(), warnings: [] })),
}));

vi.mock('../../../src/images/imageDataUri', () => ({
  imageDataUri: vi.fn(async () => 'data:image/png;base64,aGVsbG8='),
}));

vi.mock('vscode', () => ({
  ColorThemeKind: {
    Light: 1,
    Dark: 2,
    HighContrast: 3,
    HighContrastLight: 4,
  },
  workspace: {
    getWorkspaceFolder: vi.fn(() => undefined),
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, fallback: unknown) => key === 'documentPreviewTheme' ? 'auto' : fallback),
    })),
  },
  window: {
    activeColorTheme: {
      kind: 1,
    },
  },
  Uri: {
    parse: (value: string) => ({ scheme: 'file', fsPath: value.replace(/^file:\/\/\/?/u, ''), toString: () => value }),
    file: (fsPath: string) => ({
      fsPath,
      scheme: 'file',
      toString: () => `file://${fsPath}`,
    }),
    joinPath: (base: { fsPath: string }, ...segments: string[]) => {
      const fsPath = [base.fsPath, ...segments].join('/');
      return {
        fsPath,
        scheme: 'file',
        toString: () => `file://${fsPath}`,
        with: () => ({ fsPath, scheme: 'file', toString: () => `file://${fsPath}` }),
      };
    },
  },
}));

import { buildExportHtmlArtifact, buildExportHtmlString, embedLocalHtmlImages } from '../../../src/export/html/htmlExporter';
import { imageDataUri } from '../../../src/images/imageDataUri';
import { renderPresentationPreview } from '@mfo/preview-web';
import { createMarkdownRenderer, sanitizeRenderedHtml } from '@mfo/core';
import * as vscode from 'vscode';

describe('buildExportHtmlString', () => {
  beforeEach(() => {
    vi.mocked(imageDataUri).mockReset().mockResolvedValue('data:image/png;base64,aGVsbG8=');
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string, fallback: unknown) => key === 'documentPreviewTheme' ? 'auto' : fallback),
    } as never);
    vscode.window.activeColorTheme.kind = vscode.ColorThemeKind.Light;
  });

  it('embeds Markdown local images and preserves already embedded and remote sources', async () => {
    const document = {
      fileName: 'images.md', uri: { fsPath: 'C:/docs/images.md', scheme: 'file', toString: () => 'file:///C:/docs/images.md' },
      getText: () => '![Local](local.png)\n\n![Embedded](data:image/png;base64,AA==)\n\n![Remote](https://example.com/image.png)',
    } as never;
    const html = await buildExportHtmlString({ fsPath: 'C:/extension', scheme: 'file' } as never, document);
    expect(html).toContain('src="data:image/png;base64,aGVsbG8="');
    expect(html).toContain('src="data:image/png;base64,AA=="');
    expect(html).toContain('src="https://example.com/image.png"');
    expect(html).not.toContain('src="file:');
    expect(imageDataUri).toHaveBeenCalledTimes(1);
    expect(html).toContain('.mermaid-lightbox { position: fixed; }');
    expect(html).toContain('function initializeMermaidLightbox()');
    expect(html).toContain('window.__mfoPreviewModeRuntime?.startDocument();');
  });

  it('embeds rendered presentation images in inline and external HTML exports', async () => {
    const document = {
      fileName: 'slides.md', uri: { fsPath: 'C:/docs/slides.md', scheme: 'file', toString: () => 'file:///C:/docs/slides.md' },
      getText: () => '---\ndocument: presentation\n---\n# Images',
    } as never;
    for (const assetMode of ['inline', 'external'] as const) {
      vi.mocked(renderPresentationPreview).mockReturnValueOnce({
        html: '<section class="presentation-preview"><img src="file:///C:/docs/local.png" data-source-src="local.png"></section>',
        themeSelection: { themeName: 'auto' },
      } as never);
      const artifact = await buildExportHtmlArtifact({ fsPath: 'C:/extension', scheme: 'file' } as never, document, { assetMode });
      expect(artifact.html).toContain('src="data:image/png;base64,aGVsbG8="');
      expect(artifact.html).not.toContain('data-source-src="local.png"');
      expect(artifact.html).not.toContain('src="file:');
    }
  });

  it('refuses a portable export when a local image cannot be read', async () => {
    vi.mocked(imageDataUri).mockRejectedValueOnce(new Error('File not found'));
    await expect(embedLocalHtmlImages('<img src="missing.png">', {} as never)).rejects.toThrow('Cannot export portable HTML');
  });

  it('omits leading frontmatter while preserving body horizontal rules', async () => {
    const source = [
      '---',
      'title: Internal metadata',
      'theme: light',
      '---',
      '',
      '# Exported title',
      '',
      'Before',
      '',
      '---',
      '',
      'After',
    ].join('\n');
    const document = {
      fileName: 'example.md',
      uri: {
        fsPath: 'C:/docs/example.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/example.md',
      },
      getText: () => source,
    } as never;

    const html = await buildExportHtmlString({ fsPath: 'C:/extension', scheme: 'file' } as never, document);

    expect(html).toContain('<h1');
    expect(html).toContain('Exported title');
    expect(html).toContain('<hr />');
    expect(html).not.toContain('Internal metadata');
    expect(html).not.toContain('theme: light');
  });

  it('uses the resolved document theme metadata for export markup', async () => {
    const source = [
      '---',
      'title: Themed export',
      'theme: light',
      '---',
      '',
      '# Heading',
    ].join('\n');
    const document = {
      fileName: 'example.md',
      uri: {
        fsPath: 'C:/docs/example.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/example.md',
      },
      getText: () => source,
    } as never;

    const html = await buildExportHtmlString({ fsPath: 'C:/extension', scheme: 'file' } as never, document);

    expect(html).toContain('class="preview-mode-document document-theme-light document-theme-mode-light"');
    expect(html).toContain('data-document-theme="light"');
    expect(html).toContain('data-document-mermaid-theme-dark="default"');
  });

  it('switches printer-friendly document exports to the light theme and borderless frame styles', async () => {
    vscode.window.activeColorTheme.kind = vscode.ColorThemeKind.Dark;

    const source = [
      '---',
      'title: Printer friendly',
      'theme: night-sky',
      '---',
      '',
      '# Heading',
    ].join('\n');
    const document = {
      fileName: 'example.md',
      uri: {
        fsPath: 'C:/docs/example.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/example.md',
      },
      getText: () => source,
    } as never;

    const html = await buildExportHtmlString(
      { fsPath: 'C:/extension', scheme: 'file' } as never,
      document,
      { exportMode: 'paper-borderless' },
    );

    expect(html).toContain('<html lang="en" data-md-host-scheme="auto">');
    expect(html).toContain('<body class="preview-mode-document document-theme-light document-theme-mode-light"');
    expect(html).toContain('data-document-theme="light"');
    expect(html).toContain('border: 0 !important;');
    expect(html).toContain('box-shadow: none !important;');
    expect(html).toContain('--md-preview-heading-color: #1e3a8a;');
    expect(html).toContain('--md-preview-link-color: #0969da;');
    expect(html).toContain('--md-preview-code-bg: #d7e8ff;');
    expect(html).toContain('body.preview-mode-document .markdown-body,');
    expect(html).toContain('background: #ffffff !important;');
    expect(html).toContain('--md-preview-content-bg: #ffffff;');
  });

  it('does not apply printer-friendly background stripping to themed document exports', async () => {
    const document = {
      fileName: 'example.md',
      uri: {
        fsPath: 'C:/docs/example.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/example.md',
      },
      getText: () => '# Heading',
    } as never;

    const html = await buildExportHtmlString(
      { fsPath: 'C:/extension', scheme: 'file' } as never,
      document,
      { exportMode: 'theme' },
    );

    expect(html).toContain('--md-preview-content-bg: linear-gradient(180deg, #ffffff, #eff6ff);');
    expect(html).not.toContain('background: #ffffff !important;');
    expect(html).not.toContain('--md-preview-content-bg: #ffffff;');
  });

  it('applies printer-friendly backgrounds without borderless frame styles in paper mode', async () => {
    const document = {
      fileName: 'example.md',
      uri: {
        fsPath: 'C:/docs/example.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/example.md',
      },
      getText: () => '# Heading',
    } as never;

    const html = await buildExportHtmlString(
      { fsPath: 'C:/extension', scheme: 'file' } as never,
      document,
      { exportMode: 'paper' },
    );

    expect(html).toContain('background: #ffffff !important;');
    expect(html).toContain('--md-preview-content-bg: #ffffff;');
    expect(html).not.toContain('border: 0 !important;');
    expect(html).not.toContain('box-shadow: none !important;');
  });

  it('keeps exported document html page-scrollable', async () => {
    const document = {
      fileName: 'example.md',
      uri: {
        fsPath: 'C:/docs/example.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/example.md',
      },
      getText: () => '# Heading\n\n'.repeat(200),
    } as never;

    const html = await buildExportHtmlString({ fsPath: 'C:/extension', scheme: 'file' } as never, document);

    expect(html).toContain('body.preview-mode-document {');
    expect(html).toContain('overflow-y: auto;');
    expect(html).toContain('body.preview-mode-document .document-preview-shell {');
    expect(html).toContain('min-height: 100vh;');
    expect(html).toContain('body.preview-mode-document .document-preview-scroll {');
    expect(html).toContain('overflow: visible;');
  });

  it('uses the document table layout setting to choose the exported page width', async () => {
    const document = {
      fileName: 'tables.md',
      uri: {
        fsPath: 'C:/docs/tables.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/tables.md',
      },
      getText: () => '| First | Second |\n| --- | --- |\n| A | B |',
    } as never;

    const wideHtml = await buildExportHtmlString({ fsPath: 'C:/extension', scheme: 'file' } as never, document);
    expect(wideHtml).toContain('data-preview-page-width="full"');
    expect(wideHtml).toContain('data-document-table-layout="wide"');

    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string, fallback: unknown) => key === 'documentTableLayout' ? 'wrap' : fallback),
    } as never);
    const wrappedHtml = await buildExportHtmlString({ fsPath: 'C:/extension', scheme: 'file' } as never, document);
    expect(wrappedHtml).toContain('data-preview-page-width="readable"');
    expect(wrappedHtml).toContain('data-document-table-layout="wrap"');
  });

  it('exports markdown presentations as standalone presentation html', async () => {
    const source = [
      '---',
      'document: presentation',
      'title: Deck Title',
      'subtitle: Demo Subtitle',
      'author: Ada',
      '---',
      '',
      '<!--notes: Title slide. No `<!--slide:-->` marker is set, so this should render using the default/cover layout derived from the front matter title, subtitle, and author.-->',
      '',
      '---',
      '',
      '# Opening',
    ].join('\n');
    const document = {
      fileName: 'presentation.md',
      uri: {
        fsPath: 'C:/docs/presentation.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/presentation.md',
      },
      getText: () => source,
    } as never;

    const html = await buildExportHtmlString({ fsPath: 'C:/extension', scheme: 'file' } as never, document);

    expect(html).toContain('class="preview-mode-presentation" data-preview-mode="presentation"');
    expect(html).toContain('class="presentation-preview"');
    expect(html).toContain('class="presentation-slide is-active"');
    expect(html).toContain('window.__previewBridge');
    expect(html).toContain('Deck Title');
    expect(html).toContain('Opening');
    expect(html).not.toContain('preview-mode-document');
    expect(html).not.toContain('No `<!--slide:-->` marker is set');
    expect(html).not.toContain('marker is set, so this should render');
  });

  it('pins auto-theme presentation exports to the current VS Code dark mode when preview is dark', async () => {
    vscode.window.activeColorTheme.kind = vscode.ColorThemeKind.Dark;

    const source = [
      '---',
      'document: presentation',
      'title: Deck Title',
      '---',
      '',
      '# Opening',
    ].join('\n');
    const document = {
      fileName: 'presentation.md',
      uri: {
        fsPath: 'C:/docs/presentation.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/presentation.md',
      },
      getText: () => source,
    } as never;

    const html = await buildExportHtmlString({ fsPath: 'C:/extension', scheme: 'file' } as never, document);

    expect(html).toContain('<html lang="en" data-md-host-scheme="auto" class="vscode-dark">');
    const dom = new JSDOM(html);
    try {
      expect(dom.window.document.body.classList.contains('vscode-dark')).toBe(true);
      expect(dom.window.document.body.dataset.previewMode).toBe('presentation');
      expect(dom.window.document.body.dataset.presentationContentOverflow).toBe('scaleToFit');
      expect(dom.window.document.body.dataset.mdChartRemoteImages).toBe('true');
    } finally { dom.window.close(); }
  });

  it('pins auto-theme exports to the current VS Code dark mode when preview is dark', async () => {
    vscode.window.activeColorTheme.kind = vscode.ColorThemeKind.Dark;

    const document = {
      fileName: 'example.md',
      uri: {
        fsPath: 'C:/docs/example.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/example.md',
      },
      getText: () => '# Heading',
    } as never;

    const html = await buildExportHtmlString({ fsPath: 'C:/extension', scheme: 'file' } as never, document);

    expect(html).toContain('<html lang="en" data-md-host-scheme="auto" class="vscode-dark">');
    expect(html).toContain('class="preview-mode-document document-theme-auto document-theme-mode-auto vscode-dark" data-md-preview-root data-preview-mode="document"');
    expect(html).toContain('data-document-mermaid-theme-dark="dark"');
  });

  it('uses the same Mermaid label mode as preview for exported diagrams', async () => {
    vscode.window.activeColorTheme.kind = vscode.ColorThemeKind.Dark;

    const document = {
      fileName: 'example.md',
      uri: {
        fsPath: 'C:/docs/example.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/example.md',
      },
      getText: () => '```mermaid\nflowchart TD\nA-->B\n```',
    } as never;

    const html = await buildExportHtmlString({ fsPath: 'C:/extension', scheme: 'file' } as never, document);

    expect(html).toContain('htmlLabels: true');
    expect(html).toContain("document.querySelectorAll('.mermaid, .mermaid-rendered[data-mermaid-source]')");
    expect(html).toContain('normalizeRenderedMermaidSvgSizing(block);');
  });

  it('omits Mermaid and KaTeX assets from plain inline document exports', async () => {
    const document = {
      fileName: 'plain.md',
      uri: {
        fsPath: 'C:/docs/plain.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/plain.md',
      },
      getText: () => '# Plain document\n\nNo optional renderers are needed.',
    } as never;

    const html = await buildExportHtmlString({ fsPath: 'C:/extension', scheme: 'file' } as never, document);

    expect(html).not.toContain('window.mermaid = {};');
    expect(html).not.toContain('data-ams-export-asset="mermaid"');
    expect(html).not.toContain('katex.min.css');
  });

  it('returns declared fingerprinted assets for external website exports', async () => {
    const document = {
      fileName: 'diagram.md',
      uri: {
        fsPath: 'C:/docs/diagram.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/diagram.md',
      },
      getText: () => '```mermaid\nflowchart TD\nA-->B\n```',
    } as never;

    const artifact = await buildExportHtmlArtifact(
      { fsPath: 'C:/extension', scheme: 'file' } as never,
      document,
      { assetMode: 'external' },
    );

    expect(artifact.assets.some((asset) => /^_assets\/markdown-ai-studio\.[A-Za-z0-9_-]+\.css$/u.test(asset.path))).toBe(true);
    expect(artifact.assets.some((asset) => /^_assets\/mermaid\.[A-Za-z0-9_-]+\.js$/u.test(asset.path))).toBe(true);
    expect(artifact.assets.every((asset) => asset.bytes.byteLength > 0 && asset.contentHash.length > 0)).toBe(true);
    expect(artifact.html).toContain('<link rel="stylesheet" href="_assets/markdown-ai-studio.');
    expect(artifact.html).toContain('<script src="_assets/mermaid.');
    expect(artifact.html).not.toContain('data-ams-export-asset');
  });

  it('uses the standalone bridge for Mermaid links just like preview', async () => {
    const document = {
      fileName: 'example.md',
      uri: {
        fsPath: 'C:/docs/example.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/example.md',
      },
      getText: () => '```mermaid\nflowchart TD\nA[Start] --> B[End]\nclick A "https://example.com" "Open link"\n```',
    } as never;

    const html = await buildExportHtmlString({ fsPath: 'C:/extension', scheme: 'file' } as never, document);

    expect(html).toContain("anchor.setAttribute('data-href', linkTarget);");
    expect(html).toContain("bridge.openLink(linkedHref);");
    expect(html).toContain("window.open(href, '_blank', 'noopener,noreferrer');");
  });

  it('omits remote image src attributes when allowRemoteResources is false', async () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string, fallback: unknown) => {
        if (key === 'allowRemoteResources') {
          return false;
        }

        return key === 'documentPreviewTheme' ? 'auto' : fallback;
      }),
    } as never);

    const document = {
      fileName: 'example.md',
      uri: {
        fsPath: 'C:/docs/example.md',
        scheme: 'file',
        toString: () => 'file:///C:/docs/example.md',
      },
      getText: () => '![Remote](https://example.com/image.png)',
    } as never;

    const html = await buildExportHtmlString({ fsPath: 'C:/extension', scheme: 'file' } as never, document);

    expect(html).toContain('class="remote-resource-placeholder"');
    expect(html).toContain('data-md-chart-remote-images="false"');
    expect(html).toContain('data-source-src="https://example.com/image.png"');
    expect(html).toContain('Extension settings restrict access to remote resources.');
  });
});

describe('conditional HTML export assets', () => {
  it.each(['document', 'presentation'] as const)('reads only the selected mode and skips optional assets for a plain %s', async mode => {
    vi.mocked(readFile).mockClear();
    const source = mode === 'presentation' ? '---\ndocument: presentation\n---\n# Deck' : '# Plain document';
    const document = { fileName: 'plain.md', uri: { fsPath: 'C:/docs/plain.md', scheme: 'file' }, getText: () => source } as never;
    // Distinct roots exercise cold caches for each mode.
    await buildExportHtmlArtifact({ fsPath: 'C:/conditional-' + mode, scheme: 'file' } as never, document, { assetMode: 'inline' });
    const reads = vi.mocked(readFile).mock.calls.map(([file]) => String(file));
    expect(reads.some(file => file.includes('preview-' + mode + '.'))).toBe(true);
    const other = mode === 'document' ? 'presentation' : 'document';
    expect(reads.some(file => file.includes('preview-' + other + '.') || file.includes('preview-' + other + '-runtime.'))).toBe(false);
    expect(reads.some(file => /katex|mermaid|preview-visualizations-(?:runtime|notices)|\.woff2/u.test(file))).toBe(false);
  });
});

describe('visualization HTML export', () => {
  const json = JSON.stringify({ title: 'Chart <title>', mark: 'bar', data: { values: [{ x: 'A', y: 1 }] }, encoding: { x: { field: 'x', type: 'nominal' }, y: { field: 'y', type: 'quantitative' } } });
  const chart = '```vega-lite\n' + json + '\n```';
  const metric = '```metric\n{"title":"Debt","value":89.2,"unit":"% GDP"}\n```';
  const notices = 'Chart dependencies\nCopyright <authors> & contributors\n</template><script>bad()</script>\n';
  const extensionUri = { fsPath: 'C:/extension', scheme: 'file' } as never;
  const document = (source: string, name = 'charts.md') => ({ fileName: name, uri: { fsPath: 'C:/docs/' + name, scheme: 'file', toString: () => 'file:///C:/docs/' + name }, getText: () => source }) as never;
  beforeEach(() => {
    vi.mocked(readFile).mockClear();
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: vi.fn((_key: string, fallback: unknown) => fallback) } as never);
  });
  function sourceFor(mode: 'document' | 'presentation') {
    if (mode === 'document') return chart + '\n\n' + metric;
    vi.mocked(renderPresentationPreview).mockReturnValueOnce({
      html: '<section class="presentation-preview"><article class="markdown-body">' + sanitizeRenderedHtml(createMarkdownRenderer().render(chart + '\n\n' + metric)) + '</article></section>',
      themeSelection: { themeName: 'auto' },
    } as never);
    return '---\ndocument: presentation\n---\n# Charts\n\n' + chart + '\n\n' + metric;
  }

  it.each(['# Plain document', metric, '```vega-lite\n{"data":{"url":"https://example.invalid/data"}}\n```'])('omits chart libraries and notices when no valid chart needs them', async source => {
    const artifact = await buildExportHtmlArtifact(extensionUri, document(source), { assetMode: 'external' });
    expect(artifact.assets.some(asset => /visualizations/u.test(asset.path))).toBe(false);
    expect(vi.mocked(readFile).mock.calls.some(([file]) => /preview-visualizations-(?:runtime|notices)\./u.test(String(file)))).toBe(false);
    expect(artifact.html).not.toContain('data-ams-visualization-notices');
  });

  it.each(['document', 'presentation'] as const)('embeds one safe chart runtime and complete inert notices in a single-file %s', async mode => {
    const artifact = await buildExportHtmlArtifact(extensionUri, document(sourceFor(mode)), { assetMode: 'inline' });
    const dom = new JSDOM(artifact.html);
    try {
      const output = dom.window.document;
      expect(artifact.assets).toEqual([]);
      const scripts = output.querySelectorAll('script[data-ams-export-asset="preview-visualizations-runtime"]');
      expect(scripts).toHaveLength(1);
      expect(scripts[0].textContent).toContain('<\\/script>');
      expect(output.querySelector('#script-breakout')).toBeNull();
      expect(output.querySelector<HTMLTemplateElement>('template[data-ams-visualization-notices]')!.content.textContent).toBe(notices);
      expect(output.querySelector('.md-visualization-chart code')!.textContent).toBe(json + '\n');
      expect(output.querySelector<HTMLDetailsElement>('.md-visualization-chart details')!.open).toBe(true);
      expect(output.querySelector('.md-metric-value')!.textContent).toContain('89.2');
      expect(output.querySelector('.md-visualization-chart')!.getAttribute('aria-label')).toBe('Chart <title>');
    } finally { dom.window.close(); }
  });

  it.each(['document', 'presentation'] as const)('declares reusable runtime and license assets for external %s exports', async mode => {
    const first = await buildExportHtmlArtifact(extensionUri, document(sourceFor(mode)), { assetMode: 'external' });
    const second = await buildExportHtmlArtifact(extensionUri, document(sourceFor(mode).replace('"y":1', '"y":2'), 'second.md'), { assetMode: 'external' });
    const assets = first.assets.filter(asset => /visualizations/u.test(asset.path));
    expect(assets).toHaveLength(2);
    expect(assets.map(asset => asset.path)).toEqual(second.assets.filter(asset => /visualizations/u.test(asset.path)).map(asset => asset.path));
    const dom = new JSDOM(first.html);
    try {
      const runtime = assets.find(asset => asset.mediaType.startsWith('text/javascript'))!;
      const license = assets.find(asset => asset.mediaType.startsWith('text/plain'))!;
      expect(dom.window.document.querySelector('script[src*="preview-visualizations-runtime"]')!.getAttribute('src')).toBe(runtime.path);
      expect(dom.window.document.querySelector('link[rel="license"]')!.getAttribute('href')).toBe(license.path);
      expect(Buffer.from(license.bytes).toString('utf8')).toBe(notices);
      expect(first.html).not.toContain('data-ams-visualization-notices');
      expect(first.html).not.toContain('data-ams-export-asset');
      for (const asset of assets) expect(createHash('sha256').update(asset.bytes).digest('base64url').slice(0, 18)).toBe(asset.contentHash);
    } finally { dom.window.close(); }
  });
});
