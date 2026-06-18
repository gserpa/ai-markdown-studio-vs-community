import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { loadDocumentThemeRegistryFromDirectories, type DocumentThemeRegistry } from '@mfo/preview-web';
import { resolveExtensionAssetUri } from '../util/extensionSupportRoot';

const DOCUMENT_THEME_DIRECTORY_SETTINGS = ['documentThemesFolder', 'globalDocumentThemeDirectory'] as const;
const DOCUMENT_THEME_DIRECTORY_WARNING = 'markdownAiStudio.documentThemesFolder';

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
  const configuredValue = readThemeDirectorySetting(DOCUMENT_THEME_DIRECTORY_SETTINGS);
  if (!configuredValue) {
    return undefined;
  }

  const normalizedPath = normalizeConfiguredThemeDirectory(configuredValue);
  if (!normalizedPath || !ensureDirectoryExists(normalizedPath, DOCUMENT_THEME_DIRECTORY_WARNING)) {
    return undefined;
  }

  return normalizedPath;
}

export async function openDocumentThemesFolder(): Promise<void> {
  const configuredDirectory = getConfiguredGlobalDocumentThemeDirectory();
  if (!configuredDirectory) {
    return;
  }

  await vscode.env.openExternal(vscode.Uri.file(configuredDirectory));
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
    console.warn('[markdown-ai-studio] Ignoring markdownAiStudio.documentThemesFolder because it is not an absolute path.');
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
