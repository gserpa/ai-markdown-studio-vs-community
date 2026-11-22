import * as vscode from 'vscode';
import { assertAiFeaturesEnabled } from './aiConsent';
import { buildClipboardMarkdownPrompt } from './clipboardMarkdown';
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_AI_MODEL = 'gpt-5.6-luna';
export const FALLBACK_AI_MODEL = 'gpt-5.4-mini';
const DEFAULT_GENERATION_AI_MODEL = 'claude-opus-5.5';
const GENERATION_FALLBACK_MODELS = ['claude-sonnet-5.5', DEFAULT_AI_MODEL, FALLBACK_AI_MODEL];
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
  purpose: 'general' | 'generation' = 'general',
): Promise<string> {
  assertAiFeaturesEnabled();
  const { models, configuredModel } = await selectModelCandidates(purpose);
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
        if (purpose === 'generation' && !result.trim()) throw new Error('The AI model returned an empty response.');
        logModel(`Copilot model succeeded: ${describeModel(model)}.`);
        if (purpose === 'generation' && model.family !== configuredModel && model.id !== configuredModel) {
          void vscode.window.showInformationMessage(`AI generation used ${describeModel(model)} because ${configuredModel} was unavailable or unsuccessful.`);
        }
        return result;
      } catch (error) {
        if (timedOut) throw new Error('The AI request timed out after 10 minutes.');
        if (cancellationToken?.isCancellationRequested) throw error;
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

async function selectModelCandidates(purpose: 'general' | 'generation'): Promise<{ models: vscode.LanguageModelChat[]; configuredModel: string }> {
  const config = vscode.workspace.getConfiguration('markdownAiStudio');
  const configuredModel = purpose === 'generation'
    ? config.get<string>('aiGenerationModel', DEFAULT_GENERATION_AI_MODEL).trim() || DEFAULT_GENERATION_AI_MODEL
    : config.get<string>('aiModel', DEFAULT_AI_MODEL).trim() || DEFAULT_AI_MODEL;
  const candidates: vscode.LanguageModelChat[] = [];
  const seen = new Set<string>();
  const availableModels = purpose === 'generation' ? await selectChatModels() : undefined;
  const addModel = (model: vscode.LanguageModelChat) => {
    const key = `${model.vendor}:${model.family}:${model.id}`;
    if (!seen.has(key)) { seen.add(key); candidates.push(model); }
  };
  const fallbackModels = purpose === 'generation'
    ? [DEFAULT_GENERATION_AI_MODEL, ...GENERATION_FALLBACK_MODELS]
    : [FALLBACK_AI_MODEL];
  for (const family of new Set([configuredModel, ...fallbackModels])) {
    for (const model of availableModels?.filter((candidate) => candidate.id === family) ?? []) addModel(model);
    for (const model of await selectChatModels(family)) {
      addModel(model);
    }
  }
  for (const model of availableModels ?? await selectChatModels()) addModel(model);
  logModel(`Configured ${purpose} model: ${configuredModel}. Candidate order: ${candidates.map(describeModel).join(', ') || 'none'}.`);
  return { models: candidates, configuredModel };
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
  } catch (error) {
    logModel(`Could not list Copilot models${family ? ` for ${family}` : ''}: ${describeError(error)}`);
    return [];
  }
}
