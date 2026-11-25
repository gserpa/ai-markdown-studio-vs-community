import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { readReviewComments, writeReviewComments, type ReviewComment } from '@mfo/core';
import { createReviewCommentActions } from '@mfo/review';

const mock = vi.hoisted(() => ({
  commands: new Map<string, (...args: any[]) => Promise<void>>(),
  executeCommand: vi.fn(),
  onDocumentChange: vi.fn(),
  onEditorChange: vi.fn(),
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
  showDocument: vi.fn(),
  activeTabGroup: { activeTab: undefined as unknown },
  Diff: class { constructor(public modified: unknown) {} },
}));
vi.mock('vscode', () => ({
  workspace: {
    openTextDocument: mock.openDocument,
    applyEdit: mock.applyEdit,
    onDidChangeTextDocument: mock.onDocumentChange,
    registerTextDocumentContentProvider: mock.disposable,
  },
  commands: {
    executeCommand: mock.executeCommand,
    registerCommand: (id: string, action: (...args: any[]) => Promise<void>) => {
      mock.commands.set(id, action);
      return mock.disposable();
    },
  },
  env: { clipboard: { writeText: mock.clipboard } },
  window: {
    showQuickPick: mock.choose,
    registerTreeDataProvider: mock.treeProvider,
    onDidChangeActiveTextEditor: mock.onEditorChange,
    onDidChangeActiveColorTheme: mock.disposable,
    showInformationMessage: mock.showInfo,
    showWarningMessage: mock.showWarning,
    showErrorMessage: mock.showError,
    showTextDocument: mock.showDocument,
    withProgress: mock.withProgress,
    tabGroups: {
      activeTabGroup: mock.activeTabGroup,
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
  TabInputTextDiff: mock.Diff,
  Uri: { from: () => ({ toString: () => 'review-base' }) },
  Disposable: { from: mock.disposable },
}));
vi.mock('../src/ai/aiConsent', () => ({
  getAiAccessState: mock.getAiAccessState,
  ensureAiFeaturesEnabled: mock.consent,
  isAiAuthorizationDenied: () => mock.getAiAccessState() === 'denied',
}));
vi.mock('../src/ai/copilotAvailability', () => ({ hasConfiguredCopilotAccount: mock.hasAccount }));
vi.mock('../src/ai/languageModel', () => ({ generateTextWithLanguageModel: mock.generate, isLanguageModelAvailable: mock.available }));

import { applyReplacements, attachReviewPreview, registerReviewWorkflow } from '../src/review/reviewWorkflow';
import { readPreviewSelection } from '../src/review/reviewPreview';

const updateComments = createReviewCommentActions(readPreviewSelection);
const markdown = '# Document\n\nPassage for review.\n';
const start = markdown.indexOf('Passage for review.');
const open: ReviewComment = {
  id: '1', range: { start, end: start + 'Passage for review.'.length },
  includeInAi: true, state: 'open', body: 'Make the passage clearer.',
};
const uri = { scheme: 'file', path: '/review.md', toString: () => 'file:///review.md' };
const run = (id: string, ...args: unknown[]) => mock.commands.get('markdownAiStudio.' + id)!(...args);

describe('review command AI access and prompt copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.commands.clear();
    mock.activeTabGroup.activeTab = undefined;
    mock.onDocumentChange.mockImplementation(mock.disposable);
    mock.onEditorChange.mockImplementation(mock.disposable);
    mock.document.version = 1;
    mock.document.isClosed = false;
    mock.document.isDirty = false;
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
    expect(manifest.contributes.commands).not.toContainEqual(expect.objectContaining({ command: 'markdownAiStudio.viewReviewComments' }));
    expect(manifest.contributes.commands).toContainEqual(expect.objectContaining({
      command: 'markdownAiStudio.toggleReviewComments', icon: expect.anything(),
    }));
    expect(menus['editor/title']).toContainEqual(expect.objectContaining({
      command: 'markdownAiStudio.toggleReviewComments',
      when: expect.stringContaining('markdownAiStudio.reviewHasComments'),
      group: 'navigation@2.9',
    }));
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

    it('combines overlapping comments into one revision with separate anchors', () => {
      const source = 'Before selected text after.\n';
      const start = source.indexOf('selected text');
      const saved = writeReviewComments(source, [
        { id: '1', body: 'Clarify.', state: 'open', includeInAi: true, range: { start, end: start + 13 } },
        { id: '2', body: 'Check.', state: 'open', includeInAi: true, range: { start: start + 2, end: start + 6 } },
      ]);
      const result = readReviewComments(applyReplacements(saved, [
        { id: '1', original: 'selected text', text: 'clearer words', anchor: 'clearer words' },
        { id: '2', original: 'selected text', text: 'clearer words', anchor: 'words' },
      ]));
      expect(result.markdown).toContain('Before clearer words after.');
      expect(result.comments.map(item => result.markdown.slice(item.range!.start, item.range!.end)))
        .toEqual(['clearer words', 'words']);
    });

    it('preserves unaddressed overlapping anchors when possible and detaches ambiguous ones', () => {
      const source = 'Before selected text after.\n';
      const start = source.indexOf('selected text');
      const saved = writeReviewComments(source, [
        { id: '1', body: 'Clarify.', state: 'open', includeInAi: true, range: { start, end: start + 13 } },
        { id: '2', body: 'Keep.', state: 'resolved', includeInAi: true, range: { start: start + 9, end: start + 13 } },
        { id: '3', body: 'Manual.', state: 'open', includeInAi: false, range: { start, end: start + 8 } },
        { id: '4', body: 'Surrounding.', state: 'open', includeInAi: false, range: { start: start - 7, end: start + 19 } },
      ]);
      const result = readReviewComments(applyReplacements(saved, [
        { id: '1', original: 'selected text', text: 'clearer text', anchor: 'clearer' },
      ]));
      expect(result.comments[1].state).toBe('resolved');
      expect(result.markdown.slice(result.comments[1].range!.start, result.comments[1].range!.end)).toBe('text');
      expect(result.comments[2].range).toBeUndefined();
      expect(result.markdown.slice(result.comments[3].range!.start, result.comments[3].range!.end)).toBe('Before clearer text after');
    });

    it('detaches an unaddressed anchor when its unchanged text is ambiguous', () => {
      const source = 'Before selected text after.\n';
      const start = source.indexOf('selected text');
      const saved = writeReviewComments(source, [
        { id: '1', body: 'Clarify.', state: 'open', includeInAi: true, range: { start, end: start + 13 } },
        { id: '2', body: 'Manual.', state: 'open', includeInAi: false, range: { start: start + 9, end: start + 13 } },
      ]);
      const result = readReviewComments(applyReplacements(saved, [
        { id: '1', original: 'selected text', text: 'text and text', anchor: 'and' },
      ]));
      expect(result.comments[1].range).toBeUndefined();
    });

    it('combines overlapping selections spanning more than one context window', () => {
      const source = Array.from({ length: 14 }, (_, index) => `Line ${index + 1}.\n`).join('');
      const first = source.indexOf('Line 2.');
      const middle = source.indexOf('Line 6.');
      const endFirst = source.indexOf('Line 8.') + 'Line 8.'.length;
      const endSecond = source.indexOf('Line 12.') + 'Line 12.'.length;
      const original = source.slice(first, endSecond);
      const saved = writeReviewComments(source, [
        { id: '1', body: 'Clarify.', state: 'open', includeInAi: true, range: { start: first, end: endFirst } },
        { id: '2', body: 'Improve.', state: 'open', includeInAi: true, range: { start: middle, end: endSecond } },
      ]);
      const result = readReviewComments(applyReplacements(saved, [
        { id: '1', original, text: 'Updated first section and second section.', anchor: 'first section' },
        { id: '2', original, text: 'Updated first section and second section.', anchor: 'second section' },
      ]));
      expect(result.markdown).toContain('Updated first section and second section.');
      expect(result.comments.map(item => result.markdown.slice(item.range!.start, item.range!.end)))
        .toEqual(['first section', 'second section']);
    });

    it('rejects conflicting overlapping edits without changing the source', () => {
      const source = 'Before selected text after.\n';
      const start = source.indexOf('selected text');
      const saved = writeReviewComments(source, [
        { id: '1', body: 'Clarify.', state: 'open', includeInAi: true, range: { start, end: start + 8 } },
        { id: '2', body: 'Check.', state: 'open', includeInAi: true, range: { start: start + 9, end: start + 13 } },
      ]);
      expect(() => applyReplacements(saved, [
        { id: '1', original: 'selected text', text: 'clearer words', anchor: 'clearer' },
        { id: '2', original: 'text after', text: 'words afterwards', anchor: 'words' },
      ])).toThrow('conflicting overlapping edits');
      expect(readReviewComments(saved).markdown).toContain(source);
    });

    it('requires confirmation before applying a revision that detaches another comment', async () => {
      const source = 'Before selected text after.\n';
      const start = source.indexOf('selected text');
      const original = writeReviewComments(source, [
        { id: '1', body: 'Clarify.', state: 'open', includeInAi: true, range: { start, end: start + 13 } },
        { id: '2', body: 'Manual.', state: 'open', includeInAi: false, range: { start, end: start + 8 } },
      ]);
      mock.document.getText.mockReturnValue(original);
      mock.getAiAccessState.mockReturnValue('ask');
      mock.consent.mockResolvedValue(true);
      mock.withProgress.mockImplementation(async (_options, task) => task({}, {}));
      mock.generate.mockResolvedValue(JSON.stringify({ replacements: [
        { id: '1', original: 'selected text', text: 'clearer words', anchor: 'clearer' },
      ] }));
      let modified: { uri: { toString: () => string }; getText: () => string } | undefined;
      mock.openDocument.mockImplementation(async (input: { content?: string }) => {
        if (typeof input.content !== 'string') return mock.document;
        modified = { uri: { toString: () => 'review-draft' }, getText: () => input.content! };
        return modified;
      });
      await run('runReviewComments');
      expect(modified).toBeDefined();
      mock.activeTabGroup.activeTab = { input: new mock.Diff(modified!.uri) };
      mock.choose.mockResolvedValue([{ id: '1' }]);
      await run('applyReviewRevision');
      expect(mock.showError).not.toHaveBeenCalled();
      expect(mock.showWarning).toHaveBeenCalledWith(
        expect.stringContaining('1 review comment will become detached'),
        expect.objectContaining({ modal: true }), 'Apply Anyway',
      );
      expect(mock.applyEdit).not.toHaveBeenCalled();
      mock.showWarning.mockResolvedValue('Apply Anyway');
      mock.applyEdit.mockResolvedValue(true);
      await run('applyReviewRevision');
      expect(mock.applyEdit).toHaveBeenCalledOnce();
      expect(mock.showError).not.toHaveBeenCalled();
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

  it('rejects a preview session that expires before the edit is applied', async () => {
    let receive!: (request: unknown) => Promise<void>;
    let dispose!: () => void;
    const postMessage = vi.fn().mockResolvedValue(true);
    const panel = {
      active: false,
      webview: { postMessage, onDidReceiveMessage: (callback: typeof receive) => { receive = callback; return mock.disposable(); } },
      onDidChangeViewState: mock.disposable,
      onDidDispose: (callback: () => void) => { dispose = callback; },
    };
    const updater = { getReviewPage: vi.fn().mockReturnValueOnce({ version: 1, blocks: [] }).mockReturnValueOnce(undefined) };
    attachReviewPreview(panel as never, updater as never, () => mock.document as never);
    await receive({ command: 'previewReview', sessionId: 'session', version: 1, requestId: 1, action: 'resolve', id: '1' });
    expect(mock.applyEdit).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ command: 'reviewResult', error: 'The preview changed. Select the text again.' }));
    dispose();
  });

  it('reopens a closed preview document to add a comment and uses the new document for subsequent actions', async () => {
    let receive!: (request: unknown) => Promise<void>;
    let dispose!: () => void;
    const postMessage = vi.fn().mockResolvedValue(true);
    const panel = {
      active: false,
      webview: { postMessage, onDidReceiveMessage: (callback: typeof receive) => { receive = callback; return mock.disposable(); } },
      onDidChangeViewState: mock.disposable,
      onDidDispose: (callback: () => void) => { dispose = callback; },
    };
    const oldDocument = { ...mock.document, version: 7, isClosed: true, getText: () => markdown };
    let currentText = markdown;
    const currentDocument = {
      ...mock.document, version: 1, isClosed: false, isDirty: true,
      getText: () => currentText,
    };
    mock.openDocument.mockResolvedValue(currentDocument);
    mock.applyEdit.mockImplementation(async (edit: { change: { range: { start: number; end: number }; text: string } }) => {
      const { range, text } = edit.change;
      currentText = currentText.slice(0, range.start) + text + currentText.slice(range.end);
      currentDocument.version += 1;
      return true;
    });
    const updater = { getReviewPage: vi.fn((_session: string, version: number) => ({
      version, blocks: [{ id: '0', text: 'Passage for review.', startLine: 3, endLine: 3 }],
    })) };
    attachReviewPreview(panel as never, updater as never, () => oldDocument as never);
    mock.openDocument.mockClear();
    await receive({ command: 'previewReview', sessionId: 'session', version: 7, requestId: 1, action: 'add',
      body: '', selection: [{ id: '0', start: 0, end: 7 }] });
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ error: 'Enter a comment of up to 20,000 characters.' }));
    await receive({ command: 'previewReview', sessionId: 'session', version: 7, requestId: 1, action: 'add',
      body: 'Clarify.', selection: [{ id: '0', start: 0, end: 7 }] });
    expect(postMessage).toHaveBeenLastCalledWith({ command: 'reviewResult', requestId: 1 });
    expect(readReviewComments(currentText).comments).toEqual([expect.objectContaining({ id: '1', body: 'Clarify.' })]);

    await receive({ command: 'previewReview', sessionId: 'session', version: 2, requestId: 2, action: 'resolve', id: '1' });
    expect(postMessage).toHaveBeenLastCalledWith({ command: 'reviewResult', requestId: 2 });
    expect(readReviewComments(currentText).comments[0].state).toBe('resolved');
    expect(mock.openDocument).toHaveBeenCalledTimes(1);
    currentDocument.isClosed = true;
    const reopenedAgain = { ...currentDocument, version: 1, isClosed: false };
    mock.openDocument.mockResolvedValue(reopenedAgain);
    await receive({ command: 'previewReview', sessionId: 'session', version: 3, requestId: 3, action: 'reopen', id: '1' });
    expect(postMessage).toHaveBeenLastCalledWith({ command: 'reviewResult', requestId: 3 });
    expect(readReviewComments(currentText).comments[0].state).toBe('open');
    dispose();
  });

  it('rejects a reopened document whose text no longer matches the preview snapshot', async () => {
    let receive!: (request: unknown) => Promise<void>;
    let dispose!: () => void;
    const postMessage = vi.fn().mockResolvedValue(true);
    const panel = {
      active: false,
      webview: { postMessage, onDidReceiveMessage: (callback: typeof receive) => { receive = callback; return mock.disposable(); } },
      onDidChangeViewState: mock.disposable,
      onDidDispose: (callback: () => void) => { dispose = callback; },
    };
    const oldDocument = { ...mock.document, isClosed: true, getText: () => markdown };
    mock.openDocument.mockResolvedValue({ ...mock.document, getText: () => `${markdown}Changed.` });
    const updater = { getReviewPage: vi.fn(() => ({ version: 1, blocks: [] })) };
    attachReviewPreview(panel as never, updater as never, () => oldDocument as never);
    await receive({ command: 'previewReview', sessionId: 'session', version: 1, requestId: 1, action: 'add', body: 'Clarify.' });
    expect(mock.applyEdit).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ error: 'The preview changed. Select the text again.' }));
    dispose();
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

  it('synchronizes visibility from the presentation panel with the title command and other previews', async () => {
    const receivers: Array<(request: unknown) => Promise<void>> = [];
    const disposers: Array<() => void> = [];
    const posts = [vi.fn().mockResolvedValue(true), vi.fn().mockResolvedValue(true)];
    for (const postMessage of posts) {
      const panel = {
        active: false,
        webview: {
          postMessage,
          onDidReceiveMessage: (callback: (request: unknown) => Promise<void>) => {
            receivers.push(callback);
            return mock.disposable();
          },
        },
        onDidChangeViewState: mock.disposable,
        onDidDispose: (callback: () => void) => { disposers.push(callback); },
      };
      attachReviewPreview(panel as never, {} as never, () => mock.document as never);
    }

    await receivers[0]({ command: 'previewReview', action: 'toggleVisibility', requestId: 7 });
    for (const post of posts) expect(post).toHaveBeenCalledWith({ command: 'reviewVisibility', visible: false });
    expect(posts[0]).toHaveBeenCalledWith({ command: 'reviewResult', requestId: 7 });
    posts[1].mockClear();
    await receivers[1]({ command: 'previewReview', action: 'ready' });
    expect(posts[1]).toHaveBeenCalledWith({ command: 'reviewVisibility', visible: false });
    await run('toggleReviewComments', uri);
    for (const post of posts) expect(post).toHaveBeenCalledWith({ command: 'reviewVisibility', visible: true });
    disposers.forEach(dispose => dispose());
  });

  it('runs the same review command for the originating presentation and rejects stale previews', async () => {
    let receive!: (request: unknown) => Promise<void>;
    let dispose!: () => void;
    const postMessage = vi.fn().mockResolvedValue(true);
    const panel = {
      active: false,
      webview: { postMessage, onDidReceiveMessage: (callback: typeof receive) => { receive = callback; return mock.disposable(); } },
      onDidChangeViewState: mock.disposable,
      onDidDispose: (callback: () => void) => { dispose = callback; },
    };
    const updater = { getReviewPage: vi.fn().mockReturnValueOnce({ version: 1, blocks: [] }).mockReturnValueOnce(undefined) };
    attachReviewPreview(panel as never, updater as never, () => mock.document as never);
    const request = { command: 'previewReview', sessionId: 'session', version: 1, requestId: 1, action: 'revise' };
    await receive(request);
    expect(mock.executeCommand).toHaveBeenCalledWith('markdownAiStudio.reviewComments', uri);
    expect(postMessage).toHaveBeenLastCalledWith({ command: 'reviewResult', requestId: 1 });
    mock.executeCommand.mockClear();
    await receive(request);
    expect(mock.executeCommand).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ error: 'The preview changed. Select the text again.' }));
    dispose();
  });

  it('updates title visibility for the active preview as comments change and previews switch', async () => {
    const callbacks: Array<(event: { webviewPanel: { active: boolean } }) => void> = [];
    const disposers: Array<() => void> = [];
    const uri2 = { scheme: 'file', toString: () => 'file:///other.md' };
    const other = { ...mock.document, uri: uri2, getText: () => markdown };
    mock.openDocument.mockImplementation(async (requested: typeof uri) => requested.toString() === uri2.toString() ? other : mock.document);
    for (const document of [mock.document, other]) {
      const panel = {
        active: false,
        webview: { postMessage: vi.fn(), onDidReceiveMessage: mock.disposable },
        onDidChangeViewState: (callback: typeof callbacks[number]) => { callbacks.push(callback); },
        onDidDispose: (callback: () => void) => { disposers.push(callback); },
      };
      attachReviewPreview(panel as never, {} as never, () => document as never);
    }
    const context = (key: string) => mock.executeCommand.mock.calls.filter(call => call[0] === 'setContext' && call[1] === key).at(-1)?.[2];
    callbacks[0]({ webviewPanel: { active: true } });
    await vi.waitFor(() => expect(context('markdownAiStudio.reviewHasComments')).toBe(true));
    expect(context('markdownAiStudio.reviewPending')).toBe(true);
    mock.document.getText.mockReturnValue(markdown);
    mock.onDocumentChange.mock.calls.at(-1)![0]();
    await vi.waitFor(() => expect(context('markdownAiStudio.reviewHasComments')).toBe(false));
    expect(context('markdownAiStudio.reviewPending')).toBe(false);
    mock.document.getText.mockReturnValue(writeReviewComments(markdown, [open]));
    callbacks[0]({ webviewPanel: { active: true } });
    await vi.waitFor(() => expect(context('markdownAiStudio.reviewHasComments')).toBe(true));
    callbacks[1]({ webviewPanel: { active: true } });
    callbacks[0]({ webviewPanel: { active: false } });
    await vi.waitFor(() => expect(context('markdownAiStudio.reviewHasComments')).toBe(false));
    expect(context('markdownAiStudio.reviewPending')).toBe(false);
    disposers.forEach(dispose => dispose());
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
    mock.getAiAccessState.mockReturnValue('ask');
    mock.choose.mockResolvedValue({ value: 'clipboard' });
    await run('reviewComments');
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

  it('directs unavailable integrated review to the remaining prompt-copy workflow', async () => {
    await run('runReviewComments');
    expect(mock.showError).toHaveBeenCalledWith(expect.stringContaining('AI: Revise from Comments'));
    expect(mock.clipboard).not.toHaveBeenCalled();
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
