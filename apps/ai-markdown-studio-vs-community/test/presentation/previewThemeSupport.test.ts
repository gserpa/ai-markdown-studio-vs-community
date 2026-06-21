import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const vscodeState = vi.hoisted(() => ({
  previewThemeDirectory: '',
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
      inspect: vi.fn((key: string) => {
        if (key === 'previewThemeDirectory') {
          return { globalValue: vscodeState.previewThemeDirectory };
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
    file: (fsPath: string) => ({ fsPath, scheme: 'file' }),
    joinPath: (base: { fsPath: string; scheme?: string }, ...parts: string[]) => ({
      fsPath: path.join(base.fsPath, ...parts),
      scheme: base.scheme ?? 'file',
    }),
  },
}));

import { getBundledPreviewThemeDirectory, getPreviewThemeDirectories } from '../../src/presentation/previewThemeSupport';

function createThemeFile(directory: string, fileName: string, name: string): string {
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, fileName);
  fs.writeFileSync(filePath, JSON.stringify({ name, tokens: {} }), 'utf8');
  return filePath;
}

describe('previewThemeSupport', () => {
  it('includes only the bundled presentation theme directory when Pro is not installed', () => {
    const extensionUri = { fsPath: 'C:/extension-root', scheme: 'file' };
    const documentUri = { fsPath: 'C:/workspace/slides/deck.md', scheme: 'file' };
    const bundledPreviewThemeDirectory = path.join(extensionUri.fsPath, 'assets', 'preview', 'themes', 'presentation');

    expect(getBundledPreviewThemeDirectory(extensionUri as never)).toBe(bundledPreviewThemeDirectory);
    expect(getPreviewThemeDirectories(extensionUri as never, documentUri as never)).toEqual([bundledPreviewThemeDirectory]);
  });

  it('includes workspace and global presentation theme directories when Pro is installed', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mads-workspace-'));
    const globalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mads-global-pres-'));
    const workspaceThemeDir = path.join(workspaceRoot, '.markdown-ai-studio', 'presentation-themes');
    const globalThemeDir = path.join(globalRoot, 'presentation-themes');
    const documentUri = { fsPath: path.join(workspaceRoot, 'slides', 'deck.md'), scheme: 'file' };
    const extensionUri = { fsPath: path.join(workspaceRoot, 'fake-extension-root'), scheme: 'file' };

    vscodeState.workspaceRoot = workspaceRoot;
    vscodeState.previewThemeDirectory = globalRoot;
    vscodeState.proInstalled = true;

    createThemeFile(workspaceThemeDir, 'workspace-theme.json', 'workspace-theme');
    createThemeFile(globalThemeDir, 'global-theme.json', 'global-theme');

    const directories = getPreviewThemeDirectories(extensionUri as never, documentUri as never);

    expect(directories).toContain(path.normalize(globalThemeDir));
    expect(directories).toContain(path.normalize(workspaceThemeDir));
    expect(directories[directories.length - 1]).toBe(path.normalize(workspaceThemeDir));
  });
});
