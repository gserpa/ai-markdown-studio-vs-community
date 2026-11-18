import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { readReviewComments, writeReviewComments, type ReviewComment } from '@mfo/core';

const mock = vi.hoisted(() => ({
  commands: new Map<string, (...args: any[]) => Promise<void>>(),
  disposable: () => ({ dispose() {} }),
  document: {
    version: 1, languageId: 'markdown', getText: vi.fn(), uri: undefined as unknown,
    isClosed: false, isDirty: false, positionAt: vi.fn((offset: number) => offset), save: vi.fn(),
  },
  openDocument: vi.fn(),
  applyEdit: vi.fn(),
  treeProvider: vi.fn(),
  clipboard: vi.fn(),
  choose: vi.fn(),
  showInfo: vi.fn(),
  showWarning: vi.fn(),
  showError: vi.fn(),
  withProgress: vi.fn(),
  getAiAccessState: vi.fn(),
  hasAccount: vi.fn(),
  consent: vi.fn(),
  generate: vi.fn(),
  available: vi.fn(),
}));
vi.mock('vscode', () => ({
  workspace: {
    openTextDocument: mock.openDocument,
    applyEdit: mock.applyEdit,
    onDidChangeConfiguration: mock.disposable,
    onDidChangeTextDocument: mock.disposable,
    registerTextDocumentContentProvider: mock.disposable,
  },
  commands: {
    executeCommand: vi.fn(),
    registerCommand: (id: string, action: (...args: any[]) => Promise<void>) => {
      mock.commands.set(id, action);
      return mock.disposable();
    },
  },
  env: { clipboard: { writeText: mock.clipboard } },
  authentication: { onDidChangeSessions: mock.disposable },
  window: {
    showQuickPick: mock.choose,
    registerTreeDataProvider: mock.treeProvider,
    onDidChangeActiveTextEditor: mock.disposable,
    onDidChangeActiveColorTheme: mock.disposable,
    showInformationMessage: mock.showInfo,
    showWarningMessage: mock.showWarning,
    showErrorMessage: mock.showError,
    withProgress: mock.withProgress,
    tabGroups: {
      activeTabGroup: {},
      onDidChangeTabs: mock.disposable,
      onDidChangeTabGroups: mock.disposable,
    },
  },
  EventEmitter: class { event() {} fire() {} dispose() {} },
  TreeItem: class { constructor(public label: string) {} },
  TreeItemCollapsibleState: { None: 0 },
  ProgressLocation: { Notification: 1 },
  WorkspaceEdit: class {
    change?: { range: { start: number; end: number }; text: string };
    replace(_uri: unknown, range: { start: number; end: number }, text: string) { this.change = { range, text }; }
  },
  Range: class { constructor(public start: number, public end: number) {} },
  CancellationError: class extends Error {},
  Disposable: { from: mock.disposable },
}));
vi.mock('../src/ai/aiConsent', () => ({
  areAiFeaturesEnabled: () => false,
  getAiAccessState: mock.getAiAccessState,
  ensureAiFeaturesEnabled: mock.consent,
  isAiAuthorizationDenied: () => mock.getAiAccessState() === 'denied',
}));
vi.mock('../src/ai/copilotAvailability', () => ({ hasConfiguredCopilotAccount: mock.hasAccount }));
vi.mock('../src/ai/languageModel', () => ({ generateTextWithLanguageModel: mock.generate, isLanguageModelAvailable: mock.available }));

import { applyReplacements, attachReviewPreview, registerReviewWorkflow, updateComments } from '../src/review/reviewWorkflow';

const markdown = '# Document\n\nPassage for review.\n';
const start = markdown.indexOf('Passage for review.');
const open: ReviewComment = {
  id: '1', range: { start, end: start + 'Passage for review.'.length },
  includeInAi: true, state: 'open', body: 'Make the passage clearer.',
};
const uri = { scheme: 'file', toString: () => 'file:///review.md' };
const run = (id: string, ...args: unknown[]) => mock.commands.get('markdownAiStudio.' + id)!(...args);

