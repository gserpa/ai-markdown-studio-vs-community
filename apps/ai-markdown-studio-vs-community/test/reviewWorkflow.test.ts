import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeReviewComments, type ReviewComment } from '@mfo/core';

const mock = vi.hoisted(() => ({
  commands: new Map<string, (...args: any[]) => Promise<void>>(),
  disposable: () => ({ dispose() {} }),
  document: { version: 1, languageId: 'markdown', getText: vi.fn() },
  clipboard: vi.fn(),
  choose: vi.fn(),
  showInfo: vi.fn(),
  showError: vi.fn(),
  getAiAccessState: vi.fn(),
  hasAccount: vi.fn(),
  consent: vi.fn(),
  generate: vi.fn(),
}));
vi.mock('vscode', () => ({
  workspace: {
    openTextDocument: vi.fn(async () => mock.document),
    registerTextDocumentContentProvider: mock.disposable,
  },
  commands: {
    registerCommand: (id: string, action: (...args: any[]) => Promise<void>) => {
      mock.commands.set(id, action);
      return mock.disposable();
    },
  },
  env: { clipboard: { writeText: mock.clipboard } },
  window: {
    showQuickPick: mock.choose,
    showInformationMessage: mock.showInfo,
    showErrorMessage: mock.showError,
    tabGroups: {
      activeTabGroup: {},
      onDidChangeTabs: mock.disposable,
      onDidChangeTabGroups: mock.disposable,
    },
  },
  CancellationError: class extends Error {},
  Disposable: { from: mock.disposable },
}));
vi.mock('../src/ai/aiConsent', () => ({
  getAiAccessState: mock.getAiAccessState,
  ensureAiFeaturesEnabled: mock.consent,
}));
vi.mock('../src/ai/copilotAvailability', () => ({ hasConfiguredCopilotAccount: mock.hasAccount }));
vi.mock('../src/ai/languageModel', () => ({ generateTextWithLanguageModel: mock.generate }));

import { registerReviewWorkflow } from '../src/review/reviewWorkflow';

const markdown = '# Document\n\nPassage for review.\n';
const anchor = (quote: string) => ({
  quote,
  parts: [{
    quote, startLine: 3, endLine: 3, source: quote + '\n',
    before: '# Document\n\n', after: '', renderedBefore: '', renderedAfter: '',
  }],
});
const open: ReviewComment = {
  id: 'ai-comment', original: anchor('Passage for review.'),
  includeInAi: true, state: 'open', body: 'Make the passage clearer.',
};
const uri = { scheme: 'file', toString: () => 'file:///review.md' };
const run = (id: string, ...args: unknown[]) => mock.commands.get('markdownAiStudio.' + id)!(...args);

describe('review command AI access and prompt copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.getAiAccessState.mockReturnValue('denied');
    mock.hasAccount.mockResolvedValue(true);
    mock.document.getText.mockReturnValue(writeReviewComments(markdown, [
      open,
      { ...open, id: 'manual-comment', includeInAi: false, body: 'Private manual note' },
      { ...open, id: 'revised-comment', state: 'revised', body: 'Previously revised note' },
      { ...open, id: 'detached-comment', original: anchor('Deleted passage.'), body: 'Detached note' },
    ]));
    registerReviewWorkflow(() => uri as never);
  });

  it('copies only eligible comments without calling the integrated model', async () => {
    await run('copyReviewPrompt');
    const prompt = mock.clipboard.mock.calls[0][0];
    expect(prompt).toContain('Make the passage clearer.');
    expect(prompt).toContain('Passage for review.');
    expect(prompt).not.toMatch(/Private manual|Previously revised|Detached note|markdown-ai-studio-review/u);
    expect(mock.hasAccount).not.toHaveBeenCalled();
    expect(mock.consent).not.toHaveBeenCalled();
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it('offers prompt copy as the review workflow when access is denied', async () => {
    mock.choose.mockResolvedValue({ value: 'copy' });
    await run('reviewComments');
    expect(mock.choose.mock.calls[0][0]).toEqual([{ label: 'Copy Review Prompt', value: 'copy' }]);
    expect(mock.clipboard).toHaveBeenCalledOnce();
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it('asks for AI consent after the integrated option is selected', async () => {
    mock.getAiAccessState.mockReturnValue('ask');
    mock.choose.mockResolvedValue({ value: 'integrated' });
    mock.consent.mockResolvedValue(false);
    await run('reviewComments');
    expect(mock.choose.mock.calls[0][0][0].value).toBe('integrated');
    expect(mock.consent).toHaveBeenCalledOnce();
    expect(mock.generate).not.toHaveBeenCalled();
  });
});
