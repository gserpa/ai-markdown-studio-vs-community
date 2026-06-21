import * as vscode from 'vscode';

const DOCUMENT_PREVIEW_THEME_SETTING = 'documentPreviewTheme';
const DOCUMENT_PREVIEW_THEME_CUSTOM_NAME_SETTING = 'documentPreviewThemeCustomName';

export function getResolvedDocumentPreviewThemeSetting(documentUri: vscode.Uri): string {
  const configuration = vscode.workspace.getConfiguration('markdownAiStudio', documentUri);
  const rawTheme = configuration.get<string>(DOCUMENT_PREVIEW_THEME_SETTING, 'auto').trim();

  if (!isCustomThemeSelection(rawTheme)) {
    return rawTheme || 'auto';
  }

  const customThemeName = configuration.get<string>(DOCUMENT_PREVIEW_THEME_CUSTOM_NAME_SETTING, '').trim();
  return customThemeName || 'auto';
}

function isCustomThemeSelection(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'custom' || normalized === 'custom...';
}
