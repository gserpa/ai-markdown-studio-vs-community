import * as vscode from 'vscode';
import { hasConfiguredCopilotAccount } from './copilotAvailability';

export const AI_ACCESS_SETTING = 'aiAccess';
const LEGACY_AI_FEATURES_SETTING = 'aiFeaturesEnabled';
const LEGACY_AI_AUTHORIZATION_DENIED_SETTING = 'aiAuthorizationDenied';
const AI_ACCESS_ASK_CONTEXT = 'markdownAiStudio.aiAccessAsk';
const AI_ACCESS_ENABLED_CONTEXT = 'markdownAiStudio.aiAccessEnabled';
const AI_ACCESS_DENIED_CONTEXT = 'markdownAiStudio.aiAccessDenied';
const AI_ACCESS_STATES = ['ask', 'enabled', 'denied'] as const;

export type AiAccessState = typeof AI_ACCESS_STATES[number];

const AI_DISCLOSURE = [
  'By enabling AI features, you accept that AI Markdown Studio may use the GitHub Copilot service already configured in VS Code for AI-supported functionality, such as document generation, presentation generation, and AI Paste to Markdown.',
  '',
  'For those AI-supported features, the content you provide may be shared with that configured Copilot service for processing. AI Markdown Studio does not connect to any other third-party AI service and does not bring its own AI account or credentials.',
  '',
  'Only enable this setting if you are authorized to share that content through the GitHub Copilot service already configured in VS Code. You can revoke access at any time by changing AI Markdown Studio: AI Access in Settings.',
].join('\n');

export function areAiFeaturesEnabled(): boolean {
  return getAiAccessState() === 'enabled';
}

export function isAiAuthorizationDenied(): boolean {
  return getAiAccessState() === 'denied';
}

export function getAiAccessState(): AiAccessState {
  return parseAiAccessState(
    vscode.workspace.getConfiguration('markdownAiStudio').get<string>(AI_ACCESS_SETTING, 'ask'),
  ) ?? 'ask';
}

export async function initializeAiConsent(): Promise<void> {
  const migratedState = await migrateLegacyAiConsentSetting();
  await refreshAiAccessContexts(migratedState);
}

export async function refreshAiAccessContexts(state = getAiAccessState()): Promise<void> {
  await Promise.all([
    vscode.commands.executeCommand('setContext', AI_ACCESS_ASK_CONTEXT, state === 'ask'),
    vscode.commands.executeCommand('setContext', AI_ACCESS_ENABLED_CONTEXT, state === 'enabled'),
    vscode.commands.executeCommand('setContext', AI_ACCESS_DENIED_CONTEXT, state === 'denied'),
  ]);
}

async function setAiAccessState(value: AiAccessState): Promise<void> {
  await vscode.workspace
    .getConfiguration('markdownAiStudio')
    .update(AI_ACCESS_SETTING, value, vscode.ConfigurationTarget.Global);
  await refreshAiAccessContexts(value);
}

async function migrateLegacyAiConsentSetting(): Promise<AiAccessState> {
  const configuration = vscode.workspace.getConfiguration('markdownAiStudio');
  const aiAccess = configuration.inspect<string>(AI_ACCESS_SETTING);
  const existingValue = parseAiAccessState(aiAccess?.globalValue);
  if (existingValue) {
    return existingValue;
  }

  const legacyDenied = configuration.inspect<boolean>(LEGACY_AI_AUTHORIZATION_DENIED_SETTING)?.globalValue === true;
  const legacyEnabled = configuration.inspect<boolean>(LEGACY_AI_FEATURES_SETTING)?.globalValue === true;
  const migratedState: AiAccessState = legacyDenied
    ? 'denied'
    : legacyEnabled
      ? 'enabled'
      : 'ask';

  await configuration.update(AI_ACCESS_SETTING, migratedState, vscode.ConfigurationTarget.Global);
  return migratedState;
}

export async function enableAiFeaturesCommand(): Promise<boolean> {
  if (!(await hasConfiguredCopilotAccount())) {
    void vscode.window.showInformationMessage('GitHub Copilot is not configured in VS Code yet. Sign in to GitHub before enabling AI Markdown Studio AI features.');
    return false;
  }

  const currentState = getAiAccessState();
  if (currentState === 'enabled') {
    void vscode.window.showInformationMessage('AI Markdown Studio AI features are already enabled.');
    return true;
  }

  const selected = await vscode.window.showWarningMessage(
    currentState === 'denied'
      ? 'Re-enable AI Markdown Studio AI features?'
      : 'Enable AI Markdown Studio AI features?',
    { modal: true, detail: AI_DISCLOSURE },
    'Enable AI Features',
    'Deny AI Features',
    'Review Settings',
  );
  if (selected === 'Review Settings') {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'markdownAiStudio.aiAccess');
    return false;
  }
  if (selected === 'Deny AI Features') {
    await setAiAccessState('denied');
    return false;
  }
  if (selected !== 'Enable AI Features') {
    return false;
  }

  await setAiAccessState('enabled');
  void vscode.window.showInformationMessage('AI Markdown Studio AI features are enabled.');
  return true;
}

export async function ensureAiFeaturesEnabled(): Promise<boolean> {
  return getAiAccessState() === 'enabled' || enableAiFeaturesCommand();
}

export function assertAiFeaturesEnabled(): void {
  if (getAiAccessState() !== 'enabled') {
    throw new Error('AI Markdown Studio AI features are disabled. Run "Enable AI Features..." and accept the data-sharing notice before using this feature.');
  }
}

function parseAiAccessState(value: string | undefined): AiAccessState | undefined {
  return typeof value === 'string' && AI_ACCESS_STATES.includes(value as AiAccessState)
    ? value as AiAccessState
    : undefined;
}
