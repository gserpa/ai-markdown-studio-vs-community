import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscodeMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  openTextDocument: vi.fn(),
  openExternal: vi.fn(),
  showTextDocument: vi.fn(),
}));

vi.mock('vscode', () => {
  const uriFactory = (fsPath: string, scheme = 'file') => ({
    fsPath,
    scheme,
    fragment: '',
    toString: () => scheme === 'file' ? `file:///${fsPath.replace(/\\/gu, '/')}` : fsPath,
    with: ({ fragment }: { fragment?: string }) => ({
      fsPath,
      scheme,
      fragment: fragment ?? '',
      toString: () => scheme === 'file' ? `file:///${fsPath.replace(/\\/gu, '/')}` : fsPath,
    }),
  });

  return {
    commands: {
      executeCommand: vscodeMocks.executeCommand,
    },
    env: {
      openExternal: vscodeMocks.openExternal,
    },
    window: {
      showTextDocument: vscodeMocks.showTextDocument,
    },
    workspace: {
      openTextDocument: vscodeMocks.openTextDocument,
      getConfiguration: vi.fn(() => ({
        get: vi.fn((_key: string, fallback: unknown) => fallback),
      })),
      fs: {
        readFile: vi.fn(),
      },
    },
    Uri: {
      file: vi.fn((fsPath: string) => uriFactory(fsPath)),
      parse: vi.fn((value: string) => uriFactory(value.replace(/^file:\/\/\//u, ''))),
      joinPath: vi.fn((base: { fsPath: string }, ...segments: string[]) => uriFactory([base.fsPath, ...segments].join('/'))),
    },
  };
});

vi.mock('../../src/panel/previewHtmlBuilder', () => ({
  buildPreviewHtml: vi.fn(() => '<html><body>preview</body></html>'),
  getPreviewTitle: vi.fn(() => 'Preview: example.md'),
}));

import * as vscode from 'vscode';
import { MarkdownPreviewCustomEditor } from '../../src/panel/MarkdownPreviewCustomEditor';

describe('MarkdownPreviewCustomEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not pin Explorer preview tabs while resolving the custom editor', async () => {
    const extensionUri = vscode.Uri.file('C:/extension');
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    const textDocument = {
      uri: documentUri,
      fileName: documentUri.fsPath,
      languageId: 'markdown',
      getText: () => '# Example',
    };
    vscodeMocks.openTextDocument.mockResolvedValue(textDocument);

    const editor = new MarkdownPreviewCustomEditor(extensionUri);
    const webviewPanel = createWebviewPanel();

    await editor.resolveCustomEditor({ uri: documentUri, dispose: vi.fn() }, webviewPanel as never, {} as never);

    expect(vscodeMocks.executeCommand).not.toHaveBeenCalledWith('workbench.action.keepEditor');
    expect(vscodeMocks.executeCommand).not.toHaveBeenCalled();
    expect(webviewPanel.title).toBe('Preview: example.md');
    expect(webviewPanel.webview.html).toContain('preview');
  });

  it('opens empty Markdown files directly in the text editor', async () => {
    const extensionUri = vscode.Uri.file('C:/extension');
    const documentUri = vscode.Uri.file('C:/workspace/empty.md');
    const textDocument = {
      uri: documentUri,
      fileName: documentUri.fsPath,
      languageId: 'markdown',
      getText: () => ' \n\t',
    };
    vscodeMocks.openTextDocument.mockResolvedValue(textDocument);

    const editor = new MarkdownPreviewCustomEditor(extensionUri);
    const webviewPanel = createWebviewPanel();

    await editor.resolveCustomEditor({ uri: documentUri, dispose: vi.fn() }, webviewPanel as never, {} as never);

    expect(webviewPanel.dispose).toHaveBeenCalledOnce();
    expect(vscodeMocks.showTextDocument).toHaveBeenCalledWith(textDocument, { preview: false });
    expect(webviewPanel.webview.html).toBe('');
  });
});

function createWebviewPanel() {
  return {
    title: '',
    webview: {
      options: {},
      html: '',
      asWebviewUri: vi.fn((uri: { toString: () => string }) => uri),
      onDidReceiveMessage: vi.fn(),
      postMessage: vi.fn(),
    },
    onDidChangeViewState: vi.fn(),
    onDidDispose: vi.fn(),
    dispose: vi.fn(),
  };
}
