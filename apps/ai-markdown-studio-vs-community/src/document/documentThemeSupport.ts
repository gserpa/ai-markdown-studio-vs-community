import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { loadDocumentThemeRegistryFromDirectories, type DocumentThemeRegistry } from '@mfo/preview-web';
import { resolveExtensionAssetUri } from '../util/extensionSupportRoot';

const BUNDLED_DOCUMENT_THEME_DIRECTORY_SEGMENTS = ['assets', 'preview', 'themes', 'document'];
const GLOBAL_DOCUMENT_THEME_DIRECTORY_SETTING = 'globalDocumentThemeDirectory';

export function getBundledDocumentThemeDirectory(extensionUri: vscode.Uri): string {
  return resolveExtensionAssetUri(extensionUri, 'preview', 'themes', 'document').fsPath;
}

export function getDocumentThemeDirectories(extensionUri: vscode.Uri, documentUri: vscode.Uri): string[] {
  const directories = [getBundledDocumentThemeDirectory(extensionUri)];
  const globalConfiguredDirectory = getConfiguredGlobalDocumentThemeDirectory();
  void documentUri;

  if (globalConfiguredDirectory && fs.existsSync(globalConfiguredDirectory) && !directories.includes(globalConfiguredDirectory)) {
    directories.push(globalConfiguredDirectory);
  }

  return directories;
}

export function getConfiguredGlobalDocumentThemeDirectory(): string | undefined {
  const configuredValue = readGlobalDocumentThemeDirectorySetting();
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

function readGlobalDocumentThemeDirectorySetting(): string {
  const inspected = vscode.workspace
    .getConfiguration('markdownAiStudio')
    .inspect<string>(GLOBAL_DOCUMENT_THEME_DIRECTORY_SETTING);

  if (typeof inspected?.globalValue !== 'string') {
    return '';
  }

  return inspected.globalValue.trim();
}
