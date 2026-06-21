import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({
  aiAccess: undefined as 'ask' | 'enabled' | 'denied' | undefined,
  legacyEnabled: undefined as boolean | undefined,
  legacyDenied: undefined as boolean | undefined,
  copilotConfigured: true,
}));

const mocks = vi.hoisted(() => ({
  executeCommand: vi.fn(async (_command: string, _arg?: unknown) => undefined),
  update: vi.fn(async (name: string, value: unknown) => {
    if (name === 'aiAccess') {
      settings.aiAccess = value as 'ask' | 'enabled' | 'denied';
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
      get: (name: string, fallback: string) => {
        if (name === 'aiAccess') return settings.aiAccess ?? fallback;
        return fallback;
      },
      inspect: (name: string) => {
        if (name === 'aiAccess') return { globalValue: settings.aiAccess };
        if (name === 'aiFeaturesEnabled') return { globalValue: settings.legacyEnabled };
        if (name === 'aiAuthorizationDenied') return { globalValue: settings.legacyDenied };
        return { globalValue: undefined };
      },
      update: mocks.update,
    }),
  },
  window: {
    showWarningMessage: mocks.showWarningMessage,
    showInformationMessage: mocks.showInformationMessage,
  },
  commands: { executeCommand: mocks.executeCommand },
  ConfigurationTarget: { Global: 1 },
}));

import {
  areAiFeaturesEnabled,
  assertAiFeaturesEnabled,
  enableAiFeaturesCommand,
  ensureAiFeaturesEnabled,
  getAiAccessState,
  initializeAiConsent,
  isAiAuthorizationDenied,
} from '../../src/ai/aiConsent';

describe('AI consent', () => {
  beforeEach(() => {
    settings.aiAccess = undefined;
    settings.legacyEnabled = undefined;
    settings.legacyDenied = undefined;
    settings.copilotConfigured = true;
    mocks.executeCommand.mockClear();
    mocks.update.mockClear();
    mocks.showWarningMessage.mockReset();
    mocks.showInformationMessage.mockClear();
  });

  it('defaults to ask and blocks AI use until accepted', async () => {
    await initializeAiConsent();

    expect(getAiAccessState()).toBe('ask');
    expect(areAiFeaturesEnabled()).toBe(false);
    expect(isAiAuthorizationDenied()).toBe(false);
    expect(() => assertAiFeaturesEnabled()).toThrow(/Enable AI Features/);
    expect(mocks.update).toHaveBeenCalledWith('aiAccess', 'ask', 1);
    expect(mocks.executeCommand).toHaveBeenCalledWith('setContext', 'markdownAiStudio.aiAccessAsk', true);
  });

  it('migrates legacy enabled-only state to enabled', async () => {
    settings.legacyEnabled = true;

    await initializeAiConsent();

    expect(getAiAccessState()).toBe('enabled');
    expect(mocks.update).toHaveBeenCalledWith('aiAccess', 'enabled', 1);
  });

  it('migrates legacy denied-only state to denied', async () => {
    settings.legacyDenied = true;

    await initializeAiConsent();

    expect(getAiAccessState()).toBe('denied');
    expect(mocks.update).toHaveBeenCalledWith('aiAccess', 'denied', 1);
  });

  it('prefers denied when both legacy settings conflict', async () => {
    settings.legacyEnabled = true;
    settings.legacyDenied = true;

    await initializeAiConsent();

    expect(getAiAccessState()).toBe('denied');
    expect(mocks.update).toHaveBeenCalledWith('aiAccess', 'denied', 1);
  });

  it('migrates explicit legacy false values to ask', async () => {
    settings.legacyEnabled = false;
    settings.legacyDenied = false;

    await initializeAiConsent();

    expect(getAiAccessState()).toBe('ask');
    expect(mocks.update).toHaveBeenCalledWith('aiAccess', 'ask', 1);
  });

  it('does not migrate again when aiAccess is already set', async () => {
    settings.aiAccess = 'enabled';

    await initializeAiConsent();

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.executeCommand).toHaveBeenCalledWith('setContext', 'markdownAiStudio.aiAccessEnabled', true);
  });

  it('enables AI only after the user accepts the notice from ask state', async () => {
    settings.aiAccess = 'ask';
    mocks.showWarningMessage.mockResolvedValue('Enable AI Features');

    expect(await ensureAiFeaturesEnabled()).toBe(true);
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
    expect(getAiAccessState()).toBe('enabled');
  });

  it('persists denied when the user declines from ask state', async () => {
    settings.aiAccess = 'ask';
    mocks.showWarningMessage.mockResolvedValue('Deny AI Features');

    expect(await ensureAiFeaturesEnabled()).toBe(false);
    expect(getAiAccessState()).toBe('denied');
    expect(() => assertAiFeaturesEnabled()).toThrow(/Enable AI Features/);
  });

  it('allows re-enabling after an explicit denial', async () => {
    settings.aiAccess = 'denied';
    mocks.showWarningMessage.mockResolvedValue('Enable AI Features');

    expect(await enableAiFeaturesCommand()).toBe(true);
    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      'Re-enable AI Markdown Studio AI features?',
      expect.any(Object),
      'Enable AI Features',
      'Deny AI Features',
      'Review Settings',
    );
    expect(getAiAccessState()).toBe('enabled');
  });

  it('opens settings for the new aiAccess key when requested', async () => {
    settings.aiAccess = 'ask';
    mocks.showWarningMessage.mockResolvedValue('Review Settings');

    expect(await enableAiFeaturesCommand()).toBe(false);
    expect(mocks.executeCommand).toHaveBeenCalledWith('workbench.action.openSettings', 'markdownAiStudio.aiAccess');
    expect(getAiAccessState()).toBe('ask');
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
