import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscodeMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  openTextDocument: vi.fn(),
  showInformationMessage: vi.fn(),
  activeTextEditor: undefined as { document: { uri: { fsPath: string } } } | undefined,
}));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vscodeMocks.executeCommand,
  },
  window: {
    activeTextEditor: vscodeMocks.activeTextEditor,
    showInformationMessage: vscodeMocks.showInformationMessage,
  },
  workspace: {
    openTextDocument: vscodeMocks.openTextDocument,
  },
  Uri: {
    file: vi.fn((fsPath: string) => ({ fsPath, scheme: 'file' })),
  },
}));

import * as vscode from 'vscode';
import { openPreviewCommand } from '../../src/commands/markdownCommands';
import { MarkdownPreviewCustomEditor } from '../../src/panel/MarkdownPreviewCustomEditor';

describe('openPreviewCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the custom editor surface instead of the standalone preview panel', async () => {
    const extensionUri = vscode.Uri.file('C:/extension');
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    const textDocument = { uri: documentUri };
    vscodeMocks.openTextDocument.mockResolvedValue(textDocument);

    await openPreviewCommand(extensionUri, new Map(), documentUri);

    expect(vscodeMocks.openTextDocument).toHaveBeenCalledWith(documentUri);
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith('vscode.openWith', documentUri, MarkdownPreviewCustomEditor.viewType);
  });

  it('shows a message when no markdown file is available', async () => {
    await openPreviewCommand(vscode.Uri.file('C:/extension'), new Map());

    expect(vscodeMocks.showInformationMessage).toHaveBeenCalledWith('Open a Markdown file to preview it.');
  });
});
