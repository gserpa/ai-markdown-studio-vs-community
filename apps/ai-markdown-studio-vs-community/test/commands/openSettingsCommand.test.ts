import { describe, expect, it, vi } from 'vitest';

const vscodeMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vscodeMocks.executeCommand,
  },
}));

import { openSettingsCommand } from '../../src/commands/markdownCommands';

describe('openSettingsCommand', () => {
  it('opens the markdownAiStudio settings search', async () => {
    await openSettingsCommand('GustavoSerpa.markdown-ai-studio-pro');

    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      '@ext:GustavoSerpa.markdown-ai-studio-pro markdownAiStudio',
    );
  });
});
