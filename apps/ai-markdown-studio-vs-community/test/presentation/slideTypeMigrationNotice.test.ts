import { beforeEach, describe, expect, it, vi } from 'vitest';
const ui = vi.hoisted(() => ({ warning: vi.fn(), execute: vi.fn() }));
vi.mock('vscode', () => ({ window: { showWarningMessage: ui.warning }, commands: { executeCommand: ui.execute } }));
import { showSlideTypeMigrationNotice } from '../../src/presentation/slideTypeMigration';

describe('preview migration notice', () => {
  beforeEach(() => { vi.clearAllMocks(); ui.warning.mockResolvedValue(undefined); });
  const document = (body: string) => ({ uri: { toString: () => 'file:///deck.md' }, getText: () => body }) as never;

  it('shows one actionable warning without changing or blocking the source', async () => {
    const source = '---\ndocument: presentation\n---\n<!--slide: image-right-->\n# A\n---\n<!--slide: default-side-->\n# B';
    const doc = document(source);
    showSlideTypeMigrationNotice(doc);
    await Promise.resolve();
    expect(ui.warning).toHaveBeenCalledOnce();
    expect(ui.warning.mock.calls[0][0]).toContain('2 slides');
    expect(ui.execute).not.toHaveBeenCalled();
    expect((doc as { getText: () => string }).getText()).toBe(source);
  });

  it('launches review only when the user selects the action', async () => {
    ui.warning.mockResolvedValue('Review migration');
    showSlideTypeMigrationNotice(document('---\ndocument: presentation\n---\n<!--slide: table-->\n# Data'));
    await Promise.resolve();
    expect(ui.execute).toHaveBeenCalledWith('markdownAiStudio.reviewSlideTypeMigration', expect.anything());
  });

  it('keeps current presentations and ordinary Markdown quiet', () => {
    showSlideTypeMigrationNotice(document('---\ndocument: presentation\n---\n<!--slide: brief-->\n# Agenda'));
    showSlideTypeMigrationNotice(document('# Notes\n\n`<!--slide: image-right-->`'));
    expect(ui.warning).not.toHaveBeenCalled();
  });
});
