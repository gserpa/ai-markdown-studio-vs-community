import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  workspace: {
    getWorkspaceFolder: vi.fn((uri: { fsPath: string }) => uri.fsPath.includes('/workspace/') || uri.fsPath.includes('\\workspace\\')
      ? { uri: { fsPath: 'C:/workspace', scheme: 'file' } }
      : undefined),
  },
  Uri: {
    file: (fsPath: string) => ({
      fsPath,
      scheme: 'file',
      with: ({ fragment }: { fragment?: string }) => ({ fsPath, scheme: 'file', fragment: fragment ?? '' }),
    }),
    parse: (value: string) => ({
      fsPath: value,
      scheme: value.split(':', 1)[0] ?? 'file',
      toString: () => value,
    }),
    joinPath: (base: { fsPath: string; scheme?: string }, ...parts: string[]) => {
      const fsPath = [base.fsPath, ...parts].join('/').replace(/\\/gu, '/');
      return {
        fsPath,
        scheme: base.scheme ?? 'file',
        with: ({ fragment }: { fragment?: string }) => ({ fsPath, scheme: base.scheme ?? 'file', fragment: fragment ?? '' }),
      };
    },
  },
}));

import { resolveDocumentResource, splitFragment } from '../src/util/documentResourceResolver';

function createDocument(fsPath: string) {
  return {
    uri: {
      fsPath,
      scheme: 'file',
      with: ({ fragment }: { fragment?: string }) => ({ fsPath, scheme: 'file', fragment: fragment ?? '' }),
    },
  };
}

describe('splitFragment', () => {
  it('separates a fragment from the path', () => {
    expect(splitFragment('slides/intro.md#agenda')).toEqual(['slides/intro.md', 'agenda']);
  });

  it('returns an empty fragment when none is present', () => {
    expect(splitFragment('slides/intro.md')).toEqual(['slides/intro.md', '']);
  });
});

describe('resolveDocumentResource', () => {
  it('resolves relative paths from the markdown document directory', () => {
    const document = createDocument('C:/workspace/docs/example.md');

    const resolved = resolveDocumentResource(document as never, 'images/chart.png');

    expect(resolved?.fsPath).toBe('C:/workspace/docs/images/chart.png');
  });

  it('resolves workspace-root paths when a workspace folder is available', () => {
    const document = createDocument('C:/workspace/docs/example.md');

    const resolved = resolveDocumentResource(document as never, '/assets/logo.png');

    expect(resolved?.fsPath).toBe('C:/workspace/assets/logo.png');
  });

  it('preserves fragments on resolved local paths', () => {
    const document = createDocument('C:/workspace/docs/example.md');

    const resolved = resolveDocumentResource(document as never, 'slides/intro.md#agenda');

    expect(resolved).toMatchObject({
      fsPath: 'C:/workspace/docs/slides/intro.md',
      fragment: 'agenda',
    });
  });

  it('resolves parent-directory relative links', () => {
    const document = createDocument('C:/workspace/docs/notes/example.md');

    const resolved = resolveDocumentResource(document as never, '../Conversations/2024-06-11_reumathology-reactive-arthritis.md');

    expect(resolved?.fsPath).toBe('C:/workspace/docs/notes/../Conversations/2024-06-11_reumathology-reactive-arthritis.md');
  });

  it('decodes URL-encoded relative path segments before resolving', () => {
    const document = createDocument('C:/workspace/docs/example.md');

    const resolved = resolveDocumentResource(document as never, 'Conversation%20Summaries/2025-05-23_sofia-d%C3%A9fice-de-aten%C3%A7%C3%A3o-poss%C3%ADvel_summary.md');

    expect(resolved?.fsPath).toBe('C:/workspace/docs/Conversation Summaries/2025-05-23_sofia-défice-de-atenção-possível_summary.md');
  });

  it('supports mixed encoded spaces and raw unicode characters in paths', () => {
    const document = createDocument('C:/workspace/docs/example.md');

    const resolved = resolveDocumentResource(document as never, 'Conversation%20Summaries/2025-05-23_sofia-défice-de-atenção-possível_summary.md');

    expect(resolved?.fsPath).toBe('C:/workspace/docs/Conversation Summaries/2025-05-23_sofia-défice-de-atenção-possível_summary.md');
  });

  it('returns external URIs unchanged', () => {
    const document = createDocument('C:/workspace/docs/example.md');

    const resolved = resolveDocumentResource(document as never, 'https://example.com/image.png');

    expect(resolved?.toString()).toBe('https://example.com/image.png');
  });

  it('can resolve fragment-only links back to the current document', () => {
    const document = createDocument('C:/workspace/docs/example.md');

    const resolved = resolveDocumentResource(document as never, '#overview', { resolveFragmentToDocument: true });

    expect(resolved).toMatchObject({
      fsPath: 'C:/workspace/docs/example.md',
      fragment: 'overview',
    });
  });
});