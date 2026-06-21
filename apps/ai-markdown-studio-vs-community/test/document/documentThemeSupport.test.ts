import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const vscodeState = vi.hoisted(() => ({
  documentThemeFolder: '',
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
        if (key === 'documentThemeFolder') {
          return { globalValue: vscodeState.documentThemeFolder };
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

import { getBundledDocumentThemeDirectory, getDocumentThemeDirectories } from '../../src/document/documentThemeSupport';

function createThemeFile(directory: string, fileName: string, name: string): string {
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, fileName);
  fs.writeFileSync(filePath, JSON.stringify({ name, tokens: {} }), 'utf8');
  return filePath;
}

describe('documentThemeSupport', () => {
  const originalUserProfile = process.env.USERPROFILE;

  beforeEach(() => {
    vscodeState.documentThemeFolder = '';
    vscodeState.workspaceRoot = '';
    vscodeState.proInstalled = false;
  });

  afterEach(() => {
    process.env.USERPROFILE = originalUserProfile;
  });

  it('includes only the bundled document theme directory when Pro is not installed', () => {
    const extensionUri = { fsPath: 'C:/extension-root', scheme: 'file' };
    const documentUri = { fsPath: 'C:/workspace/docs/example.md', scheme: 'file' };
    const bundledDocumentThemeDirectory = path.join(extensionUri.fsPath, 'assets', 'preview', 'themes', 'document');

    expect(getBundledDocumentThemeDirectory(extensionUri as never)).toBe(bundledDocumentThemeDirectory);
    expect(getDocumentThemeDirectories(extensionUri as never, documentUri as never)).toEqual([bundledDocumentThemeDirectory]);
  });

  it('includes workspace and global document theme directories when Pro is installed', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mads-workspace-'));
    const globalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mads-global-doc-'));
    const workspaceThemeDir = path.join(workspaceRoot, '.markdown-ai-studio', 'document-themes');
    const globalThemeDir = path.join(globalRoot, 'document-themes');
    const documentUri = { fsPath: path.join(workspaceRoot, 'docs', 'note.md'), scheme: 'file' };
    const extensionUri = { fsPath: path.join(workspaceRoot, 'fake-extension-root'), scheme: 'file' };

    vscodeState.workspaceRoot = workspaceRoot;
    vscodeState.documentThemeFolder = globalRoot;
    vscodeState.proInstalled = true;

    createThemeFile(workspaceThemeDir, 'workspace-theme.json', 'workspace-theme');
    createThemeFile(globalThemeDir, 'global-theme.json', 'global-theme');

    const directories = getDocumentThemeDirectories(extensionUri as never, documentUri as never);

    expect(directories).toContain(path.normalize(globalThemeDir));
    expect(directories).toContain(path.normalize(workspaceThemeDir));
    expect(directories[directories.length - 1]).toBe(path.normalize(workspaceThemeDir));
  });

  it('expands Windows environment variables in the global document theme folder', () => {
    const globalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mads-global-doc-'));
    const configuredRoot = path.join(globalRoot, 'AI Markdown Studio', 'Themes', 'Documents');
    const globalThemeDir = path.join(configuredRoot, 'document-themes');
    const extensionUri = { fsPath: 'C:/extension-root', scheme: 'file' };
    const documentUri = { fsPath: 'C:/workspace/docs/example.md', scheme: 'file' };

    vscodeState.documentThemeFolder = path.join('%userprofile%', 'AI Markdown Studio', 'Themes', 'Documents');
    vscodeState.workspaceRoot = '';
    vscodeState.proInstalled = true;
    process.env.USERPROFILE = globalRoot;

    createThemeFile(globalThemeDir, 'global-theme.json', 'global-theme');

    const directories = getDocumentThemeDirectories(extensionUri as never, documentUri as never);

    expect(directories).toContain(path.normalize(globalThemeDir));
  });
});
