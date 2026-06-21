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

import { getBundledDocumentThemeDirectory, getDocumentThemeDirectories } from '../../src/document/documentThemeSupport';

describe('documentThemeSupport', () => {
  it('returns only the bundled document themes directory', () => {
    const extensionUri = { fsPath: 'C:/extension-root', scheme: 'file' };
    const documentUri = { fsPath: 'C:/workspace/docs/example.md', scheme: 'file' };
    const bundledDocumentThemeDirectory = path.join(extensionUri.fsPath, 'assets', 'preview', 'themes', 'document');

    expect(getBundledDocumentThemeDirectory(extensionUri as never)).toBe(bundledDocumentThemeDirectory);
    expect(getDocumentThemeDirectories(extensionUri as never, documentUri as never)).toEqual([
      bundledDocumentThemeDirectory,
    ]);
  });
});
