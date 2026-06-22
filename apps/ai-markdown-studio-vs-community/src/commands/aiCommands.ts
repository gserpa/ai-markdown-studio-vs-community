import * as vscode from 'vscode';
import { convertClipboardTextToMarkdown } from '../ai/languageModel';
import { extractMarkdownFilename } from '../ai/clipboardMarkdown';
import { ensureAiFeaturesEnabled } from '../ai/aiConsent';
import { createUniqueUri, normalizeMarkdownFilename } from '../util/workspaceFiles';

export async function pasteAsMarkdownCommand(resource?: vscode.Uri): Promise<void> {
  if (!resource || resource.scheme !== 'file') {
    void vscode.window.showInformationMessage('Right-click a folder to paste clipboard content as Markdown.');
    return;
  }
  if (!(await ensureAiFeaturesEnabled())) return;
  const text = await vscode.env.clipboard.readText();
  if (!text.trim()) {
    void vscode.window.showInformationMessage('The clipboard is empty.');
    return;
  }

  let target: vscode.Uri | undefined;
  try {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Converting clipboard content to Markdown...',
      cancellable: true,
    }, async (_progress, token) => {
      const markdown = await convertClipboardTextToMarkdown(text, token);
      const output = markdown.trim();
      if (!output) {
        throw new Error('The language model returned an empty response.');
      }

      const filename = extractMarkdownFilename(markdown);
      const requestedName = filename ? normalizeMarkdownFilename(filename) : 'pasted.md';
      target = await createUniqueUri(resource, requestedName);
      await vscode.workspace.fs.writeFile(target, Buffer.from(`${output}\n`, 'utf8'));
    });
  } catch (error) {
    if (isCancellationError(error)) {
      void vscode.window.showInformationMessage('Paste as New Markdown File cancelled.');
      return;
    }

    target = target ?? await createUniqueUri(resource, 'pasted.md');
    await vscode.workspace.fs.writeFile(target, Buffer.from(`${text.trim()}\n`, 'utf8'));
    const details = error instanceof Error ? error.message : String(error);
    void vscode.window.showWarningMessage(
      `AI conversion failed, so the clipboard text was saved as-is instead. ${details}`,
    );
  }

  const resolvedTarget = target ?? await createUniqueUri(resource, 'pasted.md');
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(resolvedTarget));
}

function isCancellationError(error: unknown): boolean {
  if (error instanceof vscode.CancellationError) {
    return true;
  }

  return error instanceof Error && /cancelled|canceled/i.test(error.message);
}
