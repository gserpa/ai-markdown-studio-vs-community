import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { loadPreviewThemeRegistryFromDirectories, type PreviewThemeRegistry } from '@mfo/preview-web';
import { resolveExtensionAssetUri } from '../util/extensionSupportRoot';
import { resolveConfiguredAbsolutePath } from '../util/configuredPaths';

const PRO_EXTENSION_ID = 'GustavoSerpa.markdown-ai-studio-pro';
const PRESENTATION_THEME_FOLDER_SETTING = 'presentationThemeFolder';

export function getBundledPreviewThemeDirectory(extensionUri: vscode.Uri): string {
  return resolveExtensionAssetUri(extensionUri, 'preview', 'themes', 'presentation').fsPath;
}

export function getPreviewThemeDirectories(extensionUri: vscode.Uri, documentUri: vscode.Uri): string[] {
  const directories = [getBundledPreviewThemeDirectory(extensionUri)];
  if (!isProInstalled()) {
    return directories;
  }

  const configuredDirectory = getConfiguredGlobalPreviewThemeDirectory();
  if (configuredDirectory) {
    directories.push(configuredDirectory);
  }

  const workspaceDirectory = getWorkspacePreviewThemeDirectory(documentUri);
  if (workspaceDirectory && !directories.includes(workspaceDirectory)) {
    directories.push(workspaceDirectory);
  }

  return directories;
}

export function loadPreviewThemeRegistryForDocument(extensionUri: vscode.Uri, documentUri: vscode.Uri): PreviewThemeRegistry {
  const bundledDirectory = getBundledPreviewThemeDirectory(extensionUri);

  try {
    const registry = loadPreviewThemeRegistryFromDirectories(getPreviewThemeDirectories(extensionUri, documentUri));
    if (registry.warnings.length > 0) {
      console.warn('[markdown-ai-studio] Presentation theme token warnings:\n' + registry.warnings.join('\n'));
    }
    return registry;
  } catch (error) {
    console.warn('[markdown-ai-studio] Failed to load preview theme registry. Falling back to bundled themes.', error);
    return loadPreviewThemeRegistryFromDirectories([bundledDirectory]);
  }
}

function isProInstalled(): boolean {
  return Boolean(vscode.extensions?.getExtension(PRO_EXTENSION_ID));
}

function getConfiguredGlobalPreviewThemeDirectory(): string | undefined {
  const configuredValue = vscode.workspace
    .getConfiguration('markdownAiStudio')
    .inspect<string>(PRESENTATION_THEME_FOLDER_SETTING)
    ?.globalValue;

  if (typeof configuredValue !== 'string') {
    return undefined;
  }

  const normalizedPath = resolveConfiguredAbsolutePath(configuredValue);
  if (!normalizedPath) {
    return undefined;
  }

  return resolvePreviewThemeDirectory(normalizedPath);
}

function getWorkspacePreviewThemeDirectory(documentUri: vscode.Uri): string | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
  if (!workspaceFolder) {
    return undefined;
  }

  return resolvePreviewThemeDirectory(vscode.Uri.joinPath(workspaceFolder.uri, '.markdown-ai-studio').fsPath);
}

function resolvePreviewThemeDirectory(themeDirectoryPath: string): string | undefined {
  if (!themeDirectoryPath || !fs.existsSync(themeDirectoryPath)) {
    return undefined;
  }

  if (hasJsonThemeFiles(themeDirectoryPath)) {
    return path.normalize(themeDirectoryPath);
  }

  const nestedPresentationDirectory = path.join(themeDirectoryPath, 'presentation-themes');
  if (hasJsonThemeFiles(nestedPresentationDirectory)) {
    return path.normalize(nestedPresentationDirectory);
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
