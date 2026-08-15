import { describe, expect, it, vi } from 'vitest';

const getSetting = vi.fn((key: string, fallback: unknown) => key === 'presentationDefaultTheme' ? 'black' : fallback);

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({ get: getSetting })),
  },
}));

import { getResolvedPresentationPreviewThemeSetting } from '../../src/presentation/presentationPreviewThemeSettings';

describe('getResolvedPresentationPreviewThemeSetting', () => {
  it('returns the configured presentation theme', () => {
    expect(getResolvedPresentationPreviewThemeSetting({} as never)).toBe('black');
  });

  it('falls back to auto when the configured theme is blank', () => {
    getSetting.mockImplementation((_key, fallback) => fallback);

    expect(getResolvedPresentationPreviewThemeSetting({} as never)).toBe('auto');
  });
});
