import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscodeMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vscodeMocks.executeCommand,
  },
}));

import {
  activatePreviewFrontMatterContext,
  deactivatePreviewFrontMatterContext,
  hasDisplayableFrontMatter,
  isFrontMatterVisible,
  toggleFrontMatterVisibility,
} from '../../src/panel/frontMatterDisplayState';

describe('frontMatterDisplayState', () => {
  beforeEach(() => {
    vscodeMocks.executeCommand.mockReset();
  });

  it('recognizes frontmatter only for standard document previews', () => {
    expect(hasDisplayableFrontMatter('---\ntheme: light\n---\n# Document')).toBe(true);
    expect(hasDisplayableFrontMatter('---\ndocument: presentation\n---\n# Slide')).toBe(false);
    expect(hasDisplayableFrontMatter('# Document')).toBe(false);
  });

  it('toggles visibility per document URI', () => {
    const uri = createUri('file:///document.md');

    expect(isFrontMatterVisible(uri as never)).toBe(false);
    expect(toggleFrontMatterVisibility(uri as never)).toBe(true);
    expect(isFrontMatterVisible(uri as never)).toBe(true);
    expect(toggleFrontMatterVisibility(uri as never)).toBe(false);
  });

  it('publishes toolbar visibility and toggle state through context keys', async () => {
    const uri = createUri('file:///context-document.md');
    toggleFrontMatterVisibility(uri as never);

    await activatePreviewFrontMatterContext({}, {
      uri,
      getText: () => '---\ntitle: Context\n---\n# Document',
    } as never);

    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'markdownAiStudio.activePreviewHasFrontMatter',
      true,
    );
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'markdownAiStudio.activePreviewFrontMatterVisible',
      true,
    );
  });

  it('does not clear context when a previously active preview deactivates late', async () => {
    const oldOwner = {};
    const activeOwner = {};
    const document = {
      uri: createUri('file:///shared-document.md'),
      getText: () => '---\ntitle: Shared\n---\n# Document',
    } as never;

    await activatePreviewFrontMatterContext(oldOwner, document);
    await activatePreviewFrontMatterContext(activeOwner, document);
    vscodeMocks.executeCommand.mockClear();
    await deactivatePreviewFrontMatterContext(oldOwner);

    expect(vscodeMocks.executeCommand).not.toHaveBeenCalled();
  });
});

function createUri(value: string) {
  return {
    toString: () => value,
  };
}
