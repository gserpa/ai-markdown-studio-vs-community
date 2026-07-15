import * as vscode from 'vscode';
import { assertAiFeaturesEnabled } from './aiConsent';
import { buildClipboardMarkdownPrompt } from './clipboardMarkdown';
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_AI_MODEL = 'gpt-5.6-luna';
export const FALLBACK_AI_MODEL = 'gpt-5.4-mini';
let outputChannel: vscode.OutputChannel | undefined;

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
  const models = await selectModelCandidates();
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
    let lastError: unknown;
    for (const model of models) {
      logModel(`Trying Copilot model ${describeModel(model)}.`);
      try {
        const response = await model.sendRequest(
          [vscode.LanguageModelChatMessage.User(prompt)],
          { justification },
          timeoutSource.token,
        );
        let result = '';
        for await (const fragment of response.text) result += fragment;
        if (timedOut) throw new Error('The AI request timed out after 10 minutes.');
        if (cancellationToken?.isCancellationRequested) throw new vscode.CancellationError();
        logModel(`Copilot model succeeded: ${describeModel(model)}.`);
        return result;
      } catch (error) {
        if (timedOut || cancellationToken?.isCancellationRequested) throw error;
        lastError = error;
        logModel(`Copilot model failed: ${describeModel(model)}. ${describeError(error)}`);
      }
    }
    throw lastError ?? new Error('No Copilot language model could complete the request.');
  } finally {
    clearTimeout(timeoutHandle);
    forwardCancellation?.dispose();
    timeoutSource.dispose();
  }
}

async function selectModelCandidates(): Promise<vscode.LanguageModelChat[]> {
  const configuredModel = vscode.workspace.getConfiguration('markdownAiStudio')
    .get<string>('aiModel', DEFAULT_AI_MODEL).trim() || DEFAULT_AI_MODEL;
  const candidates: vscode.LanguageModelChat[] = [];
  const seen = new Set<string>();
  for (const family of [configuredModel, FALLBACK_AI_MODEL]) {
    for (const model of await selectChatModels(family)) {
      const key = `${model.vendor}:${model.family}:${model.id}`;
      if (!seen.has(key)) { seen.add(key); candidates.push(model); }
    }
  }
  for (const model of await selectChatModels()) {
    const key = `${model.vendor}:${model.family}:${model.id}`;
    if (!seen.has(key)) { seen.add(key); candidates.push(model); }
  }
  logModel(`Configured model: ${configuredModel}. Candidate order: ${candidates.map(describeModel).join(', ') || 'none'}.`);
  return candidates;
}

function describeModel(model: vscode.LanguageModelChat): string {
  return model.family || model.id || 'unknown';
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logModel(message: string): void {
  try {
    outputChannel ??= vscode.window.createOutputChannel('AI Markdown Studio');
    outputChannel.appendLine(`[AI model] ${message}`);
  } catch {
    // Diagnostics must never interfere with an AI request.
  }
}

async function selectChatModels(family?: string): Promise<vscode.LanguageModelChat[]> {
  try {
    return await vscode.lm.selectChatModels(family ? { vendor: 'copilot', family } : { vendor: 'copilot' });
  } catch {
    return [];
  }
}
