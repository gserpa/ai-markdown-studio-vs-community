import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import { loadDocumentThemeRegistryFromDirectories, loadPreviewThemeRegistryFromDirectories } from '@mfo/preview-web';

const mocks = vi.hoisted(() => ({ input: vi.fn(), quickPick: vi.fn(), generate: vi.fn(), write: vi.fn(), error: vi.fn(), warning: vi.fn(), documentThemes: vi.fn(), presentationThemes: vi.fn() }));
vi.mock('vscode', () => {
  const uri = (fsPath: string) => ({ fsPath, scheme: 'file', toString: () => 'file:///' + fsPath });
  return {
    Uri: { file: uri, joinPath: (base: { fsPath: string }, ...parts: string[]) => uri([base.fsPath, ...parts].join('/')) },
    FileType: { Directory: 2 }, ProgressLocation: { Notification: 1 }, CancellationError: class extends Error {},
    workspace: {
      workspaceFolders: [{ uri: uri('C:/docs') }],
      getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
      fs: { writeFile: mocks.write, stat: async () => ({ type: 2 }) }, openTextDocument: vi.fn(),
    },
    window: {
      showInputBox: mocks.input, showQuickPick: mocks.quickPick, showSaveDialog: async () => uri('C:/docs/generated.md'),
      withProgress: (_options: unknown, task: (progress: unknown, token: unknown) => Promise<void>) => task({}, {}),
      showTextDocument: vi.fn(), showErrorMessage: mocks.error, showWarningMessage: mocks.warning,
    },
  };
});
vi.mock('../../src/ai/languageModel', () => ({ generateTextWithLanguageModel: mocks.generate }));
vi.mock('../../src/generate/generationMode', () => ({ shouldGenerateWithLanguageModel: async () => true }));
vi.mock('../../src/generate/generatedPresentationImages', () => ({ normalizeGeneratedPresentationImages: async (markdown: string) => ({ markdown, replacements: [] }) }));
vi.mock('../../src/skills/presentationSkillInstaller', () => ({ offerPresentationSkillInstallation: vi.fn() }));
vi.mock('../../src/document/documentThemeSupport', () => ({ loadDocumentThemeRegistryForDocument: mocks.documentThemes }));
vi.mock('../../src/presentation/previewThemeSupport', () => ({ loadPreviewThemeRegistryForDocument: mocks.presentationThemes }));

import * as vscode from 'vscode';
import { generateDocumentCommand } from '../../src/generate/documentGenerationCommand';
import { generatePresentationCommand } from '../../src/generate/presentationGenerationCommand';

const invalid = '```metric\n{"title":"Metric","value":1,"trend":{"value":-1,"direction":"up"}}\n```';
const valid = '```metric\n{"title":"Metric","value":1,"trend":{"value":-1,"direction":"down"}}\n```';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.generate.mockReset();
  mocks.input.mockResolvedValue('2');
  mocks.quickPick.mockImplementation(async (choices: readonly string[]) => choices[0]);
  const registry = { themes: new Map([['winter-frost', {}], ['custom-workspace', {}]]) };
  mocks.documentThemes.mockReturnValue(registry);
  mocks.presentationThemes.mockReturnValue(registry);
});

describe.each(['document', 'presentation'] as const)('%s visualization generation', mode => {
  const extensionUri = vscode.Uri.file('C:/extension');
  const generate = () => mode === 'document'
    ? generateDocumentCommand(extensionUri)
    : generatePresentationCommand(undefined, { extensionUri } as vscode.ExtensionContext);
  const prefix = mode === 'document' ? '# Dashboard\n\n' : '---\nfilename: dashboard.md\ndocument: presentation\ntitle: Dashboard\ntheme: auto\nratio: 16:9\n---\n# Opening\n\n<!--notes: Explain.-->\n\n---\n# Dashboard\n\n';
  it('repairs invalid definitions once and writes the corrected source', async () => {
    mocks.generate.mockResolvedValueOnce(prefix + invalid).mockResolvedValueOnce(prefix + valid);
    await generate();
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[1][0]).toContain('Validation errors:');
    expect(mocks.generate.mock.calls.every((call) => call[3] === 'generation')).toBe(true);
    expect(mocks.write).toHaveBeenCalledOnce();
    expect(mocks.write.mock.calls[0][1].toString('utf8')).toContain('"direction":"down"');
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('does not persist definitions that remain invalid after repair', async () => {
    mocks.generate.mockResolvedValue(prefix + invalid);
    await generate();
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('Generated visualizations need correction'));
  });

  it('saves valid visualization output without an extra AI call', async () => {
    mocks.generate.mockResolvedValueOnce(prefix + valid);
    await generate();
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.write).toHaveBeenCalledOnce();
  });

  it('offers registry themes and uses the selected theme in the generation prompt', async () => {
    mocks.quickPick.mockImplementation(async (choices: readonly string[]) => choices.includes('winter-frost') ? 'winter-frost' : choices[0]);
    mocks.generate.mockResolvedValueOnce(prefix + valid);
    await generate();
    const themeChoices = mocks.quickPick.mock.calls.find((call) => call[0].includes('winter-frost'))?.[0];
    expect(themeChoices).toEqual(expect.arrayContaining(['auto', 'winter-frost', 'custom-workspace']));
    expect(mocks.generate.mock.calls[0][0]).toContain('Use theme: winter-frost.');
    expect(mocks.write).toHaveBeenCalledOnce();
  });

  it('offers every currently bundled theme from the real registry', async () => {
    const directory = path.join(process.cwd(), 'packages', 'md-preview-web', 'assets', 'themes', mode);
    const registry = mode === 'document'
      ? loadDocumentThemeRegistryFromDirectories([directory])
      : loadPreviewThemeRegistryFromDirectories([directory]);
    const loader = mode === 'document' ? mocks.documentThemes : mocks.presentationThemes;
    loader.mockReturnValue(registry);
    mocks.generate.mockResolvedValueOnce(prefix + valid);
    await generate();
    const themeChoices = mocks.quickPick.mock.calls.find((call) => call[1]?.placeHolder === `Choose a ${mode} theme`)?.[0];
    expect(registry.themes.size).toBeGreaterThan(0);
    expect(themeChoices).toEqual(expect.arrayContaining([...registry.themes.keys()]));
  });

  it('rejects a workspace theme unavailable at the save destination', async () => {
    mocks.quickPick.mockImplementation(async (choices: readonly string[]) => choices.includes('custom-workspace') ? 'custom-workspace' : choices[0]);
    const loader = mode === 'document' ? mocks.documentThemes : mocks.presentationThemes;
    loader.mockReturnValueOnce({ themes: new Map([['custom-workspace', {}]]) })
      .mockReturnValueOnce({ themes: new Map() });
    await generate();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('not available in the selected destination'));
  });
});
