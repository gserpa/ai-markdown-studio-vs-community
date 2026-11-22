import * as vscode from 'vscode';
import { formatMarkdownTables, isMarkdownPresentationSource, readReviewComments } from '@mfo/core';
import { isAiReviewEligible } from '@mfo/review';
import { listFeatureContributions } from '../api/featureContributions';
import { getAiAccessState, type AiAccessState } from '../ai/aiConsent';
import { hasConfiguredCopilotAccount } from '../ai/copilotAvailability';
import { exportMarkdownAsBasicDocx } from '../export/docx/docxExporter';
import { exportMarkdownAsHtml } from '../export/html/htmlExporter';
import { hasDisplayableFrontMatter } from '../panel/frontMatterDisplayState';
import { MarkdownPreviewCustomEditor } from '../panel/MarkdownPreviewCustomEditor';
import { MarkdownPreviewPanel } from '../panel/MarkdownPreviewPanel';
import { embedMarkdownImages, hasEmbeddableLinkedImages } from '../images/embedMarkdownImages';
import { imageDataUri } from '../images/imageDataUri';
import { commandEntries } from './generatedCommandEntries';

type CommandListEntry = {
  command: string;
  title: string;
  order: number;
  requiresAi?: boolean;
  presentationOnly?: boolean;
  replaces?: readonly string[];
};

type CommandListContext = {
  documentUri: vscode.Uri;
  isPreviewMode: boolean;
  isNativeEditorMode: boolean;
  isTextEditorMode: boolean;
  hasFrontMatter: boolean;
  isPresentation: boolean;
  hasEmbeddableLinkedImages: boolean;
  hasReviewComments: boolean;
  hasEligibleReviewComments: boolean;
  copilotConfigured: boolean;
  aiAccessState: AiAccessState;
};

// Feature contributions provide their own order; Community owns only its built-in entries.
const QUICK_PICK_COMMAND_ORDER: Readonly<Record<string, number>> = {
  'markdownAiStudio.openPreview': 0,
  'markdownAiStudio.openNativeMarkdownEditor': 1,
  'markdownAiStudio.editAsText': 2,
  'markdownAiStudio.toggleFrontMatter': 3,
  'markdownAiStudio.formatTables': 4,
  'markdownAiStudio.embedLinkedImages': 5,
  'markdownAiStudio.generateDocument': 6,
  'markdownAiStudio.generatePresentation': 7,
  'markdownAiStudio.reviewSlideTypeMigration': 8,
  'markdownAiStudio.pasteAsMarkdown': 9,
  'markdownAiStudio.exportHtml': 11,
  'markdownAiStudio.exportDocxBasic': 12,
  'markdownAiStudio.reviewComments': 21,
  'markdownAiStudio.toggleReviewComments': 21.06,
  'markdownAiStudio.installPresentationSkill': 22,
  'markdownAiStudio.enableAiFeatures': 23,
  'markdownAiStudio.openSettings': 24,
};

const AI_DEPENDENT_COMMANDS = new Set<string>([
  'markdownAiStudio.enableAiFeatures',
  'markdownAiStudio.generateDocument',
  'markdownAiStudio.pasteAsMarkdown',
]);

export function createMarkdownTableFormattingProvider(): vscode.DocumentFormattingEditProvider {
  return {
    provideDocumentFormattingEdits(document): vscode.TextEdit[] {
      return getMarkdownTableFormattingEdits(document);
    },
  };
}

export function getMarkdownTableFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
  const original = document.getText();
  const formatted = formatMarkdownTables(original);
  return formatted === original
    ? []
    : [vscode.TextEdit.replace(new vscode.Range(document.positionAt(0), document.positionAt(original.length)), formatted)];
}

export async function openPreviewCommand(extensionUri: vscode.Uri, _previews: Map<string, MarkdownPreviewPanel>, targetUri?: vscode.Uri): Promise<void> {
  const uri = targetUri ?? MarkdownPreviewCustomEditor.getActiveDocumentUri()
    ?? getActiveNativeMarkdownEditorUri() ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri) {
    void vscode.window.showInformationMessage('Open a Markdown file to preview it.');
    return;
  }
  const document = await vscode.workspace.openTextDocument(uri);
  await openMarkdownEditor(document.uri, MarkdownPreviewCustomEditor.viewType);
}

