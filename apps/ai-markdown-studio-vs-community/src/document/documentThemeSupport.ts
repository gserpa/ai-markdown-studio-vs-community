import * as vscode from 'vscode';
import { loadDocumentThemeRegistryFromDirectories, type DocumentThemeRegistry } from '@mfo/preview-web';
import { resolveExtensionAssetUri } from '../util/extensionSupportRoot';
import * as fs from 'node:fs';
import * as path from 'node:path';

const WORKSPACE_DOCUMENT_THEME_DIRECTORY_NAME = '.markdown-ai-studio';
const DOCUMENT_THEME_DIRECTORY_NAME = 'document-themes';
const GLOBAL_DOCUMENT_THEME_DIRECTORY_SETTING = 'globalDocumentThemeDirectory';

export function getBundledDocumentThemeDirectory(extensionUri: vscode.Uri): string {
  return resolveExtensionAssetUri(extensionUri, 'preview', 'themes', 'document').fsPath;
}

export function getDocumentThemeDirectories(extensionUri: vscode.Uri, documentUri: vscode.Uri): string[] {
  const directories = [getBundledDocumentThemeDirectory(extensionUri)];
  const configuredDirectory = getConfiguredGlobalDocumentThemeDirectory();
  const workspaceDirectory = getWorkspaceDocumentThemeDirectory(documentUri);

  const resolvedConfiguredDirectory = configuredDirectory ? resolveDocumentThemeDirectory(configuredDirectory) : undefined;
  if (resolvedConfiguredDirectory && !directories.includes(resolvedConfiguredDirectory)) {
    directories.push(resolvedConfiguredDirectory);
  }

  if (workspaceDirectory && !directories.includes(workspaceDirectory)) {
    directories.push(workspaceDirectory);
  }

  return directories;
}

export function loadDocumentThemeRegistryForDocument(extensionUri: vscode.Uri, documentUri: vscode.Uri): DocumentThemeRegistry {
  const bundledDirectory = getBundledDocumentThemeDirectory(extensionUri);

  try {
    const registry = loadDocumentThemeRegistryFromDirectories(getDocumentThemeDirectories(extensionUri, documentUri));
    if (registry.warnings.length > 0) {
      console.warn('[markdown-ai-studio] Document theme token warnings:\n' + registry.warnings.join('\n'));
    }
    return registry;
  } catch (error) {
    console.warn('[markdown-ai-studio] Failed to load document theme registry. Falling back to bundled themes.', error);
    return loadDocumentThemeRegistryFromDirectories([bundledDirectory]);
  }
}

export function getConfiguredGlobalDocumentThemeDirectory(): string | undefined {
  const inspected = vscode.workspace
    .getConfiguration('markdownAiStudio')
    .inspect<string>(GLOBAL_DOCUMENT_THEME_DIRECTORY_SETTING);

  if (typeof inspected?.globalValue !== 'string') {
    return undefined;
  }

  const configuredValue = inspected.globalValue.trim();
  if (!configuredValue) {
    return undefined;
  }

  const normalizedPath = path.normalize(configuredValue);
  if (!path.isAbsolute(normalizedPath)) {
    console.warn(
      `[markdown-ai-studio] Ignoring markdownAiStudio.${GLOBAL_DOCUMENT_THEME_DIRECTORY_SETTING} because it is not an absolute path.`,
    );
    return undefined;
  }

  return normalizedPath;
}

export async function openDocumentThemesFolder(): Promise<void> {
  const configuredDirectory = getConfiguredGlobalDocumentThemeDirectory();
  if (!configuredDirectory) {
    return;
  }

  const resolvedDirectory = resolveDocumentThemeDirectory(configuredDirectory);
  if (!resolvedDirectory) {
    return;
  }

  await vscode.env.openExternal(vscode.Uri.file(resolvedDirectory));
}

function getWorkspaceDocumentThemeDirectory(documentUri: vscode.Uri): string | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
  if (!workspaceFolder) {
    return undefined;
  }

  return resolveDocumentThemeDirectory(path.join(workspaceFolder.uri.fsPath, WORKSPACE_DOCUMENT_THEME_DIRECTORY_NAME));
}

function resolveDocumentThemeDirectory(themeDirectoryPath: string): string | undefined {
  if (!themeDirectoryPath || !fs.existsSync(themeDirectoryPath)) {
    return undefined;
  }

  if (hasJsonThemeFiles(themeDirectoryPath)) {
    return path.normalize(themeDirectoryPath);
  }

  const nestedDocumentDirectory = path.join(themeDirectoryPath, DOCUMENT_THEME_DIRECTORY_NAME);
  if (hasJsonThemeFiles(nestedDocumentDirectory)) {
    return path.normalize(nestedDocumentDirectory);
  }

  return undefined;
}

function hasJsonThemeFiles(themeDirectoryPath: string): boolean {
  if (!themeDirectoryPath || !fs.existsSync(themeDirectoryPath)) {
    return false;
  }

  try {
    return fs.readdirSync(themeDirectoryPath, { withFileTypes: true })
      .some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'));
  } catch {
    return false;
  }
}
