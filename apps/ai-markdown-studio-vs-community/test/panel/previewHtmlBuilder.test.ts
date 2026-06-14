import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, fallback: unknown) => fallback),
      inspect: vi.fn(() => undefined),
    })),
  },
  Uri: {
    file: vi.fn((fsPath: string) => ({ fsPath, scheme: 'file' })),
    joinPath: vi.fn((base: { fsPath: string }, ...segments: string[]) => ({
      fsPath: [base.fsPath, ...segments].join('/'),
      scheme: 'file',
    })),
  },
}));

import { buildDocumentPreviewBody, buildFrontMatterPanel } from '../../src/panel/previewHtmlBuilder';

describe('buildFrontMatterPanel', () => {
  it('renders frontmatter as a plain escaped metadata grid', () => {
    const html = buildFrontMatterPanel([
      '---',
      'title: Research <Brief>',
      'published: true',
      'tags:',
      '  - export',
      '  - mermaid',
      '---',
      '# Body',
    ].join('\n'));

    expect(html).toContain('<div class="frontmatter-grid">');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('<summary');
    expect(html).toContain('Research &lt;Brief&gt;');
    expect(html).toContain('&quot;export&quot;');
    expect(html).not.toContain('# Body');
  });

  it('does not render a panel when frontmatter is missing or invalid', () => {
    expect(buildFrontMatterPanel('# Body')).toBe('');
    expect(buildFrontMatterPanel('---\ninvalid: value: here\n---\n# Body')).toBe('');
  });

  it('renders frontmatter before and outside the themed document container', () => {
    const html = buildDocumentPreviewBody(
      '---\ntitle: Separate chrome\n---\n# Body',
      (markdown) => `<p>${markdown.trim()}</p>`,
      true,
    );

    expect(html).toMatch(/^<aside class="frontmatter-shell">/u);
    expect(html.indexOf('frontmatter-shell')).toBeLessThan(html.indexOf('<main class="markdown-body">'));
    expect(html).toContain('</aside><main class="markdown-body">');
    expect(html).toContain('<p># Body</p>');
  });
});
