import * as vscode from 'vscode';
import type { CommunityApiV1 } from '@mfo/community-api';
import {
  createMarkdownTableFormattingProvider,
  exportDocxBasicCommand,
  exportHtmlCommand,
  getMarkdownTableFormattingEdits,
  formatTablesCommand,
  openSettingsCommand,
  openPreviewCommand,
  showCommandListCommand,
} from './commands/markdownCommands';
import { pasteAsMarkdownCommand } from './commands/aiCommands';
import { enableAiFeaturesCommand, initializeAiConsent } from './ai/aiConsent';
import { refreshCopilotConfiguredContext } from './ai/copilotAvailability';
import { generateDocumentCommand } from './generate/documentGenerationCommand';
import { generatePresentationCommand } from './generate/presentationGenerationCommand';
import { createCommunityApi } from './api/communityApi';
import { getBundledDocumentThemeDirectory } from './document/documentThemeSupport';
import { MarkdownPreviewCustomEditor } from './panel/MarkdownPreviewCustomEditor';
import { MarkdownPreviewPanel } from './panel/MarkdownPreviewPanel';
import { registerMpsEditorSupport } from './presentation/mpsEditorSupport';
import { getBundledPreviewThemeDirectory } from './presentation/previewThemeSupport';
import {
  hasDisplayableFrontMatter,
  refreshPreviewFrontMatterContext,
  setFrontMatterVisibility,
  toggleFrontMatterVisibility,
} from './panel/frontMatterDisplayState';

