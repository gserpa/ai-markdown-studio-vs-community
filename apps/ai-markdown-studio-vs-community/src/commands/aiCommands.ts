import * as vscode from 'vscode';
import { convertClipboardTextToMarkdown } from '../ai/languageModel';
import { ensureAiFeaturesEnabled } from '../ai/aiConsent';
import { createUniqueUri } from '../util/workspaceFiles';

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

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Converting clipboard content to Markdown...',
    cancellable: true,
  }, async (_progress, token) => {
    const markdown = await convertClipboardTextToMarkdown(text, token);
    const target = await createUniqueUri(resource, 'pasted.md');
    await vscode.workspace.fs.writeFile(target, Buffer.from(`${markdown.trim()}\n`, 'utf8'));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(target));
  });
}
