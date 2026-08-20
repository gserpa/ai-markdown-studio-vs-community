import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async (filePath: string) => {
    if (filePath.endsWith('.css') && !filePath.endsWith('katex.min.css')) {
      return '.markdown-body { color: black; }';
    }

    if (filePath.endsWith('katex.min.css')) {
      return '';
    }

    return 'window.mermaid = {};';
  }),
  writeFile: vi.fn(),
}));

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
      };
    },
  },
}));

import { buildExportHtmlArtifact, buildExportHtmlString } from '../../../src/export/html/htmlExporter';
import * as vscode from 'vscode';

describe('buildExportHtmlString', () => {
  beforeEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string, fallback: unknown) => key === 'documentPreviewTheme' ? 'auto' : fallback),
    } as never);
    vscode.window.activeColorTheme.kind = vscode.ColorThemeKind.Light;
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
    expect(html).toContain('<body class="preview-mode-presentation vscode-dark" data-preview-mode="presentation" data-presentation-content-overflow="scaleToFit">');
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

  it('preserves Mermaid anchor hrefs in exported HTML', async () => {
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

    expect(html).toContain("anchor.setAttribute('href', linkTarget);");
    expect(html).not.toContain("anchor.removeAttribute('href');");
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
    expect(html).toContain('data-source-src="https://example.com/image.png"');
    expect(html).toContain('Extension settings restrict access to remote resources.');
  });
});
