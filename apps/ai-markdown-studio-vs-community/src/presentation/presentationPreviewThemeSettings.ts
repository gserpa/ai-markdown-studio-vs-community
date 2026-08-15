import * as vscode from 'vscode';

const PRESENTATION_PREVIEW_THEME_SETTING = 'presentationDefaultTheme';

export function getResolvedPresentationPreviewThemeSetting(documentUri: vscode.Uri): string {
  const configuredTheme = vscode.workspace
    .getConfiguration('markdownAiStudio', documentUri)
    .get<string>(PRESENTATION_PREVIEW_THEME_SETTING, 'auto');

  return typeof configuredTheme === 'string' && configuredTheme.trim().length > 0
    ? configuredTheme.trim()
    : 'auto';
}
