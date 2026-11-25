import * as vscode from 'vscode';
import { readReviewComments, reviewRangeLines, writeReviewComments, type ReviewComment } from '@mfo/core';
import { createReviewActionHandler, isAiReviewEligible, setReviewCommentState, type ReviewRequest } from '@mfo/review';
import type { PreviewDocumentUpdater } from '../panel/PreviewDocumentUpdater';
import { readPreviewSelection } from './reviewPreview';

const reviewCommand = 'markdownAiStudio.reviewComments';
const reviewPanels = new Map<string, Set<vscode.WebviewPanel>>();
const hiddenReviewComments = new Set<string>();
let activeReviewUri: vscode.Uri | undefined;
let activeReviewPanel: vscode.WebviewPanel | undefined;
let refreshReviewView: (() => Promise<void>) | undefined;

type ReviewTreeEntry = {
  comment: ReviewComment;
  uri: vscode.Uri;
  document: vscode.TextDocument;
  version: number;
  location: string;
};

async function toggleReviewVisibility(key: string): Promise<void> {
  if (hiddenReviewComments.has(key)) hiddenReviewComments.delete(key);
  else hiddenReviewComments.add(key);
  for (const panel of reviewPanels.get(key) ?? []) {
    await panel.webview.postMessage({ command: 'reviewVisibility', visible: !hiddenReviewComments.has(key) });
  }
}

export function attachReviewPreview(
  panel: vscode.WebviewPanel, updater: PreviewDocumentUpdater, getDocument: () => vscode.TextDocument,
): void {
  const key = getDocument().uri.toString();
  const panels = reviewPanels.get(key) ?? new Set<vscode.WebviewPanel>();
  panels.add(panel);
  reviewPanels.set(key, panels);
  let pendingReattach: string | undefined;
  let reopenedDocument: vscode.TextDocument | undefined;
  let reopenedSnapshot: { documentVersion: number; previewVersion: number; markdown: string } | undefined;
  const messageSubscription = panel.webview.onDidReceiveMessage(async (request: ReviewRequest) => {
    if (request?.command !== 'previewReview') return;
    if (request.action === 'ready') {
      await panel.webview.postMessage({ command: 'reviewVisibility', visible: !hiddenReviewComments.has(key) });
      if (pendingReattach) await panel.webview.postMessage({ command: 'beginReviewReattach', id: pendingReattach });
      return;
    }
    if (request.action === 'cancelReattach') {
      pendingReattach = undefined;
      return;
    }
    const result = { command: 'reviewResult', requestId: request.requestId };
    try {
      if (request.action === 'toggleVisibility') {
        await toggleReviewVisibility(key);
      } else {
        const previewDocument = getDocument();
        const snapshotDocument = previewDocument.isClosed && reopenedDocument ? reopenedDocument : previewDocument;
        const markdown = snapshotDocument.getText();
        // Reopening can reset VS Code's version even when the preview content is unchanged.
        const snapshotVersion = snapshotDocument === reopenedDocument && reopenedSnapshot
          && snapshotDocument.version === reopenedSnapshot.documentVersion
          && request.version === reopenedSnapshot.previewVersion && markdown === reopenedSnapshot.markdown
          ? reopenedSnapshot.previewVersion : snapshotDocument.version;
        const document = snapshotDocument.isClosed
          ? await vscode.workspace.openTextDocument(snapshotDocument.uri) : snapshotDocument;
        if (document.isClosed || document.getText() !== markdown) {
          throw new Error('The preview changed. Select the text again.');
        }
        if (document !== snapshotDocument) {
          reopenedDocument = document;
          reopenedSnapshot = { documentVersion: document.version, previewVersion: snapshotVersion, markdown };
        }
        const documentVersion = document.version;
        const sessionId = request.sessionId;
        const preview = typeof sessionId === 'string' && request.version === snapshotVersion
          ? updater.getReviewPage(sessionId, snapshotVersion) : undefined;
        if (!preview || typeof sessionId !== 'string') throw new Error('The preview changed. Select the text again.');
        if (request.action === 'revise') {
          if (!Number.isSafeInteger(request.requestId) || !request.requestId || request.requestId < 1) {
            throw new Error('Invalid review action.');
          }
          await vscode.commands.executeCommand(reviewCommand, document.uri);
        } else {
          await applyReviewAction({
            markdown, version: snapshotVersion, sessionId, preview,
          }, request, async (updated, expectedVersion, expectedSessionId) => {
            if (!updater.getReviewPage(expectedSessionId, expectedVersion)) {
              throw new Error('The preview changed. Select the text again.');
            }
            if (document.isClosed || document.version !== documentVersion || document.getText() !== markdown) {
              throw new Error('The Markdown changed. Try the review action again.');
            }
            await replaceDocument(document, documentVersion, updated, true);
            return true;
          });
        }
        if (request.action === 'edit') pendingReattach = request.afterEdit === 'reattach' ? request.id : undefined;
        else if (request.action === 'reattach') pendingReattach = undefined;
      }
      await panel.webview.postMessage(result);
      if (request.action === 'edit' && pendingReattach) {
        await panel.webview.postMessage({ command: 'beginReviewReattach', id: pendingReattach });
      }
    } catch (error) {
      await panel.webview.postMessage({ ...result, error: errorMessage(error) });
    }
  });
  panel.onDidChangeViewState(event => {
    if (event.webviewPanel.active) {
      activeReviewPanel = panel;
      activeReviewUri = getDocument().uri;
    } else if (activeReviewPanel === panel) {
      activeReviewPanel = undefined;
      activeReviewUri = undefined;
    }
    queueMicrotask(() => { void refreshReviewView?.(); });
  });
  if (panel.active) {
    activeReviewPanel = panel;
    activeReviewUri = getDocument().uri;
    void refreshReviewView?.();
  }
  panel.onDidDispose(() => {
    panels.delete(panel);
    if (!panels.size) {
      reviewPanels.delete(key);
    }
    if (activeReviewPanel === panel) {
      activeReviewPanel = undefined;
      activeReviewUri = undefined;
    }
    void refreshReviewView?.();
    messageSubscription.dispose();
  });
}

