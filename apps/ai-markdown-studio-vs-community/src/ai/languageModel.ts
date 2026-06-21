import * as vscode from 'vscode';
import { assertAiFeaturesEnabled } from './aiConsent';
import { buildClipboardMarkdownPrompt } from './clipboardMarkdown';
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

export async function isLanguageModelAvailable(): Promise<boolean> {
  return (await vscode.lm.selectChatModels({ vendor: 'copilot' })).length > 0;
}

export async function convertClipboardTextToMarkdown(
  text: string,
  cancellationToken?: vscode.CancellationToken,
): Promise<string> {
  return generateTextWithLanguageModel(
    buildClipboardMarkdownPrompt(text),
    cancellationToken,
    'Convert clipboard content to Markdown',
  );
}

export async function generateTextWithLanguageModel(
  prompt: string,
  cancellationToken?: vscode.CancellationToken,
  justification = 'Generate AI Markdown Studio content',
): Promise<string> {
  assertAiFeaturesEnabled();
  const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
  if (models.length === 0) {
    throw new Error('GitHub Copilot is required. Install the GitHub Copilot extension and sign in to use this feature.');
  }

  const timeoutSource = new vscode.CancellationTokenSource();
  const forwardCancellation = cancellationToken?.onCancellationRequested(() => timeoutSource.cancel());
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    timeoutSource.cancel();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await models[0].sendRequest(
      [vscode.LanguageModelChatMessage.User(prompt)],
      { justification },
      timeoutSource.token,
    );
    let result = '';
    for await (const fragment of response.text) {
      result += fragment;
    }
    if (timedOut) {
      throw new Error('The AI request timed out after 10 minutes.');
    }
    if (cancellationToken?.isCancellationRequested) {
      throw new vscode.CancellationError();
    }
    return result;
  } finally {
    clearTimeout(timeoutHandle);
    forwardCancellation?.dispose();
    timeoutSource.dispose();
  }
}
