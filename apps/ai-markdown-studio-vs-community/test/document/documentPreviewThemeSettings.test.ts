import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, fallback: unknown) => {
        if (key === 'documentPreviewTheme') return 'Custom...';
        if (key === 'documentPreviewThemeCustomName') return 'lumen-paper';
        return fallback;
      }),
    })),
  },
}));

import { getResolvedDocumentPreviewThemeSetting } from '../../src/document/documentPreviewThemeSettings';
import * as vscode from 'vscode';

describe('getResolvedDocumentPreviewThemeSetting', () => {
  it('returns the configured custom theme name when the custom selector is chosen', () => {
    const result = getResolvedDocumentPreviewThemeSetting({} as vscode.Uri);
    expect(result).toBe('lumen-paper');
  });

  it('falls back to auto when the custom name is blank', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string, fallback: unknown) => {
        if (key === 'documentPreviewTheme') return 'Custom...';
        if (key === 'documentPreviewThemeCustomName') return '   ';
        return fallback;
      }),
    } as never);

    const result = getResolvedDocumentPreviewThemeSetting({} as vscode.Uri);
    expect(result).toBe('auto');
  });
});
