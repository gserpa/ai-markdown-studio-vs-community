import * as vscode from 'vscode';
import { loadPreviewThemeRegistryFromDirectories, type PreviewThemeRegistry } from '@mfo/preview-web';
import { resolveExtensionAssetUri } from '../util/extensionSupportRoot';

export function getBundledPreviewThemeDirectory(extensionUri: vscode.Uri): string {
  return resolveExtensionAssetUri(extensionUri, 'preview', 'themes', 'presentation').fsPath;
}

export function getPreviewThemeDirectories(extensionUri: vscode.Uri, _documentUri: vscode.Uri): string[] {
  return [getBundledPreviewThemeDirectory(extensionUri)];
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
