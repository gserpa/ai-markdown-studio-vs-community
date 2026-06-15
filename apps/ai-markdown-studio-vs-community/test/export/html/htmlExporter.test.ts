import { describe, expect, it, vi } from 'vitest';

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

vi.mock('vscode', () => ({
  workspace: {
    getWorkspaceFolder: vi.fn(() => undefined),
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, fallback: unknown) => fallback),
    })),
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

  it('omits remote image src attributes when allowRemoteResources is false', async () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string, fallback: unknown) => key === 'allowRemoteResources' ? false : fallback),
    });

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
