import * as vscode from 'vscode';
import { extractMarkdownFrontMatterMeta, isMarkdownPresentationSource } from '@mfo/core';

const visibleFrontMatterUris = new Set<string>();
let activePreviewDocumentUri: string | undefined;
let activePreviewOwner: object | undefined;

export function hasDisplayableFrontMatter(source: string): boolean {
  return !isMarkdownPresentationSource(source)
    && Object.keys(extractMarkdownFrontMatterMeta(source)).length > 0;
}

export function isFrontMatterVisible(uri: vscode.Uri): boolean {
  return visibleFrontMatterUris.has(uri.toString());
}

export function toggleFrontMatterVisibility(uri: vscode.Uri): boolean {
  const key = uri.toString();
  if (visibleFrontMatterUris.has(key)) {
    visibleFrontMatterUris.delete(key);
    return false;
  }

  visibleFrontMatterUris.add(key);
  return true;
}

export async function activatePreviewFrontMatterContext(owner: object, document: vscode.TextDocument): Promise<void> {
  activePreviewOwner = owner;
  activePreviewDocumentUri = document.uri.toString();
  await updateFrontMatterContext(document);
}

export async function deactivatePreviewFrontMatterContext(owner: object): Promise<void> {
  if (activePreviewOwner !== owner) {
    return;
  }

  activePreviewOwner = undefined;
  activePreviewDocumentUri = undefined;
  await clearFrontMatterContext();
}

export async function refreshPreviewFrontMatterContext(document: vscode.TextDocument): Promise<void> {
  if (activePreviewDocumentUri !== document.uri.toString()) {
    return;
  }

  await updateFrontMatterContext(document);
}

async function updateFrontMatterContext(document: vscode.TextDocument): Promise<void> {
  const hasFrontMatter = hasDisplayableFrontMatter(document.getText());
  await Promise.all([
    vscode.commands.executeCommand('setContext', 'markdownAiStudio.activePreviewHasFrontMatter', hasFrontMatter),
    vscode.commands.executeCommand(
      'setContext',
      'markdownAiStudio.activePreviewFrontMatterVisible',
      hasFrontMatter && isFrontMatterVisible(document.uri),
    ),
  ]);
}

async function clearFrontMatterContext(): Promise<void> {
  await Promise.all([
    vscode.commands.executeCommand('setContext', 'markdownAiStudio.activePreviewHasFrontMatter', false),
    vscode.commands.executeCommand('setContext', 'markdownAiStudio.activePreviewFrontMatterVisible', false),
  ]);
}
