import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import * as path from 'path';

const vscodeMocks = vi.hoisted(() => ({
  aiAccess: 'enabled',
  allowRemoteResources: true,
  registerTool: vi.fn(),
  stat: vi.fn(),
  createDirectory: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  workspaceFolders: [
    {
      uri: {
        fsPath: 'C:/workspace/project',
        toString: () => 'file:///C:/workspace/project',
      },
    },
  ],
}));

vi.mock('vscode', () => {
  class LanguageModelTextPart {
    constructor(public value: string) {}
  }

  class LanguageModelToolResult {
    constructor(public content: unknown[]) {}
  }

  const uriFactory = (fsPath: string) => ({
    fsPath,
    scheme: 'file',
    toString: () => `file:///${fsPath.replace(/\\/gu, '/')}`,
  });

  return {
    lm: {
      registerTool: vscodeMocks.registerTool,
    },
    workspace: {
      get workspaceFolders() {
        return vscodeMocks.workspaceFolders;
      },
      getConfiguration: vi.fn(() => ({
        get: vi.fn((settingName: string, defaultValue: unknown) => {
          if (settingName === 'aiAccess') return vscodeMocks.aiAccess;
          if (settingName === 'allowRemoteResources') return vscodeMocks.allowRemoteResources;
          return defaultValue;
        }),
      })),
      fs: {
        stat: vscodeMocks.stat,
        createDirectory: vscodeMocks.createDirectory,
        writeFile: vscodeMocks.writeFile,
        readFile: vscodeMocks.readFile,
      },
    },
    Uri: {
      parse: vi.fn((value: string) => {
        const fsPath = value.replace(/^file:\/\/\//u, '');
        return uriFactory(fsPath);
      }),
      joinPath: vi.fn((base: { fsPath: string }, ...segments: string[]) => uriFactory([base.fsPath, ...segments].join('/'))),
    },
    LanguageModelTextPart,
    LanguageModelToolResult,
  };
});

import { registerLanguageModelTools } from '../../src/ai/languageModelTools';

type CapturedTool = {
  invoke(options: { input: Record<string, unknown>; toolInvocationToken?: unknown }): unknown;
  prepareInvocation?: (options: { input: Record<string, unknown> }) => unknown;
};

const COMMUNITY_MPS_TOOLS = [
  'markdown_ai_studio_build_presentation_prompt',
  'markdown_ai_studio_validate_presentation',
  'markdown_ai_studio_save_markdown_file',
];

describe('Community MPS language model tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscodeMocks.aiAccess = 'enabled';
    vscodeMocks.allowRemoteResources = true;
    vscodeMocks.stat.mockRejectedValue(new Error('missing'));
    vscodeMocks.createDirectory.mockResolvedValue(undefined);
    vscodeMocks.writeFile.mockResolvedValue(undefined);
    vscodeMocks.readFile.mockResolvedValue(Buffer.from(''));
  });

  it('declares exactly the Community MPS tools and their activation events', () => {
    const packageJson = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    const tools = (packageJson.contributes.languageModelTools as Array<{ name: string }>).map((tool) => tool.name);

    expect(tools).toEqual(COMMUNITY_MPS_TOOLS);
    expect(packageJson.activationEvents).toEqual(expect.arrayContaining(
      COMMUNITY_MPS_TOOLS.map((tool) => `onLanguageModelTool:${tool}`),
    ));
  });

  it('registers exactly the Community MPS tools', () => {
    registerLanguageModelTools({ subscriptions: [] } as never);

    expect(vscodeMocks.registerTool.mock.calls.map(([name]) => name)).toEqual(COMMUNITY_MPS_TOOLS);
  });

  it('builds a complete presentation prompt with requested options', () => {
    const tools = captureTools();
    const result = invokeTool(tools.markdown_ai_studio_build_presentation_prompt, {
      brief: 'Present the architecture',
      slideCount: 7,
      theme: 'galaxy',
      ratio: '16:9',
    });

    expect(result).toContain('Target length: 7 slides');
    expect(result).toContain('place exactly one <!--slide: name--> comment immediately after the top-level --- separator and before the title');
    expect(result).toContain('Choose each slide layout deliberately');
    expect(result).toContain('Remote image embeds are allowed in this workspace');
    expect(result).toContain('speaker note');
  });

  it('uses safe defaults and respects disabled remote resources', () => {
    vscodeMocks.allowRemoteResources = false;
    const tools = captureTools();
    const result = invokeTool(tools.markdown_ai_studio_build_presentation_prompt, {
      brief: 'Present the architecture',
      slideCount: 0,
      ratio: 'invalid',
    });

    expect(result).toContain('Target length: 8 slides');
    expect(result).toContain('Use theme: galaxy.');
    expect(result).toContain('Use ratio: 16:9.');
    expect(result).toContain('Remote image embeds are NOT allowed in this workspace');
  });

  it('keeps local tools available when native Copilot access is denied', async () => {
    vscodeMocks.aiAccess = 'denied';
    const tools = captureTools();

    expect(invokeTool(tools.markdown_ai_studio_build_presentation_prompt, {
      brief: 'Present the architecture',
    })).toContain('You are generating a Markdown Presentation Specification deck');

    expect(await invokeToolAsync(tools.markdown_ai_studio_validate_presentation, {
      markdown: '---\ndocument: presentation\n---\n\n---\n# Deck',
    })).toContain('"valid": true');

    await invokeToolAsync(tools.markdown_ai_studio_save_markdown_file, {
      filename: 'deck.md',
      content: '# Deck',
    });
    expect(vscodeMocks.writeFile).toHaveBeenCalledTimes(1);
  });

  it('reports common presentation and directive issues', async () => {
    const tools = captureTools();
    const result = await invokeToolAsync(tools.markdown_ai_studio_validate_presentation, {
      markdown: [
        '---',
        'title: Broken Deck',
        '---',
        '',
        '<!--slide: -->',
        'No H1 title here',
      ].join('\n'),
    });

    expect(result).toContain('Front matter must include document: presentation.');
    expect(result).toContain('Presentation must contain top-level --- slide separators.');
    expect(result).toContain('must contain one # H1 slide title');
    expect(result).toContain('Slide directives require a template name.');
  });

  it('reads validation input from a file inside the workspace', async () => {
    const tools = captureTools();
    vscodeMocks.readFile.mockResolvedValue(Buffer.from([
      '---',
      'document: presentation',
      '---',
      '',
      '---',
      '# Valid Deck',
    ].join('\n')));

    const result = await invokeToolAsync(tools.markdown_ai_studio_validate_presentation, {
      uri: 'file:///C:/workspace/project/deck.md',
    });

    expect(vscodeMocks.readFile).toHaveBeenCalledTimes(1);
    expect(result).toContain('"valid": true');
  });

  it('rejects validation URIs and save paths outside the workspace', async () => {
    const tools = captureTools();

    await expect(invokeToolAsync(tools.markdown_ai_studio_validate_presentation, {
      uri: 'file:///C:/outside/deck.md',
    })).rejects.toThrow('Presentation URI must be a file inside the current workspace.');
    await expect(invokeToolAsync(tools.markdown_ai_studio_save_markdown_file, {
      filename: 'deck.md',
      content: '# Deck',
      workspaceRelativeDirectory: '../outside',
    })).rejects.toThrow('workspaceRelativeDirectory cannot contain . or .. path segments.');
    expect(vscodeMocks.writeFile).not.toHaveBeenCalled();
  });

  it('prepares an explicit save confirmation', () => {
    const tools = captureTools();
    const prepared = tools.markdown_ai_studio_save_markdown_file.prepareInvocation?.({
      input: {
        filename: 'deck.md',
        content: '# Deck',
        workspaceRelativeDirectory: 'presentations',
      },
    }) as { confirmationMessages?: { title: string; message: string } };

    expect(prepared.confirmationMessages?.title).toBe('Save Markdown file');
    expect(prepared.confirmationMessages?.message).toContain('Existing files will not be overwritten.');
  });

  it('creates a unique Markdown file and reports presentation kind', async () => {
    const tools = captureTools();
    vscodeMocks.stat
      .mockResolvedValueOnce({ type: 1 })
      .mockRejectedValueOnce(new Error('missing'));

    const result = await invokeToolAsync(tools.markdown_ai_studio_save_markdown_file, {
      filename: 'deck.md',
      content: [
        '---',
        'document: presentation',
        '---',
        '# Deck',
      ].join('\n'),
    });

    expect(vscodeMocks.writeFile).toHaveBeenCalledTimes(1);
    expect(vscodeMocks.writeFile.mock.calls[0][0].fsPath).toBe('C:/workspace/project/deck 2.md');
    expect(Buffer.from(vscodeMocks.writeFile.mock.calls[0][1]).toString('utf8')).toMatch(/\n$/u);
    expect(result).toContain('"kind": "presentation"');
  });
});

function captureTools(): Record<string, CapturedTool> {
  registerLanguageModelTools({ subscriptions: [] } as never);
  return Object.fromEntries(vscodeMocks.registerTool.mock.calls.map(([name, tool]) => [name, tool as CapturedTool]));
}

function invokeTool(tool: CapturedTool, input: Record<string, unknown>): string {
  const result = tool.invoke({ input });
  return readToolResult(result);
}

async function invokeToolAsync(tool: CapturedTool, input: Record<string, unknown>): Promise<string> {
  const result = await tool.invoke({ input });
  return readToolResult(result);
}

function readToolResult(result: unknown): string {
  const content = (result as { content: Array<{ value: string }> }).content;
  return content.map((part) => part.value).join('');
}
