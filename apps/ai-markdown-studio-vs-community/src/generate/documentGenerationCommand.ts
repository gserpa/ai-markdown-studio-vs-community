import * as path from 'node:path';
import * as vscode from 'vscode';
import { createDocumentPrompt, type DocumentGenerationRequest } from '../ai/presentationGenerationPrompts';
import { generateTextWithLanguageModel } from '../ai/languageModel';
import { shouldGenerateWithLanguageModel } from './generationMode';

const LENGTHS = ['Short', 'Standard', 'Detailed'] as const;
const THEMES = ['auto', 'light-modern-blue', 'dark-modern-aurora', 'night-sky'] as const;

export async function generateDocumentCommand(resource?: vscode.Uri): Promise<void> {
  const request = await collectRequest();
  if (!request) return;

  const prompt = createDocumentPrompt(request);
  if (!(await shouldGenerateWithLanguageModel(prompt))) return;

  const folder = await resolveOutputFolder(resource);
  if (!folder) return;
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(folder, `${toKebabCase(request.brief)}.md`),
    filters: { Markdown: ['md'] },
    saveLabel: 'Generate Document',
  });
  if (!target) return;

  try {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Generating Markdown document...',
      cancellable: true,
    }, async (_progress, token) => {
      const raw = await generateTextWithLanguageModel(prompt, token, 'Generate a Markdown document');
      const markdown = normalizeMarkdown(raw, request);
      await vscode.workspace.fs.writeFile(target, Buffer.from(markdown, 'utf8'));
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(target));
    });
  } catch (error) {
    if (error instanceof vscode.CancellationError) return;
    void vscode.window.showErrorMessage(`AI document generation failed. ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function collectRequest(): Promise<DocumentGenerationRequest | undefined> {
  const brief = await vscode.window.showInputBox({
    title: 'Generate Document (AI)',
    prompt: 'Describe the Markdown document you want to generate',
    ignoreFocusOut: true,
  });
  if (!brief?.trim()) return undefined;
  const audience = await vscode.window.showInputBox({ title: 'Generate Document (AI)', prompt: 'Audience', value: 'Technical and business stakeholders', ignoreFocusOut: true });
  if (audience === undefined) return undefined;
  const tone = await vscode.window.showInputBox({ title: 'Generate Document (AI)', prompt: 'Tone', value: 'Professional', ignoreFocusOut: true });
  if (tone === undefined) return undefined;
  const length = await vscode.window.showQuickPick(LENGTHS, { title: 'Generate Document (AI)', placeHolder: 'Choose the target length' });
  if (!length) return undefined;
  const theme = await vscode.window.showQuickPick(THEMES, { title: 'Generate Document (AI)', placeHolder: 'Choose a document theme' });
  if (!theme) return undefined;
  return { brief: brief.trim(), audience: audience.trim() || 'General audience', tone: tone.trim() || 'Professional', length, theme };
}

function normalizeMarkdown(raw: string, request: DocumentGenerationRequest): string {
  let markdown = raw.trim().replace(/^```(?:markdown|md)?\r?\n([\s\S]*?)\n```$/u, '$1').trim();
  if (!markdown.startsWith('---')) {
    markdown = ['---', `filename: ${toKebabCase(request.brief)}.md`, `theme: ${request.theme}`, '---', '', markdown].join('\n');
  }
  return `${markdown.replace(/\s+$/u, '')}\n`;
}

async function resolveOutputFolder(resource?: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (resource?.scheme === 'file') {
    try {
      return ((await vscode.workspace.fs.stat(resource)).type & vscode.FileType.Directory) !== 0 ? resource : vscode.Uri.file(path.dirname(resource.fsPath));
    } catch {
      return vscode.Uri.file(path.dirname(resource.fsPath));
    }
  }
  const active = vscode.window.activeTextEditor?.document.uri;
  return active?.scheme === 'file' ? vscode.Uri.file(path.dirname(active.fsPath)) : vscode.workspace.workspaceFolders?.[0]?.uri;
}

function toKebabCase(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 80) || 'generated';
}
