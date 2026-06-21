import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { loadDocumentThemeRegistryFromDirectories, type DocumentThemeRegistry } from '@mfo/preview-web';
import { resolveExtensionAssetUri } from '../util/extensionSupportRoot';
import { resolveConfiguredAbsolutePath } from '../util/configuredPaths';

const PRO_EXTENSION_ID = 'GustavoSerpa.markdown-ai-studio-pro';
const DOCUMENT_THEME_FOLDER_SETTING = 'documentThemeFolder';

export function getBundledDocumentThemeDirectory(extensionUri: vscode.Uri): string {
  return resolveExtensionAssetUri(extensionUri, 'preview', 'themes', 'document').fsPath;
}

export function getDocumentThemeDirectories(extensionUri: vscode.Uri, documentUri: vscode.Uri): string[] {
  const directories = [getBundledDocumentThemeDirectory(extensionUri)];
  if (!isProInstalled()) {
    return directories;
  }

  const globalConfiguredDirectory = getConfiguredGlobalDocumentThemeDirectory();
  if (globalConfiguredDirectory) {
    directories.push(globalConfiguredDirectory);
  }

  const workspaceDirectory = getWorkspaceDocumentThemeDirectory(documentUri);
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

function isProInstalled(): boolean {
  return Boolean(vscode.extensions?.getExtension(PRO_EXTENSION_ID));
}

function getConfiguredGlobalDocumentThemeDirectory(): string | undefined {
  const configuredValue = vscode.workspace
    .getConfiguration('markdownAiStudio')
    .inspect<string>(DOCUMENT_THEME_FOLDER_SETTING)
    ?.globalValue;

  if (typeof configuredValue !== 'string') {
    return undefined;
  }

  const normalizedPath = resolveConfiguredAbsolutePath(configuredValue);
  if (!normalizedPath) {
    return undefined;
  }

  return resolveDocumentThemeDirectory(normalizedPath);
}

function getWorkspaceDocumentThemeDirectory(documentUri: vscode.Uri): string | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
  if (!workspaceFolder) {
    return undefined;
  }

  return resolveDocumentThemeDirectory(vscode.Uri.joinPath(workspaceFolder.uri, '.markdown-ai-studio').fsPath);
}

function resolveDocumentThemeDirectory(themeDirectoryPath: string): string | undefined {
  if (!themeDirectoryPath || !fs.existsSync(themeDirectoryPath)) {
    return undefined;
  }

  if (hasJsonThemeFiles(themeDirectoryPath)) {
    return path.normalize(themeDirectoryPath);
  }

  const nestedDocumentDirectory = path.join(themeDirectoryPath, 'document-themes');
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
