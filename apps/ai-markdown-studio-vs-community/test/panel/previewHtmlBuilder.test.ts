import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const vscodeState = vi.hoisted(() => ({
  allowRemoteResources: true,
  globalDocumentThemeDirectory: '',
  workspaceRoot: '',
  proInstalled: false,
}));

vi.mock('vscode', () => ({
  extensions: {
    getExtension: vi.fn((extensionId: string) => (
      vscodeState.proInstalled && extensionId === 'GustavoSerpa.markdown-ai-studio-pro'
        ? { id: extensionId }
        : undefined
    )),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, fallback: unknown) => (key === 'allowRemoteResources' ? vscodeState.allowRemoteResources : fallback)),
      inspect: vi.fn((key: string) => {
        if (key === 'globalDocumentThemeDirectory') {
          return { globalValue: vscodeState.globalDocumentThemeDirectory };
        }
        return { globalValue: undefined };
      }),
    })),
    getWorkspaceFolder: vi.fn((uri: { fsPath: string }) => {
      if (vscodeState.workspaceRoot && uri.fsPath.startsWith(vscodeState.workspaceRoot)) {
        return { uri: { fsPath: vscodeState.workspaceRoot, scheme: 'file' } };
      }
      return undefined;
    }),
  },
  Uri: {
    file: vi.fn((fsPath: string) => ({ fsPath, scheme: 'file' })),
    joinPath: vi.fn((base: { fsPath: string }, ...segments: string[]) => ({
      fsPath: [base.fsPath, ...segments].join('/'),
      scheme: 'file',
    })),
  },
}));

import { buildDocumentPreviewBody, buildFrontMatterPanel } from '../../src/panel/previewHtmlBuilder';
import { buildPreviewHtml } from '../../src/panel/previewHtmlBuilder';
import * as vscode from 'vscode';

function createThemeFile(directory: string, fileName: string, name: string): string {
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, fileName);
  fs.writeFileSync(filePath, JSON.stringify({
    name,
    extends: 'light',
    tokens: {
      '--md-preview-body-color': '#123456',
    },
  }), 'utf8');
  return filePath;
}

describe('buildFrontMatterPanel', () => {
  it('renders frontmatter as a plain escaped metadata grid', () => {
    const html = buildFrontMatterPanel([
      '---',
      'title: Research <Brief>',
      'published: true',
      'tags:',
      '  - export',
      '  - mermaid',
      '---',
      '# Body',
    ].join('\n'));

    expect(html).toContain('<div class="frontmatter-grid">');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('<summary');
    expect(html).toContain('Research &lt;Brief&gt;');
    expect(html).toContain('&quot;export&quot;');
    expect(html).not.toContain('# Body');
  });

  it('does not render a panel when frontmatter is missing or invalid', () => {
    expect(buildFrontMatterPanel('# Body')).toBe('');
    expect(buildFrontMatterPanel('---\ninvalid: value: here\n---\n# Body')).toBe('');
  });

  it('renders frontmatter before and outside the themed document container', () => {
    const html = buildDocumentPreviewBody(
      '---\ntitle: Separate chrome\n---\n# Body',
      (markdown) => `<p>${markdown.trim()}</p>`,
      true,
    );

    expect(html).toMatch(/^<aside class="frontmatter-shell">/u);
    expect(html.indexOf('frontmatter-shell')).toBeLessThan(html.indexOf('<main class="markdown-body">'));
    expect(html).toContain('</aside><main class="markdown-body">');
    expect(html).toContain('<p># Body</p>');
  });
});

describe('buildPreviewHtml', () => {
  it('blocks remote image loads in the webview when allowRemoteResources is false', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string, fallback: unknown) => key === 'allowRemoteResources' ? false : fallback),
      inspect: vi.fn(() => undefined),
    });

    const html = buildPreviewHtml(
      { fsPath: 'C:/extension', scheme: 'file' } as never,
      {
        cspSource: 'vscode-resource:',
        asWebviewUri: (value: { fsPath?: string; toString: () => string }) => ({ toString: () => value.toString(), fsPath: value.fsPath }),
      } as never,
      {
        uri: { fsPath: 'C:/docs/example.md', scheme: 'file', toString: () => 'file:///C:/docs/example.md' },
        fileName: 'C:/docs/example.md',
        getText: () => '![Remote](https://example.com/image.png)',
      } as never,
      (rawPath) => rawPath,
    );

    expect(html).toContain('img-src vscode-resource: data:;');
    expect(html).toContain('class="remote-resource-placeholder"');
    expect(html).toContain('data-source-src="https://example.com/image.png"');
    expect(html).toContain('Extension settings restrict access to remote resources.');
  });

  it('renders local fragment links as controlled links for consistent branded tooltips', () => {
    const html = buildPreviewHtml(
      { fsPath: 'C:/extension', scheme: 'file' } as never,
      {
        cspSource: 'vscode-resource:',
        asWebviewUri: (value: { fsPath?: string; toString: () => string }) => ({ toString: () => value.toString(), fsPath: value.fsPath }),
      } as never,
      {
        uri: { fsPath: 'C:/docs/example.md', scheme: 'file', toString: () => 'file:///C:/docs/example.md' },
        fileName: 'C:/docs/example.md',
        getText: () => '# Section\n\n[Jump to section](#section)',
      } as never,
      (rawPath) => rawPath,
    );

    expect(html).toContain('data-href="#section"');
    expect(html).not.toMatch(/<a\s+href="#section"/u);
  });

  it('injects custom document theme styles when Pro is installed', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mads-workspace-'));
    const globalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mads-global-doc-'));
    const workspaceThemeDir = path.join(workspaceRoot, '.markdown-ai-studio', 'document-themes');
    const globalThemeDir = path.join(globalRoot, 'document-themes');
    const documentUri = { fsPath: path.join(workspaceRoot, 'docs', 'example.md'), scheme: 'file', toString: () => 'file:///C:/docs/example.md' };

    vscodeState.workspaceRoot = workspaceRoot;
    vscodeState.globalDocumentThemeDirectory = globalRoot;
    vscodeState.proInstalled = true;

    createThemeFile(workspaceThemeDir, 'lumen-paper.json', 'lumen-paper');
    createThemeFile(globalThemeDir, 'global-theme.json', 'global-theme');

    const html = buildPreviewHtml(
      { fsPath: 'C:/extension', scheme: 'file' } as never,
      {
        cspSource: 'vscode-resource:',
        asWebviewUri: (value: { fsPath?: string; toString: () => string }) => ({ toString: () => value.toString(), fsPath: value.fsPath }),
      } as never,
      {
        uri: documentUri,
        fileName: documentUri.fsPath,
        getText: () => '---\ntheme: lumen-paper\n---\n# Body',
      } as never,
      (rawPath) => rawPath,
    );

    expect(html).toContain('data-document-theme="lumen-paper"');
    expect(html).toContain('body.document-theme-lumen-paper {');
    expect(html).toContain('--md-preview-body-color: #123456;');
  });
});
