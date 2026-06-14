import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscodeMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  openTextDocument: vi.fn(),
  showInformationMessage: vi.fn(),
  showQuickPick: vi.fn(),
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
    showInformationMessage: vscodeMocks.showInformationMessage,
    showQuickPick: vscodeMocks.showQuickPick,
  },
  workspace: {
    openTextDocument: vscodeMocks.openTextDocument,
  },
  Uri: {
    file: vi.fn((fsPath: string) => ({ fsPath, scheme: 'file', toString: () => `file:///${fsPath.replace(/\\/gu, '/')}` })),
  },
}));

const featureContributionsMock = vi.hoisted(() => ({
  listFeatureContributions: vi.fn(),
}));

const aiConsentMock = vi.hoisted(() => ({
  isAiAuthorizationDenied: vi.fn(),
}));

vi.mock('../../src/api/featureContributions', () => ({
  listFeatureContributions: featureContributionsMock.listFeatureContributions,
}));

vi.mock('../../src/ai/aiConsent', () => ({
  isAiAuthorizationDenied: aiConsentMock.isAiAuthorizationDenied,
}));

import * as vscode from 'vscode';
import { showCommandListCommand } from '../../src/commands/markdownCommands';
import { MarkdownPreviewCustomEditor } from '../../src/panel/MarkdownPreviewCustomEditor';
import { MarkdownPreviewPanel } from '../../src/panel/MarkdownPreviewPanel';

describe('showCommandListCommand', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vscodeMocks.copilotConfigured = true;
    aiConsentMock.isAiAuthorizationDenied.mockReturnValue(false);
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
      'Format Tables',
      'AI: Generate Document',
      'AI: Generate Presentation',
      'AI: Generate Document Theme',
      'AI: Generate Presentation Theme',
      'Export: HTML',
      'Export: DOCX',
      'Export: PDF',
      'PPTX Tools: Validate Template',
      'PPTX Tools: Generate Template Manifest',
      'Change Settings...',
    ]);
    expect(capturedLabels).not.toContain('AI: Enable Features...');
    expect(capturedLabels).not.toContain('Edit Markdown');
    expect(capturedLabels).not.toContain('Export: PPTX');
    expect(capturedLabels).not.toContain('Open Global Document Theme Folder');
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

    expect(capturedLabels[0]).toBe('Edit Markdown');
    expect(capturedLabels).toContain('Export: PPTX');
    expect(capturedLabels).not.toContain('Open Preview');
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

  it('shows AI commands when Copilot is configured and authorization has not been denied', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
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

  it('hides AI commands when AI authorization has been denied', async () => {
    const documentUri = vscode.Uri.file('C:/workspace/example.md');
    aiConsentMock.isAiAuthorizationDenied.mockReturnValue(true);
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
    expect(capturedLabels).not.toContain('AI: Generate Presentation');
    expect(capturedLabels).not.toContain('AI: Generate Document Theme');
    expect(capturedLabels).not.toContain('AI: Generate Presentation Theme');
  });

  it('hides all AI commands when Copilot is not configured', async () => {
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
    expect(capturedLabels).not.toContain('AI: Generate Presentation');
    expect(capturedLabels).not.toContain('AI: Generate Document Theme');
    expect(capturedLabels).not.toContain('AI: Generate Presentation Theme');
  });
});