async function openMarkdownEditor(uri: vscode.Uri, viewType: string): Promise<void> {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if ((input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom) && input.uri.toString() === uri.toString()) {
    if ((input instanceof vscode.TabInputCustom && input.viewType === viewType)
      || (input instanceof vscode.TabInputText && viewType === 'default')) {
      return;
    }
    // VS Code's reopen command replaces the active editor while retaining the document's working copy.
    await vscode.commands.executeCommand('reopenActiveEditorWith', viewType);
  } else if (viewType === 'default') {
    await vscode.window.showTextDocument(uri, { preview: false });
  } else {
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType, { preview: false });
  }
}

export function getActiveNativeMarkdownEditorUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputCustom && input.viewType === 'vscode.markdown.editor'
    ? input.uri
    : undefined;
}

export async function openNativeMarkdownEditorCommand(targetUri?: vscode.Uri): Promise<void> {
  const document = await resolveMarkdownDocument(targetUri);
  if (!document) {
    return;
  }

  await openMarkdownEditor(document.uri, 'vscode.markdown.editor');
}

export async function editAsTextCommand(resource?: vscode.Uri): Promise<void> {
  const document = await resolveMarkdownDocument(resource);
  if (!document) {
    return;
  }
  await openMarkdownEditor(document.uri, 'default');
}

export async function formatTablesCommand(resource?: vscode.Uri): Promise<void> {
  const document = await resolveMarkdownDocument(resource);
  if (!document) return;
  const original = document.getText();
  const formatted = formatMarkdownTables(original);
  if (formatted === original) return;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(original.length)), formatted);
  await vscode.workspace.applyEdit(edit);
}

export async function embedLinkedImagesCommand(resource?: vscode.Uri): Promise<void> {
  const document = await resolveMarkdownDocument(resource);
  if (!document) return;
  const original = document.getText();
  const version = document.version;
  const allowRemote = vscode.workspace.getConfiguration('markdownAiStudio', document.uri).get<boolean>('allowRemoteResources', true);
  const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Embedding linked images' },
    () => embedMarkdownImages(original, (source) => imageDataUri(document, source, allowRemote)));
  if (document.version !== version) {
    void vscode.window.showWarningMessage('The Markdown changed while images were loading. Run Embed Linked Images in File again.');
    return;
  }
  if (result.markdown !== original) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(original.length)), result.markdown);
    if (!await vscode.workspace.applyEdit(edit)) {
      void vscode.window.showErrorMessage('Could not apply the embedded images to the Markdown file.');
      return;
    }
  }
  const summary = result.embedded ? 'Embedded ' + result.embedded + ' image(s). Save the Markdown file to keep them.' : 'No linked images were embedded.';
  if (result.failures.length) {
    const details = result.failures.map((failure) => failure.source + ': ' + failure.message).join('\n');
    void vscode.window.showWarningMessage(summary + ' ' + result.failures.length + ' image(s) could not be embedded: ' + details);
  } else void vscode.window.showInformationMessage(summary);
}

export async function exportHtmlCommand(extensionUri: vscode.Uri, resource?: vscode.Uri): Promise<void> {
  const document = await resolveMarkdownDocument(resource);
  if (!document) return;
  const target = await exportMarkdownAsHtml(extensionUri, document);
  if (target) void vscode.window.showInformationMessage(`Exported HTML to ${target.fsPath}`);
}

export async function exportDocxBasicCommand(extensionUri: vscode.Uri, resource?: vscode.Uri): Promise<void> {
  const document = await resolveMarkdownDocument(resource);
  if (!document) return;
  if (isMarkdownPresentationSource(document.getText())) {
    void vscode.window.showWarningMessage('Basic DOCX export is not supported for Markdown presentations.');
    return;
  }
  const target = await exportMarkdownAsBasicDocx(extensionUri, document);
  if (target) void vscode.window.showInformationMessage(`Exported basic DOCX to ${target.fsPath}`);
}

