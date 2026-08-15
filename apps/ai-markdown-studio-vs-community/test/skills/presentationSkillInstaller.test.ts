import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDirectory: vi.fn(),
  readFile: vi.fn(),
  showInformationMessage: vi.fn(),
  showQuickPick: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
  workspaceFolders: [{ name: 'project', uri: uri('C:/workspace/project') }],
}));

function uri(fsPath: string) {
  return { fsPath, scheme: 'file', toString: () => `file:///${fsPath.replace(/\\/gu, '/')}` };
}

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (base: { fsPath: string }, ...segments: string[]) => uri([base.fsPath, ...segments].join('/')),
  },
  window: {
    activeTextEditor: undefined,
    showInformationMessage: mocks.showInformationMessage,
    showQuickPick: mocks.showQuickPick,
  },
  workspace: {
    getWorkspaceFolder: vi.fn(),
    get workspaceFolders() {
      return mocks.workspaceFolders;
    },
    fs: {
      createDirectory: mocks.createDirectory,
      readFile: mocks.readFile,
      stat: mocks.stat,
      writeFile: mocks.writeFile,
    },
  },
}));

import { installPresentationSkillInWorkspace } from '../../src/skills/presentationSkillInstaller';

describe('presentation skill installer', () => {
  const context = {
    extensionUri: uri('C:/extension'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceFolders = [{ name: 'project', uri: uri('C:/workspace/project') }];
    mocks.stat.mockRejectedValue(new Error('missing'));
    mocks.readFile.mockResolvedValue(Buffer.from('skill content'));
    mocks.createDirectory.mockResolvedValue(undefined);
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.showQuickPick.mockResolvedValue({
      target: {
        label: 'GitHub Copilot',
        sourceSkillName: 'markdown-ai-studio-presentation-copilot',
        workspacePath: ['.github', 'skills', 'markdown-ai-studio-presentation-copilot'],
      },
    });
  });

  it('installs the packaged skill without requiring a model provider', async () => {
    await installPresentationSkillInWorkspace(context as never);

    expect(mocks.readFile).toHaveBeenCalledWith(expect.objectContaining({ fsPath: 'C:/extension/skills/markdown-ai-studio-presentation-copilot/SKILL.md' }));
    expect(mocks.createDirectory).toHaveBeenCalledWith(expect.objectContaining({ fsPath: 'C:/workspace/project/.github/skills/markdown-ai-studio-presentation-copilot' }));
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: 'C:/workspace/project/.github/skills/markdown-ai-studio-presentation-copilot/SKILL.md' }),
      Buffer.from('skill content'),
    );
  });

  it.each([
    ['Claude', 'markdown-ai-studio-presentation', ['.claude', 'skills', 'markdown-ai-studio-presentation']],
    ['Codex', 'markdown-ai-studio-presentation', ['.agents', 'skills', 'markdown-ai-studio-presentation']],
  ])('installs the complete portable skill for %s', async (label, sourceSkillName, workspacePath) => {
    mocks.showQuickPick.mockResolvedValue({
      target: { label, sourceSkillName, workspacePath },
    });

    await installPresentationSkillInWorkspace(context as never);

    expect(mocks.readFile).toHaveBeenCalledWith(expect.objectContaining({ fsPath: `C:/extension/skills/${sourceSkillName}/SKILL.md` }));
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: `C:/workspace/project/${workspacePath.join('/')}/SKILL.md` }),
      Buffer.from('skill content'),
    );
  });

  it('does not overwrite an existing workspace skill', async () => {
    mocks.stat.mockResolvedValue({});

    await installPresentationSkillInWorkspace(context as never);

    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('already exists'));
  });
});
