import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({
  enabled: false,
  denied: false,
  copilotConfigured: true,
}));

const mocks = vi.hoisted(() => ({
  update: vi.fn(async (name: string, value: boolean) => {
    if (name === 'aiFeaturesEnabled') {
      settings.enabled = value;
    }
    if (name === 'aiAuthorizationDenied') {
      settings.denied = value;
    }
  }),
  showWarningMessage: vi.fn(),
  showInformationMessage: vi.fn(),
}));

vi.mock('vscode', () => ({
  authentication: {
    getAccounts: vi.fn(async () => (settings.copilotConfigured ? [{ id: 'github-account' }] : [])),
  },
  workspace: {
    getConfiguration: () => ({
      get: (name: string, fallback: boolean) => {
        if (name === 'aiFeaturesEnabled') return settings.enabled ?? fallback;
        if (name === 'aiAuthorizationDenied') return settings.denied ?? fallback;
        return fallback;
      },
      update: mocks.update,
    }),
  },
  window: {
    showWarningMessage: mocks.showWarningMessage,
    showInformationMessage: mocks.showInformationMessage,
  },
  commands: { executeCommand: vi.fn() },
  ConfigurationTarget: { Global: 1 },
}));

import { areAiFeaturesEnabled, assertAiFeaturesEnabled, enableAiFeaturesCommand, isAiAuthorizationDenied } from '../../src/ai/aiConsent';

describe('AI consent', () => {
  beforeEach(() => {
    settings.enabled = false;
    settings.denied = false;
    settings.copilotConfigured = true;
    mocks.update.mockClear();
    mocks.showWarningMessage.mockReset();
    mocks.showInformationMessage.mockClear();
  });

  it('is disabled by default and blocks AI use', () => {
    expect(areAiFeaturesEnabled()).toBe(false);
    expect(isAiAuthorizationDenied()).toBe(false);
    expect(() => assertAiFeaturesEnabled()).toThrow(/Enable AI Features/);
  });

  it('enables AI only after the user accepts the notice', async () => {
    mocks.showWarningMessage.mockResolvedValue('Enable AI Features');

    expect(await enableAiFeaturesCommand()).toBe(true);
    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      'Enable AI Markdown Studio AI features?',
      expect.objectContaining({
        modal: true,
        detail: expect.stringContaining('AI-supported functionality'),
      }),
      'Enable AI Features',
      'Deny AI Features',
      'Review Settings',
    );
    expect(settings.denied).toBe(false);
    expect(settings.enabled).toBe(true);
  });

  it('remembers an explicit denial and keeps AI disabled', async () => {
    mocks.showWarningMessage.mockResolvedValue('Deny AI Features');

    expect(await enableAiFeaturesCommand()).toBe(false);
    expect(settings.denied).toBe(true);
    expect(settings.enabled).toBe(false);
    expect(() => assertAiFeaturesEnabled()).toThrow(/Enable AI Features/);
  });

  it('allows re-enabling after an explicit denial', async () => {
    settings.denied = true;
    mocks.showWarningMessage.mockResolvedValue('Enable AI Features');

    expect(await enableAiFeaturesCommand()).toBe(true);
    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      'Re-enable AI Markdown Studio AI features?',
      expect.any(Object),
      'Enable AI Features',
      'Deny AI Features',
      'Review Settings',
    );
    expect(settings.denied).toBe(false);
    expect(settings.enabled).toBe(true);
  });

  it('does not show the consent flow when Copilot is not configured', async () => {
    settings.copilotConfigured = false;

    expect(await enableAiFeaturesCommand()).toBe(false);
    expect(mocks.showWarningMessage).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(
      'GitHub Copilot is not configured in VS Code yet. Sign in to GitHub before enabling AI Markdown Studio AI features.',
    );
  });
});
