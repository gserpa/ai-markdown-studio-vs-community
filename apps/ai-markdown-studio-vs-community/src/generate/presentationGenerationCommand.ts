import * as path from 'node:path';
import * as vscode from 'vscode';
import { createPresentationPrompt, createPresentationRepairPrompt } from '@mfo/ai-core';
import { generateTextWithLanguageModel } from '../ai/languageModel';
import { validatePresentation } from '../ai/presentationValidation';
import { shouldGenerateWithLanguageModel } from './generationMode';

const THEMES = ['auto', 'default', 'galaxy', 'modern-blue', 'black'] as const;
const RATIOS = ['16:9', '4:3'] as const;
type PresentationGenerationRequest = {
  brief: string;
  audience: string;
  tone: string;
  slideCount: number;
  theme: string;
  ratio: '16:9' | '4:3';
};

export async function generatePresentationCommand(resource?: vscode.Uri): Promise<void> {
  const request = await collectRequest();
  if (!request) return;

  const prompt = createPresentationPrompt({
    brief: request.brief,
    audience: request.audience,
    tone: request.tone,
    length: `${request.slideCount} slides`,
    presentationTheme: request.theme,
    presentationRatio: request.ratio,
  });
  if (!(await shouldGenerateWithLanguageModel(prompt))) return;

  const folder = await resolveOutputFolder(resource);
  if (!folder) return;
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(folder, `${toKebabCase(request.brief)}-presentation.md`),
    filters: { Markdown: ['md'] },
    saveLabel: 'Generate Presentation',
  });
  if (!target) return;

  try {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Generating Markdown presentation...',
      cancellable: true,
    }, async (_progress, token) => {
      let markdown = normalizeMarkdown(await generateTextWithLanguageModel(
        prompt,
        token,
        'Generate a Markdown Presentation Specification deck',
      ), request);
      const issues = validatePresentation(markdown);
      if (issues.length > 0) {
        markdown = normalizeMarkdown(await generateTextWithLanguageModel(
          createPresentationRepairPrompt(markdown, issues),
          token,
          'Repair a generated Markdown Presentation Specification deck',
        ), request);
        const remainingIssues = validatePresentation(markdown);
        if (remainingIssues.length > 0) {
          void vscode.window.showWarningMessage(`Generated presentation needs review: ${remainingIssues.slice(0, 3).join(' ')}`);
        }
      }
      await vscode.workspace.fs.writeFile(target, Buffer.from(markdown, 'utf8'));
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(target));
    });
  } catch (error) {
    if (error instanceof vscode.CancellationError) return;
    void vscode.window.showErrorMessage(`AI presentation generation failed. ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function collectRequest(): Promise<PresentationGenerationRequest | undefined> {
  const brief = await vscode.window.showInputBox({
    title: 'Generate Presentation (AI)',
    prompt: 'Describe the presentation you want to generate',
    ignoreFocusOut: true,
  });
  if (!brief?.trim()) return undefined;
  const audience = await vscode.window.showInputBox({ title: 'Generate Presentation (AI)', prompt: 'Audience', value: 'Technical and business stakeholders', ignoreFocusOut: true });
  if (audience === undefined) return undefined;
  const tone = await vscode.window.showInputBox({ title: 'Generate Presentation (AI)', prompt: 'Tone', value: 'Professional', ignoreFocusOut: true });
  if (tone === undefined) return undefined;
  const slideCountText = await vscode.window.showInputBox({
    title: 'Generate Presentation (AI)',
    prompt: 'Target slide count',
    value: '8',
    validateInput: (value) => /^\d+$/u.test(value.trim()) && Number(value) > 0 ? undefined : 'Enter a positive integer.',
    ignoreFocusOut: true,
  });
  if (!slideCountText) return undefined;
  const theme = await vscode.window.showQuickPick(THEMES, { title: 'Generate Presentation (AI)', placeHolder: 'Choose a presentation theme' });
  if (!theme) return undefined;
  const ratio = await vscode.window.showQuickPick(RATIOS, { title: 'Generate Presentation (AI)', placeHolder: 'Choose a slide ratio' });
  if (!ratio) return undefined;
  return { brief: brief.trim(), audience: audience.trim() || 'General audience', tone: tone.trim() || 'Professional', slideCount: Number(slideCountText), theme, ratio: ratio as '16:9' | '4:3' };
}

function normalizeMarkdown(raw: string, request: PresentationGenerationRequest): string {
  let markdown = raw.trim().replace(/^```(?:markdown|md)?\r?\n([\s\S]*?)\n```$/u, '$1').trim();
  if (!markdown.startsWith('---')) {
    markdown = ['---', `filename: ${toKebabCase(request.brief)}-presentation.md`, 'document: presentation', `title: ${titleCase(request.brief)}`, `theme: ${request.theme}`, `ratio: ${request.ratio}`, '---', '', markdown].join('\n');
  }
  if (!/^---[\s\S]*?\ndocument:\s*presentation\b[\s\S]*?\n---/iu.test(markdown)) {
    markdown = markdown.replace(/^---\r?\n/u, '---\ndocument: presentation\n');
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

function titleCase(value: string): string {
  return value.split(/\s+/u).slice(0, 8).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}
