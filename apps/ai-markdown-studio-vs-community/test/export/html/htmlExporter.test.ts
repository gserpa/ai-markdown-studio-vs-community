import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async (filePath: string) => {
    if (filePath.endsWith('preview.css')) {
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
  buildDocumentThemeStylesheet: vi.fn(() => 'body.document-theme-light { --md-preview-body-color: #111111; }'),
  buildPreviewThemeStylesheet: vi.fn(() => '.presentation-preview { color: white; }'),
  renderPresentationPreview: vi.fn((source: string) => ({
    deckTitle: 'Deck Title',
    slideCount: 2,
    html: source.includes('document: presentation')
      ? '<section class="presentation-preview"><div class="presentation-stage"><section class="presentation-slide is-active"><article class="presentation-slide-body markdown-body"><h1>Deck Title</h1></article></section><section class="presentation-slide"><article class="presentation-slide-body markdown-body"><h1>Opening</h1></article></section></div></section>'
      : '',
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

import { buildExportHtmlString } from '../../../src/export/html/htmlExporter';
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

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<body class="preview-mode-document document-theme-light document-theme-mode-light"');
    expect(html).toContain('data-document-theme="light"');
    expect(html).toContain('border: 0 !important;');
    expect(html).toContain('box-shadow: none !important;');
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

    expect(html).toContain('<html lang="en" class="vscode-dark">');
    expect(html).toContain('class="preview-mode-document document-theme-auto document-theme-mode-auto vscode-dark" data-preview-mode="document"');
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
