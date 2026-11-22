import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const vscodeMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  openTextDocument: vi.fn(),
  showInformationMessage: vi.fn(),
  showTextDocument: vi.fn(),
  activeTabInput: undefined as unknown,
  activeTextEditor: undefined as { document: { uri: { fsPath: string } } } | undefined,
}));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vscodeMocks.executeCommand,
  },
  window: {
    tabGroups: { activeTabGroup: { get activeTab() { return { input: vscodeMocks.activeTabInput }; } } },
    get activeTextEditor() {
      return vscodeMocks.activeTextEditor;
    },
    showInformationMessage: vscodeMocks.showInformationMessage,
    showTextDocument: vscodeMocks.showTextDocument,
  },
  workspace: {
    openTextDocument: vscodeMocks.openTextDocument,
  },
  Uri: {
    file: vi.fn((fsPath: string) => ({ fsPath, scheme: 'file', toString: () => `file:///${fsPath.replace(/\\/gu, '/')}` })),
  },
  TabInputCustom: class {
    constructor(public uri: unknown, public viewType: string) {}
  },
  TabInputText: class {
    constructor(public uri: unknown) {}
  },
  ViewColumn: {
    Beside: -2,
  },
}));

import * as vscode from 'vscode';
import { editAsTextCommand, openNativeMarkdownEditorCommand, openPreviewCommand } from '../../src/commands/markdownCommands';
import { MarkdownPreviewCustomEditor } from '../../src/panel/MarkdownPreviewCustomEditor';

