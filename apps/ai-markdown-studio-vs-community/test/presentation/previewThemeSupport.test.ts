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

import { getBundledPreviewThemeDirectory, getPreviewThemeDirectories } from '../../src/presentation/previewThemeSupport';

describe('previewThemeSupport', () => {
  it('includes bundled, configured, and workspace presentation theme directories', () => {
    const extensionUri = { fsPath: 'C:/extension-root', scheme: 'file' };
    const documentUri = { fsPath: 'C:/workspace/slides/deck.md', scheme: 'file' };
    const bundledPreviewThemeDirectory = path.join(extensionUri.fsPath, 'assets', 'preview', 'themes', 'presentation');
    const configuredPreviewThemeDirectory = path.normalize('C:/custom/presentation-themes');
    const workspacePreviewThemeDirectory = path.join('C:/workspace', '.markdown-ai-studio', 'presentation-themes');

    inspectMock.mockReturnValue({ globalValue: configuredPreviewThemeDirectory });
    getWorkspaceFolderMock.mockReturnValue({ uri: { fsPath: 'C:/workspace', scheme: 'file' } });

    expect(getBundledPreviewThemeDirectory(extensionUri as never)).toBe(bundledPreviewThemeDirectory);
    expect(getPreviewThemeDirectories(extensionUri as never, documentUri as never)).toEqual([
      bundledPreviewThemeDirectory,
      configuredPreviewThemeDirectory,
      workspacePreviewThemeDirectory,
    ]);
  });
});
