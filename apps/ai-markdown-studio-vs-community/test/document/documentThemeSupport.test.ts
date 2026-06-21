import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const { inspectMock, getWorkspaceFolderMock } = vi.hoisted(() => ({
  inspectMock: vi.fn(() => undefined),
  getWorkspaceFolderMock: vi.fn(() => undefined),
}));
const { existsSyncMock, readdirSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(() => true),
  readdirSyncMock: vi.fn((themeDirectoryPath: string) =>
    themeDirectoryPath.endsWith('.markdown-ai-studio')
      ? []
      : [
          {
            isFile: () => true,
            name: 'lumen-paper.json',
          },
        ],
  ),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      inspect: inspectMock,
    })),
    getWorkspaceFolder: getWorkspaceFolderMock,
  },
  env: {
    openExternal: vi.fn(),
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath, scheme: 'file' }),
    joinPath: (base: { fsPath: string; scheme?: string }, ...parts: string[]) => ({
      fsPath: path.join(base.fsPath, ...parts),
      scheme: base.scheme ?? 'file',
    }),
  },
}));

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  readdirSync: readdirSyncMock,
}));

import { getBundledDocumentThemeDirectory, getDocumentThemeDirectories } from '../../src/document/documentThemeSupport';

describe('documentThemeSupport', () => {
  it('includes bundled, configured, and workspace document theme directories', () => {
    const extensionUri = { fsPath: 'C:/extension-root', scheme: 'file' };
    const documentUri = { fsPath: 'C:/workspace/docs/example.md', scheme: 'file' };
    const bundledDocumentThemeDirectory = path.join(extensionUri.fsPath, 'assets', 'preview', 'themes', 'document');
    const configuredDocumentThemeDirectory = path.normalize('C:/custom/document-themes');
    const workspaceDocumentThemeDirectory = path.join('C:/workspace', '.markdown-ai-studio', 'document-themes');

    inspectMock.mockReturnValue({ globalValue: configuredDocumentThemeDirectory });
    getWorkspaceFolderMock.mockReturnValue({ uri: { fsPath: 'C:/workspace', scheme: 'file' } });

    expect(getBundledDocumentThemeDirectory(extensionUri as never)).toBe(bundledDocumentThemeDirectory);
    expect(getDocumentThemeDirectories(extensionUri as never, documentUri as never)).toEqual([
      bundledDocumentThemeDirectory,
      configuredDocumentThemeDirectory,
      workspaceDocumentThemeDirectory,
    ]);
  });
});
