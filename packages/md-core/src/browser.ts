/**
 * Browser entry point for the Markdown rendering pipeline.
 *
 * Bundled as an IIFE by esbuild, this script exposes
 * `window.renderMarkdownToHtml()` for use in Android WebView
 * and other browser-based hosts.
 *
 * It uses the identical markdown-it + plugin stack as the VS Code
 * extension so that rendering output matches.
 */
import DOMPurify from 'dompurify';

import { createMarkdownRenderer } from './render/markdownRenderer';

const md = createMarkdownRenderer();

const additionalTags = [
  'math',
  'semantics',
  'annotation',
  'mrow',
  'mi',
  'mn',
  'mo',
  'msup',
  'msub',
  'mfrac',
  'msqrt',
  'mtext',
  'mspace',
  'mstyle',
  'munderover',
  'munder',
  'mover',
  'msubsup',
  'mtable',
  'mtr',
  'mtd',
  'input',
];

const additionalAttributes = [
  'class',
  'id',
  'style',
  'title',
  'aria-hidden',
  'target',
  'rel',
  'data-href',
  'data-source-src',
  'encoding',
  'type',
  'checked',
  'disabled',
  'colspan',
  'rowspan',
  'align',
  'start',
  'name',
  'href',
  'src',
  'alt',
  'width',
  'height',
];

function sanitizeRenderedHtmlForBrowser(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: additionalTags,
    ADD_ATTR: additionalAttributes,
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
}

(window as any).renderMarkdownToHtml = function renderMarkdownToHtml(rawMarkdown: string): string {
  const html = md.render(rawMarkdown);
  return sanitizeRenderedHtmlForBrowser(html);
};
