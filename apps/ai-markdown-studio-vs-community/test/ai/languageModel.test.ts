import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  settings: {} as Record<string, string>,
  models: [] as Array<{ id: string; family: string; vendor: string; sendRequest: ReturnType<typeof vi.fn> }>,
  info: vi.fn(),
  log: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: { getConfiguration: () => ({ get: (key: string, fallback: string) => state.settings[key] ?? fallback }) },
  lm: { selectChatModels: vi.fn(async (selector: { family?: string }) => state.models.filter((model) => !selector.family || model.family === selector.family)) },
  LanguageModelChatMessage: { User: (text: string) => ({ text }) },
  CancellationTokenSource: class {
    token = {};
    cancel() {}
    dispose() {}
  },
  CancellationError: class extends Error {},
  window: { createOutputChannel: () => ({ appendLine: state.log }), showInformationMessage: state.info },
}));
vi.mock('../../src/ai/aiConsent', () => ({ assertAiFeaturesEnabled: vi.fn() }));

import { generateTextWithLanguageModel } from '../../src/ai/languageModel';

function model(id: string, family = id, response: string | Error = id) {
  const sendRequest = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return { text: (async function* () { yield response; })() };
  });
  return { id, family, vendor: 'copilot', sendRequest };
}

beforeEach(() => {
  state.settings = {};
  state.models = [];
  state.info.mockClear();
  state.log.mockClear();
});

describe('Copilot model selection', () => {
  it('uses the generation model by ID even when its family differs', async () => {
    const opus = model('claude-opus-5.5', 'claude-opus');
    const luna = model('gpt-5.6-luna');
    state.models = [luna, opus];
    await expect(generateTextWithLanguageModel('prompt', undefined, 'Generate', 'generation')).resolves.toBe('claude-opus-5.5');
    expect(opus.sendRequest).toHaveBeenCalledOnce();
    expect(luna.sendRequest).not.toHaveBeenCalled();
    expect(state.info).not.toHaveBeenCalled();
  });

  it('falls back in quality order when configured and preferred models fail or are unavailable', async () => {
    state.settings.aiGenerationModel = 'custom';
    const custom = model('custom', 'custom', new Error('failed'));
    const sonnet = model('claude-sonnet-5.5');
    const luna = model('gpt-5.6-luna');
    state.models = [luna, sonnet, custom];
    await expect(generateTextWithLanguageModel('prompt', undefined, 'Generate', 'generation')).resolves.toBe('claude-sonnet-5.5');
    expect(custom.sendRequest).toHaveBeenCalledOnce();
    expect(sonnet.sendRequest).toHaveBeenCalledOnce();
    expect(luna.sendRequest).not.toHaveBeenCalled();
    expect(state.info).toHaveBeenCalledWith(expect.stringContaining('claude-sonnet-5.5'));
  });

  it('uses the existing aiModel setting for general requests and retries unsuccessful models', async () => {
    state.settings.aiModel = 'custom';
    state.settings.aiGenerationModel = 'claude-opus-5.5';
    const custom = model('custom', 'custom', new Error('failed'));
    const mini = model('gpt-5.4-mini');
    const opus = model('claude-opus-5.5');
    state.models = [opus, mini, custom];
    await expect(generateTextWithLanguageModel('prompt')).resolves.toBe('gpt-5.4-mini');
    expect(custom.sendRequest).toHaveBeenCalledOnce();
    expect(mini.sendRequest).toHaveBeenCalledOnce();
    expect(opus.sendRequest).not.toHaveBeenCalled();
  });

  it('tries another generation model when a response is empty', async () => {
    const opus = model('claude-opus-5.5', 'claude-opus-5.5', '   ');
    const sonnet = model('claude-sonnet-5.5');
    state.models = [opus, sonnet];
    await expect(generateTextWithLanguageModel('prompt', undefined, 'Generate', 'generation')).resolves.toBe('claude-sonnet-5.5');
    expect(opus.sendRequest).toHaveBeenCalledOnce();
    expect(sonnet.sendRequest).toHaveBeenCalledOnce();
  });

  it('does not retry after cancellation', async () => {
    const opus = model('claude-opus-5.5', 'claude-opus-5.5', new Error('cancelled'));
    const sonnet = model('claude-sonnet-5.5');
    state.models = [opus, sonnet];
    const token = { isCancellationRequested: true, onCancellationRequested: () => ({ dispose() {} }) };
    await expect(generateTextWithLanguageModel('prompt', token, 'Generate', 'generation')).rejects.toThrow('cancelled');
    expect(sonnet.sendRequest).not.toHaveBeenCalled();
  });

  it('propagates failure when all available models fail', async () => {
    const failed = model('gpt-5.4-mini', 'gpt-5.4-mini', new Error('request failed'));
    state.models = [failed];
    await expect(generateTextWithLanguageModel('prompt', undefined, 'Generate', 'generation')).rejects.toThrow('request failed');
    expect(failed.sendRequest).toHaveBeenCalledOnce();
  });

  it('reports when no Copilot models are available', async () => {
    await expect(generateTextWithLanguageModel('prompt', undefined, 'Generate', 'generation')).rejects.toThrow('GitHub Copilot is required');
  });
});
