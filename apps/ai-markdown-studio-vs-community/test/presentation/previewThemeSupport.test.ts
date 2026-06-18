import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      inspect: vi.fn(() => undefined),
    })),
  },
  Uri: {
    file: vi.fn(),
    joinPath: vi.fn(),
  },
}));

vi.mock('@mfo/preview-web', () => ({
  loadDocumentThemeRegistryFromDirectories: vi.fn(),
  loadPreviewThemeRegistryFromDirectories: vi.fn(),
}));

import { getConfiguredGlobalPreviewThemeDirectory } from '../../src/presentation/previewThemeSupport';
import * as vscode from 'vscode';

describe('getConfiguredGlobalPreviewThemeDirectory', () => {
  const originalUserProfile = process.env.USERPROFILE;

  afterEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockReset();
    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }
  });

  it('expands USERPROFILE and creates the configured presentation themes folder', () => {
    const userProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-md-preso-theme-'));
    const expectedPath = path.join(userProfile, 'AI Markdown Studio', 'Themes', 'Presentation');
    process.env.USERPROFILE = userProfile;

    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      inspect: vi.fn((key: string) => (
        key === 'presentationThemesFolder'
          ? { defaultValue: '%USERPROFILE%\\AI Markdown Studio\\Themes\\Presentation' }
          : undefined
      )),
    } as never);

    try {
      const resolvedPath = getConfiguredGlobalPreviewThemeDirectory();

      expect(resolvedPath).toBe(path.normalize(expectedPath));
      expect(fs.existsSync(expectedPath)).toBe(true);
      expect(fs.statSync(expectedPath).isDirectory()).toBe(true);
    } finally {
      fs.rmSync(userProfile, { recursive: true, force: true });
    }
  });
});
