import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const vscodeMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  openTextDocument: vi.fn(),
  showInformationMessage: vi.fn(),
  showQuickPick: vi.fn(),
  activeTabInput: undefined as unknown,
  copilotConfigured: true,
}));

vi.mock('vscode', () => ({
  authentication: {
    getAccounts: vi.fn(async () => (vscodeMocks.copilotConfigured ? [{ id: 'github-account' }] : [])),
  },
  commands: {
    executeCommand: vscodeMocks.executeCommand,
  },
  window: {
    activeTextEditor: undefined,
    tabGroups: { activeTabGroup: { get activeTab() { return { input: vscodeMocks.activeTabInput }; } } },
    showInformationMessage: vscodeMocks.showInformationMessage,
    showQuickPick: vscodeMocks.showQuickPick,
  },
  workspace: {
    openTextDocument: vscodeMocks.openTextDocument,
  },
  Uri: {
    file: vi.fn((fsPath: string) => ({ fsPath, scheme: 'file', toString: () => `file:///${fsPath.replace(/\\/gu, '/')}` })),
  },
  TabInputCustom: class {
    constructor(public uri: unknown, public viewType: string) {}
  },
  TabInputText: class {
    constructor(public uri: unknown) {}
  },
}));

const featureContributionsMock = vi.hoisted(() => ({
  listFeatureContributions: vi.fn(),
}));

const aiConsentMock = vi.hoisted(() => ({
  getAiAccessState: vi.fn(),
}));

vi.mock('../../src/api/featureContributions', () => ({
  listFeatureContributions: featureContributionsMock.listFeatureContributions,
}));

vi.mock('../../src/ai/aiConsent', () => ({
  getAiAccessState: aiConsentMock.getAiAccessState,
}));

import * as vscode from 'vscode';
import { writeReviewComments, type ReviewComment } from '@mfo/core';
import { showCommandListCommand } from '../../src/commands/markdownCommands';
import { MarkdownPreviewCustomEditor } from '../../src/panel/MarkdownPreviewCustomEditor';
import { MarkdownPreviewPanel } from '../../src/panel/MarkdownPreviewPanel';

