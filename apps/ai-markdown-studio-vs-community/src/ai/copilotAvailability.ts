import * as vscode from 'vscode';

export const COPILOT_CONFIGURED_CONTEXT = 'markdownAiStudio.copilotConfigured';
const COPILOT_AUTH_PROVIDERS = ['github', 'github-enterprise'] as const;

export async function hasConfiguredCopilotAccount(): Promise<boolean> {
  for (const providerId of COPILOT_AUTH_PROVIDERS) {
    const accounts = await vscode.authentication.getAccounts(providerId);
    if (accounts.length > 0) {
      return true;
    }
  }

  return false;
}

export async function refreshCopilotConfiguredContext(): Promise<boolean> {
  const configured = await hasConfiguredCopilotAccount();
  await vscode.commands.executeCommand('setContext', COPILOT_CONFIGURED_CONTEXT, configured);
  return configured;
}
