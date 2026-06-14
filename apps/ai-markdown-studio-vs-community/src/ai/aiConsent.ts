import * as vscode from 'vscode';
import { hasConfiguredCopilotAccount } from './copilotAvailability';

export const AI_FEATURES_SETTING = 'aiFeaturesEnabled';
export const AI_AUTHORIZATION_DENIED_SETTING = 'aiAuthorizationDenied';

const AI_DISCLOSURE = [
  'By enabling AI features, you accept that AI Markdown Studio may use the GitHub Copilot service already configured in VS Code for AI-supported functionality, such as document generation, presentation generation, and AI Paste to Markdown.',
  '',
  'For those AI-supported features, the content you provide may be shared with that configured Copilot service for processing. AI Markdown Studio does not connect to any other third-party AI service and does not bring its own AI account or credentials.',
  '',
  'Only enable this setting if you are authorized to share that content through the GitHub Copilot service already configured in VS Code. You can revoke access at any time by disabling AI Markdown Studio: AI Features Enabled in Settings.',
].join('\n');

export function areAiFeaturesEnabled(): boolean {
  return vscode.workspace.getConfiguration('markdownAiStudio').get<boolean>(AI_FEATURES_SETTING, false);
}

export function isAiAuthorizationDenied(): boolean {
  return vscode.workspace.getConfiguration('markdownAiStudio').get<boolean>(AI_AUTHORIZATION_DENIED_SETTING, false);
}

async function setAiAuthorizationDenied(value: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration('markdownAiStudio')
    .update(AI_AUTHORIZATION_DENIED_SETTING, value, vscode.ConfigurationTarget.Global);
}

export async function enableAiFeaturesCommand(): Promise<boolean> {
  if (!(await hasConfiguredCopilotAccount())) {
    void vscode.window.showInformationMessage('GitHub Copilot is not configured in VS Code yet. Sign in to GitHub before enabling AI Markdown Studio AI features.');
    return false;
  }

  if (areAiFeaturesEnabled() && !isAiAuthorizationDenied()) {
    void vscode.window.showInformationMessage('AI Markdown Studio AI features are already enabled.');
    return true;
  }

  const selected = await vscode.window.showWarningMessage(
    isAiAuthorizationDenied()
      ? 'Re-enable AI Markdown Studio AI features?'
      : 'Enable AI Markdown Studio AI features?',
    { modal: true, detail: AI_DISCLOSURE },
    'Enable AI Features',
    'Deny AI Features',
    'Review Settings',
  );
  if (selected === 'Review Settings') {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'markdownAiStudio.aiFeaturesEnabled');
    return false;
  }
  if (selected === 'Deny AI Features') {
    await setAiAuthorizationDenied(true);
    await vscode.workspace
      .getConfiguration('markdownAiStudio')
      .update(AI_FEATURES_SETTING, false, vscode.ConfigurationTarget.Global);
    return false;
  }
  if (selected !== 'Enable AI Features') {
    return false;
  }

  await setAiAuthorizationDenied(false);
  await vscode.workspace
    .getConfiguration('markdownAiStudio')
    .update(AI_FEATURES_SETTING, true, vscode.ConfigurationTarget.Global);
  void vscode.window.showInformationMessage('AI Markdown Studio AI features are enabled.');
  return true;
}

export async function ensureAiFeaturesEnabled(): Promise<boolean> {
  return (areAiFeaturesEnabled() && !isAiAuthorizationDenied()) || enableAiFeaturesCommand();
}

export function assertAiFeaturesEnabled(): void {
  if (isAiAuthorizationDenied() || !areAiFeaturesEnabled()) {
    throw new Error('AI Markdown Studio AI features are disabled. Run "Enable AI Features..." and accept the data-sharing notice before using this feature.');
  }
}