describe('showCommandListCommand', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vscodeMocks.activeTabInput = undefined;
    vscodeMocks.copilotConfigured = true;
    aiConsentMock.getAiAccessState.mockReturnValue('enabled');
    featureContributionsMock.listFeatureContributions.mockReturnValue([
      {
        id: 'markdown-ai-studio-pro',
        title: 'AI Markdown Studio Pro',
        commands: [
          { command: 'markdownAiStudio.generateDocumentTheme', title: 'AI: Generate Document Theme', order: 4.1, requiresAi: true },
          { command: 'markdownAiStudio.generatePresentationTheme', title: 'AI: Generate Presentation Theme', order: 4.2, requiresAi: true },
          { command: 'markdownAiStudio.exportDocx', title: 'Export: DOCX', order: 7, replaces: ['markdownAiStudio.exportDocxBasic'] },
          { command: 'markdownAiStudio.exportPptx', title: 'Export: PPTX', order: 7.1, presentationOnly: true },
          { command: 'markdownAiStudio.exportPdf', title: 'Export: PDF', order: 7.2 },
          { command: 'markdownAiStudio.validatePptxTemplate', title: 'PPTX Tools: Validate Template', order: 7.3 },
          { command: 'markdownAiStudio.generatePptxTemplateManifest', title: 'PPTX Tools: Generate Template Manifest', order: 7.4 },
        ],
      },
    ]);
  });

  it('keeps the quick-pick order and hides preview-only toggles while editing', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    vscodeMocks.activeTabInput = new vscode.TabInputText(documentUri);
    vscodeMocks.openTextDocument.mockResolvedValue({
      uri: documentUri,
      getText: () => '# Example',
    });
    const capturedLabels: string[] = [];
    vscodeMocks.showQuickPick.mockImplementation(async (items: Array<{ label: string }>) => {
      capturedLabels.push(...items.map((item) => item.label));
      return undefined;
    });

    vi.spyOn(MarkdownPreviewCustomEditor, 'getActiveDocumentUri').mockReturnValue(undefined);
    vi.spyOn(MarkdownPreviewPanel, 'getActivePreviewDocumentUri').mockReturnValue(undefined);

    await showCommandListCommand(documentUri);

    expect(capturedLabels).toEqual([
      'Open Preview',
      'Document Editor',
      'Format Tables',
      'AI: Generate Document Theme',
      'AI: Generate Presentation Theme',
      'AI: Generate Document',
      'AI: Generate Presentation',
      'Export: DOCX',
      'Export: PDF',
      'PPTX Tools: Validate Template',
      'PPTX Tools: Generate Template Manifest',
      'Export: HTML',
      'AI: Install Presentation Skill',
      'Change Settings...',
    ]);
    expect(capturedLabels).not.toContain('AI: Enable Features...');
    expect(capturedLabels).not.toContain('Edit Markdown');
    expect(capturedLabels).not.toContain('Export: PPTX');
    expect(capturedLabels).not.toContain('Presentation: Review Slide Type Migration');
  });

  it('only offers table formatting for the active Markdown source tab', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    const otherUri = vscode.Uri.file('C:/workspace/other.md');
    const labels: string[] = [];
    vscodeMocks.openTextDocument.mockResolvedValue({ uri: documentUri, getText: () => '# Example' });
    vscodeMocks.showQuickPick.mockImplementation(async (items: Array<{ label: string }>) => {
      labels.splice(0, labels.length, ...items.map((item) => item.label));
      return undefined;
    });

    for (const [input, visible] of [
      [new vscode.TabInputText(documentUri), true],
      [new vscode.TabInputCustom(documentUri, 'vscode.markdown.editor'), false],
      [new vscode.TabInputCustom(documentUri, MarkdownPreviewCustomEditor.viewType), false],
      [new vscode.TabInputText(otherUri), false],
      [undefined, false],
    ] as Array<[unknown, boolean]>) {
      vscodeMocks.activeTabInput = input;
      await showCommandListCommand(documentUri);
      expect(labels.includes('Format Tables')).toBe(visible);
    }
  });

  it('limits the Format Markdown Tables palette command to the Markdown text editor', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(manifest.contributes.menus.commandPalette).toContainEqual({
      command: 'markdownAiStudio.formatTables',
      when: 'activeEditor == workbench.editors.files.textFileEditor && resourceLangId == markdown',
    });
  });

  it('shows image embedding only when the document has linked images', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/images.md');
    let source = '# No linked images';
    vscodeMocks.openTextDocument.mockResolvedValue({
      uri: documentUri,
      getText: () => source,
    });
    const labels: string[] = [];
    vscodeMocks.showQuickPick.mockImplementation(async (items: Array<{ label: string }>) => {
      labels.splice(0, labels.length, ...items.map((item) => item.label));
      return undefined;
    });

    await showCommandListCommand(documentUri);
    expect(labels).not.toContain('Embed Linked Images in File');

    source = '![Linked](image.png)';
    await showCommandListCommand(documentUri);
    expect(labels).toContain('Embed Linked Images in File');
  });

  it('only shows review actions for the current document and eligible comments', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/current.md');
    const otherUri = vscode.Uri.file('C:/workspace/other.md');
    const source = '# Example\n\nReview this text.\n';
    const start = source.indexOf('Review this text');
    const comment: ReviewComment = {
      id: '1', body: 'Clarify', state: 'open', includeInAi: true,
      range: { start, end: start + 'Review this text'.length },
    };
    const labels: string[] = [];
    vscodeMocks.showQuickPick.mockImplementation(async (items: Array<{ label: string }>) => {
      labels.splice(0, labels.length, ...items.map(item => item.label));
      return undefined;
    });
    vi.spyOn(MarkdownPreviewCustomEditor, 'getActiveDocumentUri').mockReturnValue(documentUri);
    vi.spyOn(MarkdownPreviewPanel, 'getActivePreviewDocumentUri').mockReturnValue(undefined);

    for (const [comments, hasComments, eligible] of [
      [[], false, false],
      [[{ ...comment, includeInAi: false }], true, false],
      [[{ ...comment, state: 'resolved' }], true, false],
      [[{ ...comment, range: undefined }], true, false],
      [[comment], true, true],
    ] as Array<[ReviewComment[], boolean, boolean]>) {
      const current = writeReviewComments(source, comments);
      vscodeMocks.openTextDocument.mockImplementation(async (uri: vscode.Uri) => ({
        uri, getText: () => uri.toString() === documentUri.toString() ? current : source,
      }));
      await showCommandListCommand(documentUri);
      expect(labels.includes('Hide / Show Review Comments')).toBe(hasComments);
      expect(labels.includes('AI: Revise from Comments')).toBe(eligible);
      expect(labels).not.toContain('View Review Comments');
    }
    await showCommandListCommand(otherUri);
    expect(labels).not.toContain('Hide / Show Review Comments');
    expect(labels).not.toContain('AI: Revise from Comments');
  });

  it('keeps review prompt copy reachable when integrated AI is disabled', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/current.md');
    const source = '# Example\n\nReview this text.\n';
    const start = source.indexOf('Review this text');
    const annotated = writeReviewComments(source, [{
      id: '1', body: 'Clarify', state: 'open', includeInAi: true,
      range: { start, end: start + 'Review this text'.length },
    }]);
    aiConsentMock.getAiAccessState.mockReturnValue('denied');
    vscodeMocks.copilotConfigured = false;
    vscodeMocks.openTextDocument.mockResolvedValue({ uri: documentUri, getText: () => annotated });
    const labels: string[] = [];
    vscodeMocks.showQuickPick.mockImplementation(async (items: Array<{ label: string }>) => {
      labels.push(...items.map(item => item.label));
      return undefined;
    });

    await showCommandListCommand(documentUri);
    expect(labels).toContain('AI: Revise from Comments');
    expect(labels).not.toContain('Copy Review Prompt');
  });

  it('switches to edit mode and only shows PPTX export for presentations', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/slides.md');
    vscodeMocks.openTextDocument.mockResolvedValue({
      uri: documentUri,
      getText: () => ['---', 'document: presentation', '---', '', '# Slide 1'].join('\n'),
    });
    const capturedLabels: string[] = [];
    vscodeMocks.showQuickPick.mockImplementation(async (items: Array<{ label: string }>) => {
      capturedLabels.push(...items.map((item) => item.label));
      return undefined;
    });

    vi.spyOn(MarkdownPreviewCustomEditor, 'getActiveDocumentUri').mockReturnValue(documentUri);
    vi.spyOn(MarkdownPreviewPanel, 'getActivePreviewDocumentUri').mockReturnValue(undefined);

    await showCommandListCommand(documentUri);

    expect(capturedLabels.slice(0, 2)).toEqual(['Document Editor', 'Edit Markdown']);
    expect(capturedLabels).toContain('Export: PPTX');
    expect(capturedLabels).toContain('Presentation: Review Slide Type Migration');
    expect(capturedLabels).not.toContain('Export: DOCX (Basic)');
    expect(capturedLabels).not.toContain('Open Preview');
  });

  it('resolves the native editor document and offers source editing in its launcher', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    vscodeMocks.activeTabInput = new vscode.TabInputCustom(documentUri, 'vscode.markdown.editor');
    vscodeMocks.openTextDocument.mockResolvedValue({ uri: documentUri, languageId: 'markdown', getText: () => '# Example' });
    vscodeMocks.showQuickPick.mockImplementation(async (items: Array<{ label: string; command: string }>) => {
      expect(items.slice(0, 2).map((item) => item.label)).toEqual(['Open Preview', 'Edit Markdown']);
      expect(items.map((item) => item.label)).not.toContain('Document Editor');
      return items[1];
    });

    await showCommandListCommand();
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith('markdownAiStudio.editAsText', documentUri);
  });

  it('routes Open Preview in the native editor launcher to the studio preview command', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    vscodeMocks.activeTabInput = new vscode.TabInputCustom(documentUri, 'vscode.markdown.editor');
    vscodeMocks.openTextDocument.mockResolvedValue({ uri: documentUri, languageId: 'markdown', getText: () => '# Example' });
    vscodeMocks.showQuickPick.mockImplementation(async (items: Array<{ label: string; command: string }>) =>
      items.find((item) => item.label === 'Open Preview'));

    await showCommandListCommand();
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith('markdownAiStudio.openPreview', documentUri);
  });

  it('shows Toggle Frontmatter only for previews with displayable front matter', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    vscodeMocks.openTextDocument.mockResolvedValue({
      uri: documentUri,
      getText: () => ['---', 'title: Example', '---', '', '# Example'].join('\n'),
    });
    const capturedLabels: string[] = [];
    vscodeMocks.showQuickPick.mockImplementation(async (items: Array<{ label: string }>) => {
      capturedLabels.push(...items.map((item) => item.label));
      return undefined;
    });

    vi.spyOn(MarkdownPreviewCustomEditor, 'getActiveDocumentUri').mockReturnValue(documentUri);
    vi.spyOn(MarkdownPreviewPanel, 'getActivePreviewDocumentUri').mockReturnValue(undefined);

    await showCommandListCommand(documentUri);

    expect(capturedLabels).toContain('Toggle Frontmatter');
  });

  it('shows the basic DOCX command when Pro is not installed', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    featureContributionsMock.listFeatureContributions.mockReturnValue([]);
    vscodeMocks.openTextDocument.mockResolvedValue({
      uri: documentUri,
      getText: () => '# Example',
    });
    const capturedLabels: string[] = [];
    vscodeMocks.showQuickPick.mockImplementation(async (items: Array<{ label: string }>) => {
      capturedLabels.push(...items.map((item) => item.label));
      return undefined;
    });

    vi.spyOn(MarkdownPreviewCustomEditor, 'getActiveDocumentUri').mockReturnValue(undefined);
    vi.spyOn(MarkdownPreviewPanel, 'getActivePreviewDocumentUri').mockReturnValue(undefined);

    await showCommandListCommand(documentUri);

    expect(capturedLabels).toContain('Export: DOCX (Basic)');
    expect(capturedLabels).not.toContain('Export: DOCX');
  });

  it('shows both Enable AI Features and AI commands in ask state', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    aiConsentMock.getAiAccessState.mockReturnValue('ask');
    vscodeMocks.openTextDocument.mockResolvedValue({
      uri: documentUri,
      getText: () => '# Example',
    });
    const capturedLabels: string[] = [];
    vscodeMocks.showQuickPick.mockImplementation(async (items: Array<{ label: string }>) => {
      capturedLabels.push(...items.map((item) => item.label));
      return undefined;
    });

    vi.spyOn(MarkdownPreviewCustomEditor, 'getActiveDocumentUri').mockReturnValue(undefined);
    vi.spyOn(MarkdownPreviewPanel, 'getActivePreviewDocumentUri').mockReturnValue(undefined);

    await showCommandListCommand(documentUri);

    expect(capturedLabels).toContain('AI: Enable Features...');
    expect(capturedLabels).toContain('AI: Generate Document');
    expect(capturedLabels).toContain('AI: Generate Presentation');
    expect(capturedLabels).toContain('AI: Generate Document Theme');
    expect(capturedLabels).toContain('AI: Generate Presentation Theme');
  });

  it('hides Enable AI Features once AI access is enabled', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    aiConsentMock.getAiAccessState.mockReturnValue('enabled');
    vscodeMocks.openTextDocument.mockResolvedValue({
      uri: documentUri,
      getText: () => '# Example',
    });
    const capturedLabels: string[] = [];
    vscodeMocks.showQuickPick.mockImplementation(async (items: Array<{ label: string }>) => {
      capturedLabels.push(...items.map((item) => item.label));
      return undefined;
    });

    vi.spyOn(MarkdownPreviewCustomEditor, 'getActiveDocumentUri').mockReturnValue(undefined);
    vi.spyOn(MarkdownPreviewPanel, 'getActivePreviewDocumentUri').mockReturnValue(undefined);

    await showCommandListCommand(documentUri);

    expect(capturedLabels).not.toContain('AI: Enable Features...');
    expect(capturedLabels).toContain('AI: Generate Document');
    expect(capturedLabels).toContain('AI: Generate Presentation');
    expect(capturedLabels).toContain('AI: Generate Document Theme');
    expect(capturedLabels).toContain('AI: Generate Presentation Theme');
  });

  it('keeps local presentation prompt commands available when AI authorization has been denied', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    aiConsentMock.getAiAccessState.mockReturnValue('denied');
    vscodeMocks.openTextDocument.mockResolvedValue({
      uri: documentUri,
      getText: () => '# Example',
    });
    const capturedLabels: string[] = [];
    vscodeMocks.showQuickPick.mockImplementation(async (items: Array<{ label: string }>) => {
      capturedLabels.push(...items.map((item) => item.label));
      return undefined;
    });

    vi.spyOn(MarkdownPreviewCustomEditor, 'getActiveDocumentUri').mockReturnValue(undefined);
    vi.spyOn(MarkdownPreviewPanel, 'getActivePreviewDocumentUri').mockReturnValue(undefined);

    await showCommandListCommand(documentUri);

    expect(capturedLabels).toContain('AI: Enable Features...');
    expect(capturedLabels).not.toContain('AI: Generate Document');
    expect(capturedLabels).toContain('AI: Generate Presentation');
    expect(capturedLabels).toContain('AI: Install Presentation Skill');
    expect(capturedLabels).not.toContain('AI: Generate Document Theme');
    expect(capturedLabels).not.toContain('AI: Generate Presentation Theme');
  });

  it('keeps local presentation prompt commands available when Copilot is not configured', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    vscodeMocks.copilotConfigured = false;
    vscodeMocks.openTextDocument.mockResolvedValue({
      uri: documentUri,
      getText: () => '# Example',
    });
    const capturedLabels: string[] = [];
    vscodeMocks.showQuickPick.mockImplementation(async (items: Array<{ label: string }>) => {
      capturedLabels.push(...items.map((item) => item.label));
      return undefined;
    });

    vi.spyOn(MarkdownPreviewCustomEditor, 'getActiveDocumentUri').mockReturnValue(undefined);
    vi.spyOn(MarkdownPreviewPanel, 'getActivePreviewDocumentUri').mockReturnValue(undefined);

    await showCommandListCommand(documentUri);

    expect(capturedLabels).not.toContain('AI: Enable Features...');
    expect(capturedLabels).not.toContain('AI: Generate Document');
    expect(capturedLabels).toContain('AI: Generate Presentation');
    expect(capturedLabels).toContain('AI: Install Presentation Skill');
    expect(capturedLabels).not.toContain('AI: Generate Document Theme');
    expect(capturedLabels).not.toContain('AI: Generate Presentation Theme');
  });
});