const applyReviewAction = createReviewActionHandler(readPreviewSelection);

export function registerReviewWorkflow(resolveUri: () => vscode.Uri | undefined): vscode.Disposable {
  const review = async (resource?: vscode.Uri) => {
    const uri = resource?.scheme === 'file' ? resource : resolveUri();
    if (!uri || uri.scheme !== 'file') {
      void vscode.window.showInformationMessage('Open a saved Markdown file to review comments.');
      return;
    }
    const document = await vscode.workspace.openTextDocument(uri);
    if (document.languageId !== 'markdown') throw new Error('Open a Markdown file to review comments.');
    const stored = readReviewComments(document.getText());
    if (stored.error) throw new Error(stored.error);
    if (!stored.comments.some(isAiReviewEligible)) {
      void vscode.window.showInformationMessage('There are no open AI review comments attached to the current text.');
      return;
    }
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: '/revise-from-comments Revise the attached Markdown file using its AI-selected review comments.',
      isPartialQuery: true,
      attachFiles: [uri],
    });
  };
  const report = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      if (!(error instanceof vscode.CancellationError)) void vscode.window.showErrorMessage(errorMessage(error));
    }
  };

  const changed = new vscode.EventEmitter<void>();
  const provider: vscode.TreeDataProvider<ReviewTreeEntry> = {
    onDidChangeTreeData: changed.event,
    getTreeItem(entry) {
      const { comment } = entry;
      const item = new vscode.TreeItem(comment.body, vscode.TreeItemCollapsibleState.None);
      item.description = entry.location + ' · ' + (comment.state === 'resolved' ? 'Resolved' : 'Open') + (comment.includeInAi ? ' · AI' : ' · Manual');
      const reopened = comment.state === 'open' && comment.resolutionReopened === true;
      if (comment.resolution) item.description += ' · ' + (reopened ? 'Previous resolution: ' : 'Resolution: ') + comment.resolution.replace(/\s+/gu, ' ');
      item.iconPath = new vscode.ThemeIcon(comment.state === 'resolved' ? 'check' : 'comment-discussion',
        new vscode.ThemeColor(comment.state === 'resolved' ? 'testing.iconPassed' : 'editorInfo.foreground'));
      const tooltip = new vscode.MarkdownString();
      tooltip.appendMarkdown('**Comment:** *').appendText(comment.body).appendMarkdown('*');
      if (comment.resolution) {
        tooltip.appendMarkdown('  \n**Resolution:** ' + (reopened ? '~~*' : '*'))
          .appendText(comment.resolution).appendMarkdown(reopened ? '*~~' : '*');
      }
      item.tooltip = tooltip;
      item.contextValue = 'reviewComment' + (comment.state === 'open' ? 'Open' : 'Resolved') + (comment.includeInAi ? 'Ai' : 'Manual');
      item.command = { command: 'markdownAiStudio.revealReviewComment', title: 'Go to Comment', arguments: [entry] };
      return item;
    },
    async getChildren() {
      const uri = activeReviewUri ?? resolveUri();
      if (!uri || uri.scheme !== 'file') return [];
      const document = await vscode.workspace.openTextDocument(uri);
      const stored = readReviewComments(document.getText());
      return stored.comments.map(comment => {
        let location = 'Detached';
        if (comment.range) {
          const { startLine: first, endLine: last } = reviewRangeLines(stored.markdown, comment.range);
          location = first === last ? 'Line ' + first : 'Lines ' + first + '–' + last;
        }
        return { comment, uri, document, version: document.version, location };
      });
    },
  };
  const reviewTarget = async (entry?: ReviewTreeEntry) => {
    const uri = entry?.uri ?? activeReviewUri ?? resolveUri();
    if (!uri || uri.scheme !== 'file') throw new Error('Open a Markdown file to manage review comments.');
    const document = await vscode.workspace.openTextDocument(uri);
    if (entry && (document !== entry.document || document.version !== entry.version)) {
      throw new Error('The review comments changed. Refresh the view and try again.');
    }
    const original = document.getText();
    const stored = readReviewComments(original);
    if (stored.error) throw new Error(stored.error);
    if (entry && !stored.comments.some(comment => comment.id === entry.comment.id)) {
      throw new Error('This comment is no longer in the document.');
    }
    return { document, version: document.version, original, stored };
  };
  const changeReview = async (entry: ReviewTreeEntry, action: 'resolve' | 'reopen' | 'delete' | 'selectAi' | 'selectManual') => {
    if (!entry?.comment) throw new Error('Select a review comment first.');
    const target = await reviewTarget(entry);
    const comments = target.stored.comments.flatMap(comment => {
      if (comment.id !== entry.comment.id) return [comment];
      if (action === 'delete') return [];
      if (action === 'selectAi' || action === 'selectManual') return [{ ...comment, includeInAi: action === 'selectAi' }];
      return [setReviewCommentState(comment, action === 'resolve' ? 'resolved' : 'open')];
    });
    await replaceDocument(target.document, target.version, writeReviewComments(target.original, comments), true);
  };
  const clearReviews = async (entry: ReviewTreeEntry | undefined, all: boolean) => {
    const target = await reviewTarget(entry);
    const comments = all ? [] : target.stored.comments.filter(comment => comment.state !== 'resolved');
    if (comments.length === target.stored.comments.length) return;
    if (all) {
      const answer = await vscode.window.showWarningMessage(
        'Remove all review comments from this Markdown file?',
        { modal: true, detail: 'This removes both open and resolved comments and their markers.' },
        'Clear All',
      );
      if (answer !== 'Clear All') return;
    }
    await replaceDocument(target.document, target.version, writeReviewComments(target.original, comments), true);
  };
  let refreshVersion = 0;
  const refresh = async () => {
    const version = ++refreshVersion;
    changed.fire();
    const uri = activeReviewUri ?? resolveUri();
    let eligible = false;
    let hasComments = false;
    if (uri?.scheme === 'file') {
      const document = await vscode.workspace.openTextDocument(uri);
      const stored = readReviewComments(document.getText());
      hasComments = !stored.error && stored.comments.length > 0;
      eligible = !stored.error && stored.comments.some(isAiReviewEligible);
    }
    if (version !== refreshVersion) return;
    await Promise.all([
      vscode.commands.executeCommand('setContext', 'markdownAiStudio.reviewPending', eligible),
      vscode.commands.executeCommand('setContext', 'markdownAiStudio.reviewHasComments', hasComments),
    ]);
  };
  refreshReviewView = refresh;
  void refresh();
  return vscode.Disposable.from(
    changed,
    vscode.window.registerTreeDataProvider('markdownAiStudio.reviewCommentsView', provider),
    vscode.commands.registerCommand('markdownAiStudio.toggleReviewComments', async (resource?: vscode.Uri) => {
      const uri = resource?.scheme === 'file' ? resource : activeReviewUri ?? resolveUri();
      if (!uri) return;
      await toggleReviewVisibility(uri.toString());
    }),
    vscode.commands.registerCommand('markdownAiStudio.revealReviewComment', (entry: ReviewTreeEntry) => report(async () => {
      if (!entry?.comment) throw new Error('Select a review comment first.');
      const { document } = await reviewTarget(entry);
      const panels = reviewPanels.get(document.uri.toString());
      if (!panels?.size) throw new Error('Open the Markdown preview to show this comment.');
      for (const panel of panels) {
        panel.reveal(panel.viewColumn, true);
        await panel.webview.postMessage({ command: 'revealReviewComment', id: entry.comment.id });
      }
    })),
    vscode.commands.registerCommand('markdownAiStudio.resolveReviewComment', (entry: ReviewTreeEntry) => report(() => changeReview(entry, 'resolve'))),
    vscode.commands.registerCommand('markdownAiStudio.reopenReviewComment', (entry: ReviewTreeEntry) => report(() => changeReview(entry, 'reopen'))),
    vscode.commands.registerCommand('markdownAiStudio.removeReviewComment', (entry: ReviewTreeEntry) => report(() => changeReview(entry, 'delete'))),
    vscode.commands.registerCommand('markdownAiStudio.selectReviewCommentForAi', (entry: ReviewTreeEntry) => report(() => changeReview(entry, 'selectAi'))),
    vscode.commands.registerCommand('markdownAiStudio.selectReviewCommentForManual', (entry: ReviewTreeEntry) => report(() => changeReview(entry, 'selectManual'))),
    vscode.commands.registerCommand('markdownAiStudio.clearResolvedReviewComments', (entry?: ReviewTreeEntry) => report(() => clearReviews(entry, false))),
    vscode.commands.registerCommand('markdownAiStudio.clearAllReviewComments', (entry?: ReviewTreeEntry) => report(() => clearReviews(entry, true))),
    vscode.commands.registerCommand('markdownAiStudio.implementSelectedReviews', (entry?: ReviewTreeEntry) => report(async () => {
      const { document } = await reviewTarget(entry);
      await review(document.uri);
    })),
    vscode.commands.registerCommand('markdownAiStudio.runReviewComments', (uri?: vscode.Uri) => report(() => review(uri))),
    vscode.commands.registerCommand(reviewCommand, (uri?: vscode.Uri) => report(() => review(uri))),
    vscode.workspace.onDidChangeTextDocument(() => { void refresh(); }),
    vscode.window.onDidChangeActiveTextEditor(() => { void refresh(); }),
    vscode.window.onDidChangeActiveColorTheme(() => { void refresh(); }),
  );

}

