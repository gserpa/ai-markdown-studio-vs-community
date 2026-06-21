import * as vscode from 'vscode';
import { loadPreviewThemeRegistryFromDirectories, type PreviewThemeRegistry } from '@mfo/preview-web';
import { resolveExtensionAssetUri } from '../util/extensionSupportRoot';
import * as fs from 'node:fs';
import * as path from 'node:path';

const WORKSPACE_PRESENTATION_THEME_DIRECTORY_NAME = '.markdown-ai-studio';
const PRESENTATION_THEME_DIRECTORY_NAME = 'presentation-themes';
const GLOBAL_PRESENTATION_THEME_DIRECTORY_SETTING = 'previewThemeDirectory';

export function getBundledPreviewThemeDirectory(extensionUri: vscode.Uri): string {
  return resolveExtensionAssetUri(extensionUri, 'preview', 'themes', 'presentation').fsPath;
}

export function getPreviewThemeDirectories(extensionUri: vscode.Uri, documentUri: vscode.Uri): string[] {
  const directories = [getBundledPreviewThemeDirectory(extensionUri)];
  const configuredDirectory = getConfiguredGlobalPreviewThemeDirectory();
  const workspaceDirectory = getWorkspacePreviewThemeDirectory(documentUri);

  const resolvedConfiguredDirectory = configuredDirectory ? resolvePreviewThemeDirectory(configuredDirectory) : undefined;
  if (resolvedConfiguredDirectory && !directories.includes(resolvedConfiguredDirectory)) {
    directories.push(resolvedConfiguredDirectory);
  }

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

export function getConfiguredGlobalPreviewThemeDirectory(): string | undefined {
  const inspected = vscode.workspace
    .getConfiguration('markdownAiStudio')
    .inspect<string>(GLOBAL_PRESENTATION_THEME_DIRECTORY_SETTING);

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
      `[markdown-ai-studio] Ignoring markdownAiStudio.${GLOBAL_PRESENTATION_THEME_DIRECTORY_SETTING} because it is not an absolute path.`,
    );
    return undefined;
  }

  return normalizedPath;
}

export async function openPresentationThemesFolder(): Promise<void> {
  const configuredDirectory = getConfiguredGlobalPreviewThemeDirectory();
  if (!configuredDirectory) {
    return;
  }

  const resolvedDirectory = resolvePreviewThemeDirectory(configuredDirectory);
  if (!resolvedDirectory) {
    return;
  }

  await vscode.env.openExternal(vscode.Uri.file(resolvedDirectory));
}

function getWorkspacePreviewThemeDirectory(documentUri: vscode.Uri): string | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
  if (!workspaceFolder) {
    return undefined;
  }

  return resolvePreviewThemeDirectory(path.join(workspaceFolder.uri.fsPath, WORKSPACE_PRESENTATION_THEME_DIRECTORY_NAME));
}

function resolvePreviewThemeDirectory(themeDirectoryPath: string): string | undefined {
  if (!themeDirectoryPath || !fs.existsSync(themeDirectoryPath)) {
    return undefined;
  }

  if (hasJsonThemeFiles(themeDirectoryPath)) {
    return path.normalize(themeDirectoryPath);
  }

  const nestedPresentationDirectory = path.join(themeDirectoryPath, PRESENTATION_THEME_DIRECTORY_NAME);
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
