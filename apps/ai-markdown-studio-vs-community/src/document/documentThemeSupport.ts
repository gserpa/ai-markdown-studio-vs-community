import * as vscode from 'vscode';
import { loadDocumentThemeRegistryFromDirectories, type DocumentThemeRegistry } from '@mfo/preview-web';
import { resolveExtensionAssetUri } from '../util/extensionSupportRoot';

export function getBundledDocumentThemeDirectory(extensionUri: vscode.Uri): string {
  return resolveExtensionAssetUri(extensionUri, 'preview', 'themes', 'document').fsPath;
}

export function getDocumentThemeDirectories(extensionUri: vscode.Uri, _documentUri: vscode.Uri): string[] {
  return [getBundledDocumentThemeDirectory(extensionUri)];
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
