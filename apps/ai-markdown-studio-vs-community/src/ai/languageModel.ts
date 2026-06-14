import * as vscode from 'vscode';
import { assertAiFeaturesEnabled } from './aiConsent';
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const CLIPBOARD_TO_MARKDOWN_PROMPT = [
  'Convert the supplied clipboard content into well-structured Markdown.',
  'Preserve all meaningful information and hierarchy.',
  'Use headings, lists, tables, blockquotes, and fenced code blocks when appropriate.',
  'Return raw Markdown only, without a code fence around the complete response.',
].join('\n');

export async function isLanguageModelAvailable(): Promise<boolean> {
  return (await vscode.lm.selectChatModels({ vendor: 'copilot' })).length > 0;
}

export async function convertClipboardTextToMarkdown(
  text: string,
  cancellationToken?: vscode.CancellationToken,
): Promise<string> {
  return generateTextWithLanguageModel(
    `${CLIPBOARD_TO_MARKDOWN_PROMPT}\n\n---\n\n${text}`,
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
