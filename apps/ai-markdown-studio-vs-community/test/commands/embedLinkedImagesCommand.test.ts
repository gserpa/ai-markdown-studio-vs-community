import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  open: vi.fn(), apply: vi.fn(), replace: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), load: vi.fn(),
}));
vi.mock('vscode', () => ({
  Uri: { file: (fsPath: string) => ({ fsPath, scheme: 'file', toString: () => 'file:///' + fsPath }) },
  Range: class { constructor(public start: unknown, public end: unknown) {} },
  WorkspaceEdit: class { replace = mocks.replace; },
  ProgressLocation: { Notification: 15 },
  workspace: { openTextDocument: mocks.open, applyEdit: mocks.apply, getConfiguration: () => ({ get: () => true }) },
  window: { showInformationMessage: mocks.info, showWarningMessage: mocks.warning, showErrorMessage: mocks.error,
    withProgress: (_options: unknown, task: () => Promise<unknown>) => task() },
}));
vi.mock('../../src/panel/MarkdownPreviewCustomEditor', () => ({ MarkdownPreviewCustomEditor: { getActiveDocumentUri: () => undefined } }));
vi.mock('../../src/panel/MarkdownPreviewPanel', () => ({ MarkdownPreviewPanel: { getActivePreviewDocumentUri: () => undefined } }));
vi.mock('../../src/images/imageDataUri', () => ({ imageDataUri: mocks.load }));
import * as vscode from 'vscode';
import { embedLinkedImagesCommand } from '../../src/commands/markdownCommands';

describe('embedLinkedImagesCommand', () => {
  const uri = vscode.Uri.file('C:/docs/images.md');
  let document: { uri: typeof uri; languageId: string; version: number; getText: () => string; positionAt: (offset: number) => number };
  beforeEach(() => {
    vi.clearAllMocks();
    document = { uri, languageId: 'markdown', version: 1, getText: () => '![Local](local.png)', positionAt: (offset) => offset };
    mocks.open.mockResolvedValue(document);
    mocks.apply.mockResolvedValue(true);
    mocks.load.mockResolvedValue('data:image/png;base64,AA==');
  });

  it('applies one undoable edit to the current Markdown document', async () => {
    await embedLinkedImagesCommand(uri);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.replace.mock.calls[0][2]).toBe('![Local](<data:image/png;base64,AA==>)');
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining('Embedded 1 image'));
  });

  it('does not overwrite edits made while an image is loading', async () => {
    mocks.load.mockImplementationOnce(async () => { document.version++; return 'data:image/png;base64,AA=='; });
    await embedLinkedImagesCommand(uri);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('Markdown changed'));
  });

  it('keeps failed images intact and reports their source', async () => {
    mocks.load.mockRejectedValueOnce(new Error('Image unavailable'));
    await embedLinkedImagesCommand(uri);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('local.png: Image unavailable'));
  });
});
