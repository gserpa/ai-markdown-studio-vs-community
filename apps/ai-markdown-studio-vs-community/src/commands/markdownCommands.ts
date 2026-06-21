import * as vscode from 'vscode';
import { formatMarkdownTables, isMarkdownPresentationSource } from '@mfo/core';
import { listFeatureContributions } from '../api/featureContributions';
import { getAiAccessState, type AiAccessState } from '../ai/aiConsent';
import { hasConfiguredCopilotAccount } from '../ai/copilotAvailability';
import { exportMarkdownAsBasicDocx } from '../export/docx/docxExporter';
import { exportMarkdownAsHtml } from '../export/html/htmlExporter';
import { hasDisplayableFrontMatter } from '../panel/frontMatterDisplayState';
import { MarkdownPreviewCustomEditor } from '../panel/MarkdownPreviewCustomEditor';
import { MarkdownPreviewPanel } from '../panel/MarkdownPreviewPanel';
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
  hasFrontMatter: boolean;
  isPresentation: boolean;
  copilotConfigured: boolean;
  aiAccessState: AiAccessState;
};

const QUICK_PICK_COMMAND_ORDER = [
  'markdownAiStudio.openPreview',
  'markdownAiStudio.editAsText',
  'markdownAiStudio.toggleFrontMatter',
  'markdownAiStudio.formatTables',
  'markdownAiStudio.generateDocument',
  'markdownAiStudio.generatePresentation',
  'markdownAiStudio.enableAiFeatures',
  'markdownAiStudio.exportHtml',
  'markdownAiStudio.exportDocxBasic',
  'markdownAiStudio.openSettings',
] as const;

const AI_DEPENDENT_COMMANDS = new Set<string>([
  'markdownAiStudio.enableAiFeatures',
  'markdownAiStudio.generateDocument',
  'markdownAiStudio.generatePresentation',
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
  const uri = targetUri ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri) {
    void vscode.window.showInformationMessage('Open a Markdown file to preview it.');
    return;
  }
  const document = await vscode.workspace.openTextDocument(uri);
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document.uri.toString() === document.uri.toString()) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }
  await vscode.commands.executeCommand('vscode.openWith', document.uri, MarkdownPreviewCustomEditor.viewType, {
    preview: false,
  });
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

export async function exportHtmlCommand(extensionUri: vscode.Uri, resource?: vscode.Uri): Promise<void> {
  const document = await resolveMarkdownDocument(resource);
  if (!document) return;
  const target = await exportMarkdownAsHtml(extensionUri, document);
  if (target) void vscode.window.showInformationMessage(`Exported HTML to ${target.fsPath}`);
}

export async function exportDocxBasicCommand(extensionUri: vscode.Uri, resource?: vscode.Uri): Promise<void> {
  const document = await resolveMarkdownDocument(resource);
  if (!document) return;
  const target = await exportMarkdownAsBasicDocx(extensionUri, document);
  if (target) void vscode.window.showInformationMessage(`Exported basic DOCX to ${target.fsPath}`);
}

export async function openSettingsCommand(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:GustavoSerpa.markdown-ai-studio markdownAiStudio');
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
      placeHolder: 'Select a AI Markdown Studio command',
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
  return {
    documentUri,
    isPreviewMode: activePreviewUri?.toString() === documentUri.toString(),
    hasFrontMatter: hasDisplayableFrontMatter(document.getText()),
    isPresentation: isMarkdownPresentationSource(document.getText()),
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
      order: QUICK_PICK_COMMAND_ORDER.indexOf(entry.command as typeof QUICK_PICK_COMMAND_ORDER[number]) >= 0
        ? QUICK_PICK_COMMAND_ORDER.indexOf(entry.command as typeof QUICK_PICK_COMMAND_ORDER[number])
        : 100 + order,
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
    return context.isPreviewMode;
  }

  if (command === 'markdownAiStudio.toggleFrontMatter') {
    return context.isPreviewMode && context.hasFrontMatter;
  }

  if (entry.presentationOnly) {
    return context.isPresentation;
  }

  return true;
}