async function replaceDocument(document: vscode.TextDocument, version: number, text: string, saveClean: boolean): Promise<void> {
  if (document.isClosed || document.version !== version) throw new Error('The Markdown changed. Try the review action again.');
  const before = document.getText();
  if (before === text) return;
  const clean = !document.isDirty;
  let start = 0;
  let end = before.length;
  let newEnd = text.length;
  while (start < end && start < newEnd && before[start] === text[start]) start += 1;
  while (end > start && newEnd > start && before[end - 1] === text[newEnd - 1]) {
    end -= 1;
    newEnd -= 1;
  }
  // VS Code positions cannot represent a boundary between CR and LF.
  if (before[start - 1] === '\r' && before[start] === '\n') start -= 1;
  if (before[end - 1] === '\r' && before[end] === '\n') {
    end += 1;
    newEnd += 1;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(start), document.positionAt(end)), text.slice(start, newEnd));
  if (!(await vscode.workspace.applyEdit(edit))) throw new Error('VS Code could not update the Markdown file.');
  if (saveClean && clean && document.getText() === text && !(await document.save())) {
    void vscode.window.showWarningMessage('The comment is in the editor buffer. Save the Markdown file to keep it.');
  } else if (saveClean && !clean) {
    void vscode.window.showInformationMessage('Review comment updated in the editor buffer.', 'Save Markdown').then(action => {
      if (action === 'Save Markdown' && !document.isClosed) return document.save();
      return undefined;
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