describe('openPreviewCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscodeMocks.activeTextEditor = undefined;
    vscodeMocks.activeTabInput = undefined;
  });

  it('opens the custom editor surface instead of the standalone preview panel', async () => {
    const extensionUri = vscode.Uri.file('C:/extension');
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    const textDocument = { uri: documentUri };
    vscodeMocks.openTextDocument.mockResolvedValue(textDocument);

    await openPreviewCommand(extensionUri, new Map(), documentUri);

    expect(vscodeMocks.openTextDocument).toHaveBeenCalledWith(documentUri);
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith('vscode.openWith', documentUri, MarkdownPreviewCustomEditor.viewType, {
      preview: false,
    });
  });

  it('reopens the active text tab as the studio preview', async () => {
    const extensionUri = vscode.Uri.file('C:/extension');
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    vscodeMocks.activeTextEditor = {
      document: {
        uri: documentUri,
      },
    };
    vscodeMocks.activeTabInput = new vscode.TabInputText(documentUri);
    vscodeMocks.openTextDocument.mockResolvedValue({ uri: documentUri });

    await openPreviewCommand(extensionUri, new Map(), documentUri);

    expect(vscodeMocks.executeCommand).toHaveBeenCalledOnce();
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith('reopenActiveEditorWith', MarkdownPreviewCustomEditor.viewType);
  });

  it('shows a message when no markdown file is available', async () => {
    await openPreviewCommand(vscode.Uri.file('C:/extension'), new Map());
    expect(vscodeMocks.showInformationMessage).toHaveBeenCalledWith('Open a Markdown file to preview it.');
  });

  it('opens the native WYSIWYG Markdown editor for the selected document', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    vscodeMocks.openTextDocument.mockResolvedValue({ uri: documentUri, languageId: 'markdown' });

    await openNativeMarkdownEditorCommand(documentUri);

    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith('vscode.openWith', documentUri, 'vscode.markdown.editor', {
      preview: false,
    });
  });

  it('reopens the active native editor as Markdown source or studio preview', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    const otherUri = vscode.Uri.file('C:/workspace/other.md');
    vscodeMocks.activeTabInput = new vscode.TabInputCustom(documentUri, 'vscode.markdown.editor');
    vscodeMocks.activeTextEditor = { document: { uri: otherUri } };
    vscodeMocks.openTextDocument.mockResolvedValue({ uri: documentUri, languageId: 'markdown' });
    await editAsTextCommand();
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith('reopenActiveEditorWith', 'default');

    await openPreviewCommand(vscode.Uri.file('C:/extension'), new Map());
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith('reopenActiveEditorWith', MarkdownPreviewCustomEditor.viewType);
    expect(vscodeMocks.showTextDocument).not.toHaveBeenCalled();
  });

  it('reopens the active studio preview as the native editor or Markdown source', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    vscodeMocks.activeTabInput = new vscode.TabInputCustom(documentUri, MarkdownPreviewCustomEditor.viewType);
    vscodeMocks.openTextDocument.mockResolvedValue({ uri: documentUri, languageId: 'markdown' });

    await openNativeMarkdownEditorCommand(documentUri);
    await editAsTextCommand(documentUri);
    expect(vscodeMocks.executeCommand).toHaveBeenNthCalledWith(1, 'reopenActiveEditorWith', 'vscode.markdown.editor');
    expect(vscodeMocks.executeCommand).toHaveBeenNthCalledWith(2, 'reopenActiveEditorWith', 'default');
  });

  it('reopens the active source editor as the native editor', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    vscodeMocks.activeTabInput = new vscode.TabInputText(documentUri);
    vscodeMocks.openTextDocument.mockResolvedValue({ uri: documentUri, languageId: 'markdown' });

    await openNativeMarkdownEditorCommand(documentUri);
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith('reopenActiveEditorWith', 'vscode.markdown.editor');
  });

  it('does not reopen an active studio preview as itself', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    vscodeMocks.activeTabInput = new vscode.TabInputCustom(documentUri, MarkdownPreviewCustomEditor.viewType);
    vscodeMocks.openTextDocument.mockResolvedValue({ uri: documentUri, languageId: 'markdown' });
    await openPreviewCommand(vscode.Uri.file('C:/extension'), new Map(), documentUri);
    expect(vscodeMocks.executeCommand).not.toHaveBeenCalled();
  });

  it('leaves the active editor alone when switching a different Explorer resource', async () => {
    const selectedUri = vscode.Uri.file('C:/workspace/selected.md');
    const activeUri = vscode.Uri.file('C:/workspace/active.md');
    vscodeMocks.activeTabInput = new vscode.TabInputCustom(activeUri, 'vscode.markdown.editor');
    vscodeMocks.openTextDocument.mockResolvedValue({ uri: selectedUri, languageId: 'markdown' });
    await openPreviewCommand(vscode.Uri.file('C:/extension'), new Map(), selectedUri);
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith('vscode.openWith', selectedUri, MarkdownPreviewCustomEditor.viewType, { preview: false });
    expect(vscodeMocks.executeCommand).not.toHaveBeenCalledWith('reopenActiveEditorWith', expect.anything());
  });

  it('uses the selected Explorer resource for source editing', async () => {
    const selectedUri = vscode.Uri.file('C:/workspace/selected.md');
    const activeUri = vscode.Uri.file('C:/workspace/active.md');
    vscodeMocks.activeTabInput = new vscode.TabInputCustom(activeUri, 'vscode.markdown.editor');
    vscodeMocks.openTextDocument.mockResolvedValue({ uri: selectedUri, languageId: 'markdown' });
    await editAsTextCommand(selectedUri);
    expect(vscodeMocks.showTextDocument).toHaveBeenCalledWith(selectedUri, { preview: false });
  });

  it('keeps both editor commands in Explorer but only Document Editor in the title bar', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    const ids = ['markdownAiStudio.openNativeMarkdownEditor', 'markdownAiStudio.editAsText'];
    const commands = manifest.contributes.commands as Array<{ command: string; title: string; icon: string }>;
    expect(ids.map((id) => commands.find((entry) => entry.command === id)?.title)).toEqual(['Document Editor', 'Edit Markdown']);
    expect(commands.find((entry) => entry.command === ids[0])?.icon).toBe('$(pencil)');

    const titleEntries = (manifest.contributes.menus['editor/title'] as Array<{ command: string }>)
      .filter((entry) => ids.includes(entry.command));
    expect(titleEntries.map((entry) => entry.command)).toEqual([ids[0]]);
    const explorerEntries = (manifest.contributes.menus['explorer/context'] as Array<{ command: string; group: string; when: string }>)
      .filter((entry) => ids.includes(entry.command));
    expect(explorerEntries.map((entry) => entry.command)).toEqual(ids);
    expect(explorerEntries.map((entry) => entry.group)).toEqual(['navigation@1', 'navigation@2']);
    expect(explorerEntries.every((entry) => entry.when === 'resourceExtname == .md && !explorerResourceIsFolder')).toBe(true);

    const contextPreview = 'markdownAiStudio.openPreviewFromContext';
    expect(commands.find((entry) => entry.command === contextPreview)?.title).toBe('Open Preview');
    expect(manifest.contributes.menus['explorer/context']).toContainEqual({
      command: contextPreview, when: 'resourceExtname == .md && !explorerResourceIsFolder', group: 'navigation@0',
    });
    expect(manifest.contributes.menus['editor/title/context']).toContainEqual({
      command: contextPreview, when: 'resourceExtname == .md', group: '1_open@1',
    });
    expect(manifest.contributes.menus.commandPalette).toContainEqual({ command: contextPreview, when: 'false' });
  });
});
