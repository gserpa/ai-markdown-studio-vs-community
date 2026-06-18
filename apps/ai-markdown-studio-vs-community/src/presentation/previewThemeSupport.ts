import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { loadPreviewThemeRegistryFromDirectories, type PreviewThemeRegistry } from '@mfo/preview-web';
import { resolveExtensionAssetUri } from '../util/extensionSupportRoot';

const PRESENTATION_THEME_DIRECTORY_SETTINGS = ['presentationThemesFolder', 'previewThemeDirectory'] as const;
const PRESENTATION_THEME_DIRECTORY_WARNING = 'markdownAiStudio.presentationThemesFolder';

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
  const configuredValue = readThemeDirectorySetting(PRESENTATION_THEME_DIRECTORY_SETTINGS);

  if (!configuredValue) {
    return undefined;
  }

  const normalizedPath = normalizeConfiguredThemeDirectory(configuredValue);
  if (!normalizedPath || !ensureDirectoryExists(normalizedPath, PRESENTATION_THEME_DIRECTORY_WARNING)) {
    return undefined;
  }

  return normalizedPath;
}

export async function openPresentationThemesFolder(): Promise<void> {
  const configuredDirectory = getConfiguredGlobalPreviewThemeDirectory();
  if (!configuredDirectory) {
    return;
  }

  await vscode.env.openExternal(vscode.Uri.file(configuredDirectory));
}

function readThemeDirectorySetting(settingKeys: readonly string[]): string {
  for (const settingKey of settingKeys) {
    const inspected = vscode.workspace
      .getConfiguration('markdownAiStudio')
      .inspect<string>(settingKey);

    const configuredValue = [
      inspected?.globalValue,
      inspected?.workspaceValue,
      inspected?.workspaceFolderValue,
      inspected?.defaultValue,
    ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);

    if (configuredValue) {
      return configuredValue.trim();
    }
  }

  return '';
}

function normalizeConfiguredThemeDirectory(configuredValue: string): string | undefined {
  const expandedValue = expandConfiguredThemePath(configuredValue);
  const normalizedPath = path.normalize(expandedValue);

  if (!path.isAbsolute(normalizedPath)) {
    console.warn('[markdown-ai-studio] Ignoring markdownAiStudio.presentationThemesFolder because it is not an absolute path.');
    return undefined;
  }

  return normalizedPath;
}

function ensureDirectoryExists(directory: string, settingName: string): boolean {
  try {
    if (fs.existsSync(directory)) {
      const stat = fs.statSync(directory);
      if (!stat.isDirectory()) {
        console.warn(`[markdown-ai-studio] Ignoring ${settingName} because the path exists but is not a directory.`);
        return false;
      }
      return true;
    }

    fs.mkdirSync(directory, { recursive: true });
    return true;
  } catch (error) {
    console.warn(`[markdown-ai-studio] Failed to create directory for ${settingName}.`, error);
    return false;
  }
}

function expandConfiguredThemePath(configuredValue: string): string {
  const envExpandedValue = configuredValue.replace(/%([^%]+)%/gu, (_match, rawName: string) => {
    const envName = rawName.trim();
    const envValue = readEnvironmentVariable(envName);
    if (envValue) {
      return envValue;
    }

    if (envName.toLowerCase() === 'userprofile') {
      return os.homedir();
    }

    return '';
  });

  if (envExpandedValue.startsWith('~')) {
    return path.join(os.homedir(), envExpandedValue.slice(1));
  }

  return path.sep === '/' ? envExpandedValue.replace(/\\/gu, '/') : envExpandedValue;
}

function readEnvironmentVariable(name: string): string | undefined {
  const normalizedName = name.toLowerCase();
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toLowerCase() === normalizedName && typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}