describe('review command AI access and prompt copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.commands.clear();
    mock.document.version = 1;
    mock.document.uri = uri;
    mock.openDocument.mockResolvedValue(mock.document);
    mock.treeProvider.mockReturnValue(mock.disposable());
    mock.document.save.mockResolvedValue(true);
    mock.showInfo.mockResolvedValue(undefined);
    mock.showWarning.mockResolvedValue(undefined);
    mock.getAiAccessState.mockReturnValue('denied');
    mock.hasAccount.mockResolvedValue(true);
    mock.available.mockResolvedValue(true);
    mock.document.getText.mockReturnValue(writeReviewComments(markdown, [
      open,
      { ...open, id: '2', includeInAi: false, body: 'Private manual note' },
      { ...open, id: '3', state: 'resolved', body: 'Previously resolved note' },
      { ...open, id: '4', range: undefined, body: 'Detached note' },
    ]));
    registerReviewWorkflow(() => uri as never);
  });

  it('contributes comment and bulk actions to the sidebar menus', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const menus = manifest.contributes.menus;
    const commands = (name: string) => menus[name].map((item: { command: string }) => item.command);
    expect(commands('view/item/context')).toEqual(expect.arrayContaining([
      'markdownAiStudio.revealReviewComment', 'markdownAiStudio.resolveReviewComment',
      'markdownAiStudio.removeReviewComment', 'markdownAiStudio.selectReviewCommentForAi',
      'markdownAiStudio.selectReviewCommentForManual', 'markdownAiStudio.implementSelectedReviews',
      'markdownAiStudio.clearResolvedReviewComments', 'markdownAiStudio.clearAllReviewComments',
    ]));
    expect(commands('view/title')).toEqual(expect.arrayContaining([
      'markdownAiStudio.implementSelectedReviews', 'markdownAiStudio.clearResolvedReviewComments',
      'markdownAiStudio.clearAllReviewComments',
    ]));
  });

  describe('review replacements', () => {
    it('replaces only the selected source and keeps the comment attached', () => {
      const source = 'Before selected text after.\n';
      const start = source.indexOf('selected text');
      const saved = writeReviewComments(source, [{
        id: '1', body: 'Clarify.', state: 'open', includeInAi: true,
        range: { start, end: start + 'selected text'.length },
      }]);
      const revised = applyReplacements(saved, [{ id: '1', original: 'Before selected text', text: 'Earlier clearer words', anchor: 'clearer words' }]);
      expect(revised).toContain('Earlier <!--review:1-->clearer words<!--/review:1--> after.');
      expect(revised).toContain('  - 1: "Clarify."');
    });

    it('rejects replacements that overlap other comments', () => {
      const source = 'Before selected text after.\n';
      const start = source.indexOf('selected text');
      const saved = writeReviewComments(source, [
        { id: '1', body: 'Clarify.', state: 'open', includeInAi: true, range: { start, end: start + 13 } },
        { id: '2', body: 'Check.', state: 'open', includeInAi: true, range: { start: start + 2, end: start + 6 } },
      ]);
      expect(() => applyReplacements(saved, [{ id: '1', original: 'selected text', text: 'clearer words', anchor: 'words' }])).toThrow('Overlapping review comments');
    });

    it('applies separate contextual edits and retains both anchors with CRLF', () => {
      const source = 'First selected text ends.\r\n\r\nSecond target text ends.\r\n';
      const first = source.indexOf('selected text');
      const second = source.indexOf('target text');
      const saved = writeReviewComments(source, [
        { id: '1', body: 'Clarify.', state: 'open', includeInAi: true, range: { start: first, end: first + 13 } },
        { id: '2', body: 'Improve.', state: 'open', includeInAi: true, range: { start: second, end: second + 11 } },
      ]);
      const revised = applyReplacements(saved, [
        { id: '1', original: 'First selected text', text: 'Earlier clear wording', anchor: 'clear wording' },
        { id: '2', original: 'Second target text', text: 'Another improved passage', anchor: 'improved passage' },
      ]);
      const result = readReviewComments(revised);
      expect(result.markdown).toContain('Earlier clear wording ends.\r\n\r\nAnother improved passage ends.');
      expect(result.comments.map(item => result.markdown.slice(item.range!.start, item.range!.end)))
        .toEqual(['clear wording', 'improved passage']);
    });
  });

  it('resolves and reopens without deleting, and deletes only on request', () => {
    const preview = { version: 1, blocks: [] };
    const resolved = updateComments(markdown, [{ ...open }], preview, { action: 'resolve', id: '1' });
    expect(resolved).toEqual([{ ...open, state: 'resolved' }]);
    const saved = writeReviewComments(markdown, resolved);
    expect(saved).toContain('state: resolved');
    expect(saved).toContain('<!--review:1-->');
    const reopened = updateComments(markdown, readReviewComments(saved).comments, preview, { action: 'reopen', id: '1' });
    expect(reopened[0].state).toBe('open');
    const deleted = updateComments(markdown, reopened, preview, { action: 'delete', id: '1' });
    expect(deleted).toEqual([]);
    expect(writeReviewComments(saved, deleted)).not.toContain('review:1');
  });

  it('applies an edited comment and its action in one update', () => {
    const preview = { version: 1, blocks: [] };
    for (const [action, initial, expected] of [
      ['resolve', 'open', 'resolved'],
      ['reopen', 'resolved', 'open'],
    ] as const) {
      const result = updateComments(markdown, [{ ...open, state: initial }], preview, {
        action: 'edit', id: '1', body: 'Updated comment', includeInAi: false, afterEdit: action,
      });
      expect(result).toEqual([{ ...open, body: 'Updated comment', includeInAi: false, state: expected }]);
    }
    expect(updateComments(markdown, [{ ...open }], preview, {
      action: 'edit', id: '1', body: 'Updated comment', afterEdit: 'delete',
    })).toEqual([]);
    expect(() => updateComments(markdown, [{ ...open }], preview, {
      action: 'edit', id: '1', body: ' ', afterEdit: 'delete',
    })).toThrow('Enter a comment');
  });

  it('restores reattachment after a preview reload only after the edit succeeds', async () => {
    let receive!: (request: unknown) => Promise<void>;
    let dispose!: () => void;
    const postMessage = vi.fn().mockResolvedValue(true);
    const panel = {
      active: false,
      webview: { postMessage, onDidReceiveMessage: (callback: typeof receive) => { receive = callback; return mock.disposable(); } },
      onDidChangeViewState: mock.disposable,
      onDidDispose: (callback: () => void) => { dispose = callback; },
    };
    const preview = { getReviewPage: () => {
      const source = readReviewComments(mock.document.getText()).markdown;
      const line = source.slice(0, source.indexOf('Passage for review.')).split('\n').length;
      return { version: 1, blocks: [{ id: '0', text: 'Passage for review.', startLine: line, endLine: line }] };
    } };
    attachReviewPreview(panel as never, preview as never, () => mock.document as never);
    const request = {
      command: 'previewReview', sessionId: 'session', version: 1, requestId: 1,
      action: 'edit', id: '1', body: 'Updated comment', afterEdit: 'reattach',
    };
    mock.applyEdit.mockResolvedValueOnce(false);
    await receive(request);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ command: 'reviewResult', error: expect.any(String) }));
    await receive({ command: 'previewReview', action: 'ready' });
    expect(postMessage).not.toHaveBeenCalledWith({ command: 'beginReviewReattach', id: '1' });
    mock.applyEdit.mockResolvedValueOnce(true);
    await receive(request);
    expect(postMessage).toHaveBeenCalledWith({ command: 'beginReviewReattach', id: '1' });
    postMessage.mockClear();
    await receive({ command: 'previewReview', action: 'ready' });
    expect(postMessage).toHaveBeenCalledWith({ command: 'beginReviewReattach', id: '1' });
    mock.applyEdit.mockResolvedValueOnce(true);
    await receive({ ...request, action: 'reattach', selection: [{ id: '0', start: 0, end: 7 }] });
    expect(postMessage).toHaveBeenLastCalledWith({ command: 'reviewResult', requestId: 1 });
    postMessage.mockClear();
    await receive({ command: 'previewReview', action: 'ready' });
    expect(postMessage).not.toHaveBeenCalledWith({ command: 'beginReviewReattach', id: '1' });
    mock.applyEdit.mockResolvedValueOnce(true);
    await receive(request);
    await receive({ command: 'previewReview', action: 'cancelReattach' });
    postMessage.mockClear();
    await receive({ command: 'previewReview', action: 'ready' });
    expect(postMessage).not.toHaveBeenCalledWith({ command: 'beginReviewReattach', id: '1' });
    dispose();
  });

  describe('sidebar actions', () => {
    const provider = () => mock.treeProvider.mock.calls.at(-1)![1] as {
      getChildren(): Promise<Array<{ comment: ReviewComment }>>;
      getTreeItem(entry: unknown): { contextValue: string; description: string };
    };
    const entry = async (id: string) => (await provider().getChildren()).find(item => item.comment.id === id)!;

    beforeEach(() => {
      let text = mock.document.getText();
      mock.document.getText.mockImplementation(() => text);
      mock.applyEdit.mockImplementation(async (edit: { change: { range: { start: number; end: number }; text: string } }) => {
        const { range, text: replacement } = edit.change;
        text = text.slice(0, range.start) + replacement + text.slice(range.end);
        mock.document.version++;
        return true;
      });
    });

    it('reveals the selected comment in its originating preview', async () => {
      const postMessage = vi.fn().mockResolvedValue(true);
      const reveal = vi.fn();
      let dispose: (() => void) | undefined;
      const panel = {
        active: false, viewColumn: 1, reveal,
        webview: { postMessage, onDidReceiveMessage: mock.disposable },
        onDidChangeViewState: mock.disposable,
        onDidDispose: (callback: () => void) => { dispose = callback; },
      };
      attachReviewPreview(panel as never, {} as never, () => mock.document as never);
      await run('revealReviewComment', await entry('1'));
      expect(reveal).toHaveBeenCalledWith(1, true);
      expect(postMessage).toHaveBeenCalledWith({ command: 'revealReviewComment', id: '1' });
      dispose?.();
    });

    it('toggles AI selection, resolves and reopens, then removes only the chosen comment', async () => {
      expect(provider().getTreeItem(await entry('1')).contextValue).toBe('reviewCommentOpenAi');
      await run('selectReviewCommentForManual', await entry('1'));
      expect(readReviewComments(mock.document.getText()).comments[0].includeInAi).toBe(false);
      expect(provider().getTreeItem(await entry('1')).contextValue).toBe('reviewCommentOpenManual');
      expect(provider().getTreeItem(await entry('1')).description).toContain('Manual');
      await run('selectReviewCommentForAi', await entry('1'));
      await run('resolveReviewComment', await entry('1'));
      expect(provider().getTreeItem(await entry('1')).contextValue).toBe('reviewCommentResolvedAi');
      await run('reopenReviewComment', await entry('1'));
      expect(readReviewComments(mock.document.getText()).comments[0].state).toBe('open');
      await run('removeReviewComment', await entry('1'));
      expect(readReviewComments(mock.document.getText()).comments.map(item => item.id)).toEqual(['2', '3', '4']);
    });

    it.each(['context menu', 'view title'])('clears only resolved comments from the %s', async menu => {
      await run('clearResolvedReviewComments', ...(menu === 'context menu' ? [await entry('1')] : []));
      const source = mock.document.getText();
      expect(readReviewComments(source).comments.map(item => item.id)).toEqual(['1', '2', '4']);
      expect(source).toContain('<!--review:1-->');
      expect(source).not.toContain('<!--review:3-->');
      expect(mock.showWarning).not.toHaveBeenCalled();
    });

    it('confirms clearing all and preserves comments when cancelled', async () => {
      const before = mock.document.getText();
      await run('clearAllReviewComments', await entry('1'));
      expect(mock.showWarning).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ modal: true }), 'Clear All');
      expect(mock.document.getText()).toBe(before);
      mock.showWarning.mockResolvedValue('Clear All');
      await run('clearAllReviewComments', await entry('1'));
      expect(readReviewComments(mock.document.getText()).comments).toEqual([]);
      expect(mock.document.getText()).not.toContain('<!--review:');
    });

    it('does not apply a stale menu action or a confirmation against changed text', async () => {
      const stale = await entry('1');
      mock.document.version++;
      await run('removeReviewComment', stale);
      expect(mock.showError).toHaveBeenCalledWith(expect.stringContaining('changed'));
      mock.showWarning.mockImplementation(async () => { mock.document.version++; return 'Clear All'; });
      await run('clearAllReviewComments', await entry('1'));
      expect(readReviewComments(mock.document.getText()).comments).toHaveLength(4);
      expect(mock.showError).toHaveBeenCalledWith(expect.stringContaining('changed'));
    });

    it('sends only AI-selected, open and attached comments to the integrated review', async () => {
      mock.getAiAccessState.mockReturnValue('ask');
      mock.consent.mockResolvedValue(true);
      mock.withProgress.mockImplementation(async (_options, task) => task({}, {}));
      mock.generate.mockRejectedValue(new Error('Stopped after capturing prompt'));
      await run('implementSelectedReviews', await entry('2'));
      const prompt = mock.generate.mock.calls[0][0];
      expect(prompt).toContain('Make the passage clearer.');
      expect(prompt).not.toMatch(/Private manual|Previously resolved|Detached note/u);
    });
  });

  it('copies only eligible comments without calling the integrated model', async () => {
    await run('copyReviewPrompt');
    const prompt = mock.clipboard.mock.calls[0][0];
    expect(prompt).toContain('Make the passage clearer.');
    expect(prompt).toContain('Passage for review.');
    expect(prompt).not.toMatch(/Private manual|Previously resolved|Detached note|markdown-ai-studio-review/u);
    expect(mock.hasAccount).not.toHaveBeenCalled();
    expect(mock.consent).not.toHaveBeenCalled();
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it('offers prompt copy as the review workflow when access is denied', async () => {
    await run('reviewComments');
    expect(mock.choose).not.toHaveBeenCalled();
    expect(mock.clipboard).toHaveBeenCalledOnce();
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it('copies the review prompt from the generation chooser', async () => {
    mock.getAiAccessState.mockReturnValue('ask');
    mock.choose.mockResolvedValue({ value: 'clipboard' });
    await run('reviewComments');
    expect(mock.clipboard).toHaveBeenCalledOnce();
    expect(mock.clipboard.mock.calls[0][0]).toContain('Make the passage clearer.');
    expect(mock.consent).not.toHaveBeenCalled();
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it('copies the prompt when no model is available', async () => {
    mock.available.mockResolvedValue(false);
    await run('reviewComments');
    expect(mock.clipboard).toHaveBeenCalledOnce();
    expect(mock.choose).not.toHaveBeenCalled();
    expect(mock.consent).not.toHaveBeenCalled();
  });

  it('asks for AI consent after the integrated option is selected', async () => {
    mock.getAiAccessState.mockReturnValue('ask');
    mock.choose.mockResolvedValue({ value: 'generate' });
    mock.consent.mockResolvedValue(false);
    await run('reviewComments');
    expect(mock.choose.mock.calls[0][0].map((option: { value: string }) => option.value)).toEqual(['generate', 'clipboard']);
    expect(mock.consent).toHaveBeenCalledOnce();
    expect(mock.generate).not.toHaveBeenCalled();
  });
});
