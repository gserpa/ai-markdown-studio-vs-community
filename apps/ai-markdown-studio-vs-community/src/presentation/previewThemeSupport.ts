import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { loadPreviewThemeRegistryFromDirectories, type PreviewThemeRegistry } from '@mfo/preview-web';
import { resolveExtensionAssetUri } from '../util/extensionSupportRoot';

const BUNDLED_THEME_DIRECTORY_SEGMENTS = ['assets', 'preview', 'themes', 'presentation'];
const GLOBAL_PRESENTATION_THEME_DIRECTORY_SETTING = 'previewThemeDirectory';

export function getBundledPreviewThemeDirectory(extensionUri: vscode.Uri): string {
  return resolveExtensionAssetUri(extensionUri, 'preview', 'themes', 'presentation').fsPath;
}

export function getPreviewThemeDirectories(extensionUri: vscode.Uri, documentUri: vscode.Uri): string[] {
  const directories = [getBundledPreviewThemeDirectory(extensionUri)];
  const configuredDirectory = getConfiguredGlobalPreviewThemeDirectory();
  void documentUri;

  if (configuredDirectory && fs.existsSync(configuredDirectory) && !directories.includes(configuredDirectory)) {
    directories.push(configuredDirectory);
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