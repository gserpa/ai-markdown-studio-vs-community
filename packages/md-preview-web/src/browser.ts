/**
 * Browser entry point for the Markdown rendering pipeline.
 *
 * Bundled as an IIFE by esbuild, this script exposes
 * `window.renderMarkdownToHtml()` for document mode and
 * `window.renderPresentationToHtml()` for presentation mode
 * in Android WebView and other browser-based hosts.
 */
import DOMPurify from 'dompurify';
import { createMarkdownRenderer, isMarkdownPresentationSource } from '@mfo/core';

import { renderPresentationPreview } from './presentation/presentationPreview';
import type { CreateDocument } from './presentation/presentationPreview';
import { loadPreviewThemeRegistryFromData, buildPreviewThemeStylesheet } from './presentation/previewThemeRegistry';

// @ts-expect-error — JSON theme files are resolved by the esbuild bundler at build time.
import blackTheme from '../assets/themes/presentation/black.json';
// @ts-expect-error — JSON theme files are resolved by the esbuild bundler at build time.
import galaxyTheme from '../assets/themes/presentation/galaxy.json';
// @ts-expect-error — JSON theme files are resolved by the esbuild bundler at build time.
import modernBlueTheme from '../assets/themes/presentation/modern-blue.json';

const md = createMarkdownRenderer();

const previewThemeRegistry = loadPreviewThemeRegistryFromData([blackTheme, galaxyTheme, modernBlueTheme]);
const themeStylesheet = buildPreviewThemeStylesheet(previewThemeRegistry);

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

function renderMarkdown(source: string): string {
  return md.render(source);
}

const createDocument: CreateDocument = (html: string): Document => {
  return new DOMParser().parseFromString(html, 'text/html');
};

(window as any).renderMarkdownToHtml = function renderMarkdownToHtml(rawMarkdown: string): string {
  const html = md.render(rawMarkdown);
  return sanitizeRenderedHtmlForBrowser(html);
};

(window as any).isMarkdownPresentationSource = function (rawMarkdown: string): boolean {
  return isMarkdownPresentationSource(rawMarkdown);
};

(window as any).renderPresentationToHtml = function (rawMarkdown: string): { html: string; themeStylesheet: string } {
  const preview = renderPresentationPreview(rawMarkdown, renderMarkdown, previewThemeRegistry, createDocument);
  return {
    html: preview.html,
    themeStylesheet,
  };
};
