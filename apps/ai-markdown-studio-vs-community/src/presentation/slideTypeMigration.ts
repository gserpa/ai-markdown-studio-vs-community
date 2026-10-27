import * as vscode from 'vscode';
import { getSlideTypeMigrations, isMarkdownPresentationSource } from '@mfo/core';

/** Called once when a preview opens, never during ordinary refreshes. */
export function showSlideTypeMigrationNotice(document: vscode.TextDocument): void {
  if (!isMarkdownPresentationSource(document.getText())) return;
  const count = getSlideTypeMigrations(document.getText()).length;
  if (!count) return;
  void vscode.window.showWarningMessage(
    `${count} slide${count === 1 ? '' : 's'} use retired types. Preview uses temporary replacements; review migration to update the Markdown.`,
    'Review migration',
  ).then((action) => {
    if (action === 'Review migration') return vscode.commands.executeCommand('markdownAiStudio.reviewSlideTypeMigration', document.uri);
    return undefined;
  });
}

export function registerSlideTypeMigration(resolveUri: () => vscode.Uri | undefined): vscode.Disposable {
  const proposals = new Map<string, string>();
  const provider = vscode.workspace.registerTextDocumentContentProvider('markdown-ai-studio-migration', {
    provideTextDocumentContent: (uri) => proposals.get(uri.toString()) ?? '',
  });
  const command = vscode.commands.registerCommand('markdownAiStudio.reviewSlideTypeMigration', async (resource?: vscode.Uri) => {
    const uri = resource ?? resolveUri();
    if (!uri) return;
    const document = await vscode.workspace.openTextDocument(uri);
    const source = document.getText();
    if (!isMarkdownPresentationSource(source)) {
      void vscode.window.showInformationMessage('Open a Markdown presentation to review slide type migration.');
      return;
    }
    const migrations = getSlideTypeMigrations(source);
    if (!migrations.length) {
      void vscode.window.showInformationMessage('This presentation already uses the current slide content types.');
      return;
    }
    const version = document.version;
    const changes: { start: number; end: number; name: string }[] = [];
    for (const migration of migrations) {
      let name: string | undefined = migration.replacements[0];
      if (migration.replacements.length > 1) {
        const choice = await vscode.window.showQuickPick([
          ...migration.replacements.map((replacement) => ({ label: replacement, description: replacement === 'brief' ? 'Quick orientation or snapshot' : replacement === 'content' ? 'One ordered, flowing body' : replacement === 'featured-visual' ? 'Visual carries the message' : replacement === 'illustrated-text' ? 'Text and supporting visual' : 'Two distinct content groups', replacement })),
          { label: 'Keep legacy type', description: migration.legacyType, replacement: '' },
        ], { title: `Slide ${migration.slide}: ${migration.legacyType}`, placeHolder: 'Choose the content purpose. The theme and PPTX template will choose placement.' });
        if (!choice) return;
        name = choice.replacement;
      }
      if (name) changes.push({ start: migration.start, end: migration.end, name });
    }
    if (!changes.length) return;
    if (document.version !== version) {
      void vscode.window.showInformationMessage('The presentation changed during review. Run slide type migration again.');
      return;
    }
    let proposed = source;
    for (const change of [...changes].reverse()) proposed = proposed.slice(0, change.start) + change.name + proposed.slice(change.end);
    const proposalUri = vscode.Uri.from({ scheme: 'markdown-ai-studio-migration', path: `/slide-types-${Date.now()}.md` });
    proposals.set(proposalUri.toString(), proposed);
    while (proposals.size > 10) proposals.delete(proposals.keys().next().value!);
    await vscode.commands.executeCommand('vscode.diff', uri, proposalUri, 'Review slide content types', { preview: true });
    const apply = await vscode.window.showInformationMessage(
      `Review ${changes.length} proposed directive changes. The selected theme or PPTX template may place content differently after migration.`,
      'Apply migration',
    );
    if (apply !== 'Apply migration') return;
    if (document.version !== version) {
      void vscode.window.showInformationMessage('The presentation changed during review. Run slide type migration again.');
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    for (const change of changes) edit.replace(uri, new vscode.Range(document.positionAt(change.start), document.positionAt(change.end)), change.name);
    await vscode.workspace.applyEdit(edit);
  });
  return vscode.Disposable.from(provider, command);
}
