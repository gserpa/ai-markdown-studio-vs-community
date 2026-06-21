import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      inspect: vi.fn(() => undefined),
    })),
    getWorkspaceFolder: vi.fn(() => undefined),
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath, scheme: 'file' }),
    joinPath: (base: { fsPath: string; scheme?: string }, ...parts: string[]) => ({
      fsPath: path.join(base.fsPath, ...parts),
      scheme: base.scheme ?? 'file',
    }),
  },
}));

import { getBundledPreviewThemeDirectory, getPreviewThemeDirectories } from '../../src/presentation/previewThemeSupport';

describe('previewThemeSupport', () => {
  it('returns only the bundled presentation themes directory', () => {
    const extensionUri = { fsPath: 'C:/extension-root', scheme: 'file' };
    const documentUri = { fsPath: 'C:/workspace/slides/deck.md', scheme: 'file' };
    const bundledPreviewThemeDirectory = path.join(extensionUri.fsPath, 'assets', 'preview', 'themes', 'presentation');

    expect(getBundledPreviewThemeDirectory(extensionUri as never)).toBe(bundledPreviewThemeDirectory);
    expect(getPreviewThemeDirectories(extensionUri as never, documentUri as never)).toEqual([
      bundledPreviewThemeDirectory,
    ]);
  });
});
