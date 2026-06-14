import * as vscode from 'vscode';
import { isLanguageModelAvailable } from '../ai/languageModel';
import { ensureAiFeaturesEnabled } from '../ai/aiConsent';

export async function shouldGenerateWithLanguageModel(prompt: string): Promise<boolean> {
  if (!(await isLanguageModelAvailable())) {
    await copyPrompt(prompt, 'No Copilot model is available.');
    return false;
  }

  const selected = await vscode.window.showQuickPick([
    {
      label: 'Generate Now',
      description: 'Use GitHub Copilot in VS Code.',
      value: 'generate' as const,
    },
    {
      label: 'Copy Prompt for AI Chat',
      description: 'Use the controlled prompt in Copilot Chat, ChatGPT, or another AI chat.',
      value: 'clipboard' as const,
    },
  ], {
    title: 'AI Markdown Studio',
    placeHolder: 'Choose how to generate this content',
    ignoreFocusOut: true,
  });

  if (selected?.value === 'clipboard') {
    await copyPrompt(prompt, 'Prompt copied.');
  }
  return selected?.value === 'generate' && await ensureAiFeaturesEnabled();
}

async function copyPrompt(prompt: string, prefix: string): Promise<void> {
  await vscode.env.clipboard.writeText(prompt);
  void vscode.window.showInformationMessage(`${prefix} Paste it into your AI chat and save the returned Markdown in your workspace.`);
}