export async function openSettingsCommand(extensionId: string): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${extensionId} markdownAiStudio`);
}

export async function showCommandListCommand(resource?: vscode.Uri): Promise<void> {
  const context = await resolveCommandListContext(resource);
  if (!context) {
    return;
  }

  const availableEntries = collectAvailableCommandEntries();
  const selected = await vscode.window.showQuickPick(
    buildOrderedQuickPickEntries(availableEntries, context).map((entry) => ({
      label: entry.title,
      command: entry.command,
    })),
    {
      placeHolder: 'Select an AI Markdown Studio command',
    },
  );
  if (selected) await vscode.commands.executeCommand(selected.command, context.documentUri);
}

async function resolveMarkdownDocument(resource?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  const uri = await resolveCurrentMarkdownUri(resource);
  if (!uri) {
    void vscode.window.showInformationMessage('Open a Markdown file first.');
    return undefined;
  }
  return vscode.workspace.openTextDocument(uri);
}

async function resolveCurrentMarkdownUri(resource?: vscode.Uri): Promise<vscode.Uri | undefined> {
  const uri = resource?.scheme === 'file'
    ? resource
    : MarkdownPreviewCustomEditor.getActiveDocumentUri()
      ?? MarkdownPreviewPanel.getActivePreviewDocumentUri()
      ?? getActiveNativeMarkdownEditorUri()
      ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri) {
    return undefined;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  return document.languageId && document.languageId !== 'markdown'
    ? undefined
    : document.uri;
}

async function resolveCommandListContext(resource?: vscode.Uri): Promise<CommandListContext | undefined> {
  const document = await resolveMarkdownDocument(resource);
  if (!document) {
    return undefined;
  }

  const copilotConfigured = await hasConfiguredCopilotAccount();
  const documentUri = document.uri;
  const activePreviewUri = MarkdownPreviewCustomEditor.getActiveDocumentUri() ?? MarkdownPreviewPanel.getActivePreviewDocumentUri();
  const activeInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  const source = document.getText();
  const review = readReviewComments(source);
  return {
    documentUri,
    isPreviewMode: activePreviewUri?.toString() === documentUri.toString(),
    isNativeEditorMode: getActiveNativeMarkdownEditorUri()?.toString() === documentUri.toString(),
    isTextEditorMode: activeInput instanceof vscode.TabInputText && activeInput.uri.toString() === documentUri.toString(),
    hasFrontMatter: hasDisplayableFrontMatter(source),
    isPresentation: isMarkdownPresentationSource(source),
    hasEmbeddableLinkedImages: hasEmbeddableLinkedImages(source),
    hasReviewComments: !review.error && review.comments.length > 0,
    hasEligibleReviewComments: !review.error && review.comments.some(isAiReviewEligible),
    copilotConfigured,
    aiAccessState: getAiAccessState(),
  };
}

function collectAvailableCommandEntries(): Map<string, CommandListEntry> {
  const entries = new Map<string, CommandListEntry>();
  for (const [order, entry] of commandEntries.entries()) {
    entries.set(entry.command, {
      command: entry.command,
      title: entry.title,
      order: QUICK_PICK_COMMAND_ORDER[entry.command] ?? 100 + order,
      requiresAi: AI_DEPENDENT_COMMANDS.has(entry.command),
    });
  }

  for (const feature of listFeatureContributions()) {
    for (const [index, command] of feature.commands.entries()) {
      entries.set(command.command, {
        ...command,
        order: command.order ?? 200 + index,
      });
    }
  }

  return entries;
}

function buildOrderedQuickPickEntries(entries: Map<string, CommandListEntry>, context: CommandListContext): CommandListEntry[] {
  const replacedCommands = new Set([...entries.values()].flatMap((entry) => [...(entry.replaces ?? [])]));
  return [...entries.values()]
    .filter((entry) => !replacedCommands.has(entry.command))
    .filter((entry) => shouldShowCommand(entry, context))
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
}

function shouldShowCommand(entry: CommandListEntry, context: CommandListContext): boolean {
  const command = entry.command;
  if (entry.requiresAi) {
    if (!context.copilotConfigured) {
      return false;
    }

    if (command === 'markdownAiStudio.enableAiFeatures') {
      return context.aiAccessState !== 'enabled';
    }

    return context.aiAccessState !== 'denied';
  }

  if (command === 'markdownAiStudio.openPreview') {
    return !context.isPreviewMode;
  }

  if (command === 'markdownAiStudio.editAsText') {
    return context.isPreviewMode || context.isNativeEditorMode;
  }

  if (command === 'markdownAiStudio.openNativeMarkdownEditor') {
    return !context.isNativeEditorMode;
  }

  if (command === 'markdownAiStudio.formatTables') return context.isTextEditorMode;
  if (command === 'markdownAiStudio.toggleReviewComments') return context.isPreviewMode && context.hasReviewComments;
  if (command === 'markdownAiStudio.reviewComments') return context.hasEligibleReviewComments;
  if (command === 'markdownAiStudio.embedLinkedImages') return context.hasEmbeddableLinkedImages;

  if (command === 'markdownAiStudio.toggleFrontMatter') {
    return context.isPreviewMode && context.hasFrontMatter;
  }

  if (entry.presentationOnly) {
    return context.isPresentation;
  }

  if (command === 'markdownAiStudio.reviewSlideTypeMigration') return context.isPresentation;

  if (command === 'markdownAiStudio.exportDocxBasic') {
    return !context.isPresentation;
  }

  return true;
}
