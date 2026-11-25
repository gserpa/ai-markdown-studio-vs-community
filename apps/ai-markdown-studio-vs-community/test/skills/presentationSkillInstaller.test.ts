import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  FileSystemError: class extends Error {
    constructor(public code: string) { super(code); }
  },
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
  FileSystemError: mocks.FileSystemError,
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

import { installPresentationSkillInWorkspace, offerPresentationSkillInstallation } from '../../src/skills/presentationSkillInstaller';

describe('presentation skill installer', () => {
  const context = {
    extensionUri: uri('C:/extension'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceFolders = [{ name: 'project', uri: uri('C:/workspace/project') }];
    mocks.stat.mockRejectedValue(new mocks.FileSystemError('FileNotFound'));
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

  it('installs both packaged skills without requiring a model provider', async () => {
    await installPresentationSkillInWorkspace(context as never);

    expect(mocks.readFile).toHaveBeenCalledWith(expect.objectContaining({ fsPath: 'C:/extension/skills/markdown-ai-studio-presentation-copilot/SKILL.md' }));
    expect(mocks.createDirectory).toHaveBeenCalledWith(expect.objectContaining({ fsPath: 'C:/workspace/project/.github/skills/markdown-ai-studio-presentation-copilot/references' }));
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: 'C:/workspace/project/.github/skills/markdown-ai-studio-presentation-copilot/SKILL.md' }),
      Buffer.from('skill content'),
    );
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: 'C:/workspace/project/.github/skills/markdown-ai-studio-presentation-copilot/references/visualizations.md' }),
      Buffer.from('skill content'),
    );
    expect(mocks.readFile).toHaveBeenCalledWith(expect.objectContaining({ fsPath: 'C:/extension/skills/revise-from-comments/SKILL.md' }));
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: 'C:/workspace/project/.github/skills/revise-from-comments/SKILL.md' }),
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
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: `C:/workspace/project/${workspacePath.join('/')}/references/visualizations.md` }),
      Buffer.from('skill content'),
    );
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: `C:/workspace/project/${workspacePath.slice(0, -1).join('/')}/revise-from-comments/SKILL.md` }),
      Buffer.from('skill content'),
    );
  });

  it('does not overwrite existing workspace skills', async () => {
    mocks.stat.mockResolvedValue({});

    await installPresentationSkillInWorkspace(context as never);

    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('not changed'));
  });

  it('installs the review skill when the presentation reference already exists', async () => {
    mocks.stat.mockImplementation(async (target: { fsPath: string }) => {
      if (target.fsPath.endsWith('/references/visualizations.md')) return {};
      throw new mocks.FileSystemError('FileNotFound');
    });
    await installPresentationSkillInWorkspace(context as never);
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: 'C:/workspace/project/.github/skills/revise-from-comments/SKILL.md' }),
      Buffer.from('skill content'),
    );
  });

  it.each([
    ['presentation', 'markdown-ai-studio-presentation-copilot', 'revise-from-comments'],
    ['review', 'revise-from-comments', 'markdown-ai-studio-presentation-copilot'],
  ])('installs the missing skill when the %s skill already exists', async (_label, existing, missing) => {
    mocks.stat.mockImplementation(async (target: { fsPath: string }) => {
      if (target.fsPath.endsWith(`/${existing}/SKILL.md`)) return {};
      throw new mocks.FileSystemError('FileNotFound');
    });
    await installPresentationSkillInWorkspace(context as never);
    expect(mocks.writeFile).not.toHaveBeenCalledWith(expect.objectContaining({ fsPath: `C:/workspace/project/.github/skills/${existing}/SKILL.md` }), expect.anything());
    expect(mocks.writeFile).toHaveBeenCalledWith(expect.objectContaining({ fsPath: `C:/workspace/project/.github/skills/${missing}/SKILL.md` }), Buffer.from('skill content'));
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('not changed'));
  });

  it('reads the complete packaged skill before creating workspace files', async () => {
    mocks.readFile.mockRejectedValueOnce(new Error('Missing packaged reference'));
    await expect(installPresentationSkillInWorkspace(context as never)).rejects.toThrow('Missing packaged reference');
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('reports filesystem errors instead of treating them as missing skills', async () => {
    mocks.stat.mockRejectedValue(new mocks.FileSystemError('NoPermissions'));
    await expect(installPresentationSkillInWorkspace(context as never)).rejects.toThrow('NoPermissions');
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('keeps the presentation prompt offer limited to the presentation skill', async () => {
    mocks.showInformationMessage.mockResolvedValueOnce('Install Skill');
    const workspaceState = { get: vi.fn().mockReturnValue(false), update: vi.fn() };
    await offerPresentationSkillInstallation({ ...context, workspaceState } as never);
    expect(mocks.writeFile).toHaveBeenCalledTimes(2);
    expect(mocks.readFile).not.toHaveBeenCalledWith(expect.objectContaining({ fsPath: 'C:/extension/skills/revise-from-comments/SKILL.md' }));
  });
});
