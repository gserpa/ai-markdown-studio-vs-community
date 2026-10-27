import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  run: undefined as undefined | ((uri: unknown) => Promise<void>),
  document: { version: 1, uri: { toString: () => 'file:///deck.md' }, getText: () => '---\ndocument: presentation\n---\n<!--slide: image-right-->\n# A', positionAt: (offset: number) => offset },
  edits: [] as unknown[], apply: vi.fn(), info: vi.fn(), execute: vi.fn(), pick: vi.fn(),
}));
vi.mock('vscode', () => ({
  Disposable: { from: (...items: unknown[]) => items },
  Uri: { from: () => ({ toString: () => 'migration:proposal.md' }) },
  Range: class { constructor(public start: unknown, public end: unknown) {} },
  WorkspaceEdit: class { replace(...args: unknown[]) { state.edits.push(args); } },
  workspace: { registerTextDocumentContentProvider: vi.fn(() => ({})), openTextDocument: vi.fn(async () => state.document), applyEdit: state.apply },
  commands: { registerCommand: vi.fn((_name, callback) => { state.run = callback; return {}; }), executeCommand: state.execute },
  window: { showInformationMessage: state.info, showQuickPick: state.pick },
}));
import { registerSlideTypeMigration } from '../../src/presentation/slideTypeMigration';

describe('review slide type migration', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.edits.length = 0; state.document.version = 1;
    state.info.mockResolvedValue(undefined); state.execute.mockResolvedValue(undefined);
    registerSlideTypeMigration(() => state.document.uri as never);
  });

  it('opens a proposal diff and keeps the document untouched when dismissed', async () => {
    await state.run!(state.document.uri);
    expect(state.execute).toHaveBeenCalledWith('vscode.diff', state.document.uri, expect.anything(), 'Review slide content types', { preview: true });
    expect(state.apply).not.toHaveBeenCalled();
    expect(state.edits).toHaveLength(0);
  });

  it('applies only the authored directive range after explicit acceptance', async () => {
    state.info.mockResolvedValue('Apply migration');
    await state.run!(state.document.uri);
    expect(state.apply).toHaveBeenCalledOnce();
    expect(state.edits).toHaveLength(1);
    const [, range, replacement] = state.edits[0] as [unknown, { start: number; end: number }, string];
    expect(state.document.getText().slice(range.start, range.end)).toBe('image-right');
    expect(replacement).toBe('illustrated-text');
  });

  it('refuses stale edits when the source changes during diff review', async () => {
    state.info.mockResolvedValue('Apply migration');
    state.execute.mockImplementation(async () => { state.document.version += 1; });
    await state.run!(state.document.uri);
    expect(state.apply).not.toHaveBeenCalled();
  });
});
