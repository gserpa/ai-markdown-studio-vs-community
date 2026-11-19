import { stripMarkdownFrontMatter } from '@mfo/core';

export function renderDocumentPreviewBody(
  source: string,
  render: (markdown: string, lines: readonly number[]) => string,
  options: { beforeScroll?: string; beforeContent?: string } = {},
): string {
  const markdown = stripMarkdownFrontMatter(source);
  const lines = markdown.split(/\r?\n/u);
  const offset = source.split(/\r?\n/u).length - lines.length;
  const body = render(markdown, lines.map((_line, index) => offset + index + 1));
  return `<div class="document-preview-shell">${options.beforeScroll ?? ''}<div class="document-preview-scroll"><main class="markdown-body">${options.beforeContent ?? ''}${body}</main></div></div>`;
}
