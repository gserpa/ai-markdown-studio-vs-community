import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const vscodeMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  openTextDocument: vi.fn(),
  openExternal: vi.fn(),
  showTextDocument: vi.fn(),
  createWebviewPanel: vi.fn(),
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
      createWebviewPanel: vscodeMocks.createWebviewPanel,
    },
    ViewColumn: { Active: 1 },
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
  buildPreviewPage: vi.fn(() => ({ html: '<html><body>preview</body></html>', body: 'preview', mode: 'document', compatibilityKey: 'document', sessionId: 'session' })),
  getPreviewTitle: vi.fn(() => 'Preview: example.md'),
}));

import * as vscode from 'vscode';
import { MarkdownPreviewCustomEditor } from '../../src/panel/MarkdownPreviewCustomEditor';
import { MarkdownPreviewPanel } from '../../src/panel/MarkdownPreviewPanel';
import { buildPreviewPage } from '../../src/panel/previewHtmlBuilder';

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

  it('opens empty Markdown files in the text editor', async () => {
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

    expect(vscodeMocks.showTextDocument).toHaveBeenCalledWith(textDocument, { preview: false });
    expect(webviewPanel.dispose).toHaveBeenCalledOnce();
    expect(webviewPanel.webview.html).toBe('');
  });
});

function createWebviewPanel() {
  let receive: ((message: any) => Promise<void>) | undefined;
  let closed: (() => void) | undefined;
  return {
    receive: (message: unknown) => receive?.(message),
    title: '',
    webview: {
      options: {},
      html: '',
      asWebviewUri: vi.fn((uri: { toString: () => string }) => uri),
      onDidReceiveMessage: vi.fn(callback => { receive = callback; }),
      postMessage: vi.fn(async () => true),
    },
    onDidChangeViewState: vi.fn(),
    onDidDispose: vi.fn(callback => { closed = callback; }),
    dispose: vi.fn(() => closed?.()),
  };
}

describe.each(['panel', 'custom editor'] as const)('%s document updates', host => {
  afterEach(() => vi.useRealTimers());
  it('uses debounced patches and cancels pending rendering when the preview closes', async () => {
    vi.useFakeTimers();
    let source = 'Initial';
    const document = { uri: vscode.Uri.file('C:/docs/example.md'), fileName: 'example.md', getText: () => source };
    const panel = createWebviewPanel();
    vscodeMocks.createWebviewPanel.mockReturnValue(panel);
    vscodeMocks.openTextDocument.mockResolvedValue(document);
    vi.mocked(buildPreviewPage).mockImplementation(() => ({ html: `<html>${source}</html>`, body: source, mode: 'document', compatibilityKey: 'same', sessionId: 'session' }));
    const extensionUri = vscode.Uri.file('C:/extension');
    let refresh: () => Promise<void>;
    if (host === 'panel') {
      const preview = new MarkdownPreviewPanel(extensionUri, document as never, vi.fn());
      await preview.refresh();
      refresh = () => preview.refresh(document as never, true);
    } else {
      const preview = new MarkdownPreviewCustomEditor(extensionUri);
      await preview.resolveCustomEditor({ uri: document.uri, dispose() {} }, panel as never, {} as never);
      refresh = () => preview.refreshDocument(document as never, true);
    }
    await panel.receive({ command: 'previewReady', sessionId: 'session' });
    source = 'Latest edit';
    await refresh(); await refresh();
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(panel.webview.postMessage).toHaveBeenCalledExactlyOnceWith({ command: 'updateDocument', sessionId: 'session', revision: 1, body: 'Latest edit' });
    expect(panel.webview.html).toBe('<html>Initial</html>');
    await refresh();
    const renders = vi.mocked(buildPreviewPage).mock.calls.length;
    const pendingImage = panel.receive({ command: 'resolveImage', requestId: 'pending-image', src: 'missing.png' });
    panel.dispose();
    await pendingImage;
    vi.runAllTimers();
    expect(vi.mocked(buildPreviewPage).mock.calls.length).toBe(renders);
    expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
  });
});
