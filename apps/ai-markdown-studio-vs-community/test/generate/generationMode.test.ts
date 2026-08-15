import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  available: false,
  denied: false,
  ensureAiFeaturesEnabled: vi.fn(),
  showInformationMessage: vi.fn(),
  showQuickPick: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('vscode', () => ({
  env: { clipboard: { writeText: mocks.writeText } },
  window: {
    showInformationMessage: mocks.showInformationMessage,
    showQuickPick: mocks.showQuickPick,
  },
}));

vi.mock('../../src/ai/languageModel', () => ({
  isLanguageModelAvailable: vi.fn(async () => mocks.available),
}));

vi.mock('../../src/ai/aiConsent', () => ({
  ensureAiFeaturesEnabled: mocks.ensureAiFeaturesEnabled,
  isAiAuthorizationDenied: () => mocks.denied,
}));

import { shouldGenerateWithLanguageModel } from '../../src/generate/generationMode';

describe('presentation generation mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.available = false;
    mocks.denied = false;
    mocks.ensureAiFeaturesEnabled.mockResolvedValue(true);
  });

  it('copies the prompt and runs the local callback when Copilot is unavailable', async () => {
    const onPromptCopied = vi.fn();

    await expect(shouldGenerateWithLanguageModel('MPS prompt', onPromptCopied)).resolves.toBe(false);

    expect(mocks.writeText).toHaveBeenCalledWith('MPS prompt');
    expect(onPromptCopied).toHaveBeenCalledOnce();
    expect(mocks.showQuickPick).not.toHaveBeenCalled();
    expect(mocks.ensureAiFeaturesEnabled).not.toHaveBeenCalled();
  });

  it('copies the prompt without a model request when Copilot access was denied', async () => {
    mocks.available = true;
    mocks.denied = true;
    const onPromptCopied = vi.fn();

    await expect(shouldGenerateWithLanguageModel('MPS prompt', onPromptCopied)).resolves.toBe(false);

    expect(mocks.writeText).toHaveBeenCalledWith('MPS prompt');
    expect(onPromptCopied).toHaveBeenCalledOnce();
    expect(mocks.showQuickPick).not.toHaveBeenCalled();
    expect(mocks.ensureAiFeaturesEnabled).not.toHaveBeenCalled();
  });

  it('keeps the native generate-or-copy choice when Copilot is available', async () => {
    mocks.available = true;
    mocks.showQuickPick.mockResolvedValue({ value: 'generate' });

    await expect(shouldGenerateWithLanguageModel('MPS prompt')).resolves.toBe(true);

    expect(mocks.writeText).not.toHaveBeenCalled();
    expect(mocks.ensureAiFeaturesEnabled).toHaveBeenCalledOnce();
  });
});