export function activate(context: vscode.ExtensionContext): CommunityApiV1 {
  const previews = new Map<string, MarkdownPreviewPanel>();
  const markdownTableFormattingProvider = createMarkdownTableFormattingProvider();
  const customEditor = new MarkdownPreviewCustomEditor(context.extensionUri);
  const setFrontMatterVisibilityAndRefresh = async (resource: vscode.Uri | undefined, visible: boolean): Promise<void> => {
    const targetResource = (resource?.scheme === 'file' ? resource : undefined)
      ?? MarkdownPreviewCustomEditor.getActiveDocumentUri()
      ?? MarkdownPreviewPanel.getActivePreviewDocumentUri();
    if (!targetResource) {
      return;
    }

    const document = await vscode.workspace.openTextDocument(targetResource);
    if (!hasDisplayableFrontMatter(document.getText())) {
      return;
    }

    setFrontMatterVisibility(targetResource, visible);
    const preview = previews.get(targetResource.toString());
    if (preview) {
      await preview.refresh(document);
    }
    await customEditor.refreshDocument(document);
    await refreshPreviewFrontMatterContext(document);
  };
  void vscode.commands.executeCommand('setContext', 'markdownAiStudio.proInstalled', false);
  void initializeAiConsent();
  void refreshCopilotConfiguredContext();

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      MarkdownPreviewCustomEditor.viewType,
      customEditor,
      {
        supportsMultipleEditorsPerDocument: true,
        webviewOptions: {
          retainContextWhenHidden: true,
          enableFindWidget: true,
        },
      },
    ),
    registerMpsEditorSupport(context.extensionUri),
    vscode.languages.registerDocumentFormattingEditProvider({ language: 'markdown' }, markdownTableFormattingProvider),
    vscode.workspace.onWillSaveTextDocument((event) => {
      if (event.document.languageId !== 'markdown') {
        return;
      }

      const formatTablesOnSave = vscode.workspace.getConfiguration('markdownAiStudio', event.document.uri).get<boolean>('formatTablesOnSave', false);
      if (!formatTablesOnSave) {
        return;
      }

      const edits = getMarkdownTableFormattingEdits(event.document);
      if (edits.length === 0) {
        return;
      }

      event.waitUntil(Promise.resolve(edits));
    }),
    vscode.commands.registerCommand('markdownAiStudio.openPreview', async (resource?: vscode.Uri) => {
      await openPreviewCommand(context.extensionUri, previews, resource);
    }),
    vscode.commands.registerCommand('markdownAiStudio.formatTables', async (resource?: vscode.Uri) => {
      await formatTablesCommand(resource);
    }),
    vscode.commands.registerCommand('markdownAiStudio.exportHtml', async (resource?: vscode.Uri) => {
      await exportHtmlCommand(context.extensionUri, resource);
    }),
    vscode.commands.registerCommand('markdownAiStudio.exportDocxBasic', async (resource?: vscode.Uri) => {
      await exportDocxBasicCommand(context.extensionUri, resource);
    }),
    vscode.commands.registerCommand('markdownAiStudio.generateDocument', generateDocumentCommand),
    vscode.commands.registerCommand('markdownAiStudio.generatePresentation', generatePresentationCommand),
    vscode.commands.registerCommand('markdownAiStudio.pasteAsMarkdown', pasteAsMarkdownCommand),
    vscode.commands.registerCommand('markdownAiStudio.enableAiFeatures', enableAiFeaturesCommand),
    vscode.commands.registerCommand('markdownAiStudio.openSettings', async () => {
      await openSettingsCommand();
    }),
    vscode.commands.registerCommand('markdownAiStudio.showCommandList', async (resource?: vscode.Uri) => {
      const targetResource = (resource?.scheme === 'file' ? resource : undefined)
        ?? vscode.window.activeTextEditor?.document.uri
        ?? MarkdownPreviewCustomEditor.getActiveDocumentUri()
        ?? MarkdownPreviewPanel.getActivePreviewDocumentUri();
      await showCommandListCommand(targetResource);
    }),
    vscode.commands.registerCommand('markdownAiStudio.toggleFrontMatter', async (resource?: vscode.Uri) => {
      const targetResource = (resource?.scheme === 'file' ? resource : undefined)
        ?? MarkdownPreviewCustomEditor.getActiveDocumentUri()
        ?? MarkdownPreviewPanel.getActivePreviewDocumentUri();
      if (!targetResource) {
        return;
      }

      const document = await vscode.workspace.openTextDocument(targetResource);
      if (!hasDisplayableFrontMatter(document.getText())) {
        return;
      }

      toggleFrontMatterVisibility(targetResource);
      const preview = previews.get(targetResource.toString());
      if (preview) {
        await preview.refresh(document);
      }
      await customEditor.refreshDocument(document);
      await refreshPreviewFrontMatterContext(document);
    }),
    vscode.commands.registerCommand('markdownAiStudio.showFrontMatter', async (resource?: vscode.Uri) => {
      await setFrontMatterVisibilityAndRefresh(resource, true);
    }),
    vscode.commands.registerCommand('markdownAiStudio.hideFrontMatter', async (resource?: vscode.Uri) => {
      await setFrontMatterVisibilityAndRefresh(resource, false);
    }),
    vscode.commands.registerCommand('markdownAiStudio.editAsText', async (resource?: vscode.Uri) => {
      const target = (resource?.scheme === 'file' ? resource : undefined)
        ?? MarkdownPreviewCustomEditor.getActiveDocumentUri()
        ?? MarkdownPreviewPanel.getActivePreviewDocumentUri();
      if (!target) {
        return;
      }

      // Close the preview tab first so we do a clean mode switch rather
      // than leaving two tabs open for the same file.
      customEditor.closeForUri(target);
      await vscode.window.showTextDocument(target, { preview: false });
    }),
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const preview = previews.get(event.document.uri.toString());
      if (preview) {
        await preview.refresh(event.document);
      }

      await customEditor.refreshDocument(event.document);
    }),
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const preview = previews.get(document.uri.toString());
      if (preview) {
        await preview.refresh(document);
      }

      await customEditor.refreshDocument(document);
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration('markdownAiStudio')) {
        return;
      }

      if (event.affectsConfiguration('markdownAiStudio.aiAccess')) {
        await initializeAiConsent();
      }

      for (const preview of previews.values()) {
        await preview.refresh();
      }

      await customEditor.refreshAll();
    }),
    vscode.authentication.onDidChangeSessions((event) => {
      if (event.provider.id === 'github' || event.provider.id === 'github-enterprise') {
        void refreshCopilotConfiguredContext();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor || editor.document.languageId !== 'markdown') {
        return;
      }

      const preview = previews.get(editor.document.uri.toString());
      if (preview) {
        await preview.refresh(editor.document);
      }
    }),
  );

  return createCommunityApi(
    String(context.extension.packageJSON.version),
    context.extensionUri,
    getBundledDocumentThemeDirectory(context.extensionUri),
    getBundledPreviewThemeDirectory(context.extensionUri),
  );
}

export function deactivate(): void {}
