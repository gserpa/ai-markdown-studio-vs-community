import * as fs from 'node:fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { JSDOM } from 'jsdom';
import { createMarkdownRenderer, sanitizeRenderedHtml, stripMarkdownFrontMatter } from '@mfo/core';
import { isMarkdownPresentationSource, extractMarkdownFrontMatterMeta } from '@mfo/core';
import { renderPresentationPreview } from '@mfo/preview-web';
import { buildPreviewThemeStylesheet, buildDocumentThemeStylesheet, resolveDocumentThemeSelection } from '@mfo/preview-web';
import { loadPreviewThemeRegistryForDocument } from '../presentation/previewThemeSupport';
import { loadDocumentThemeRegistryForDocument } from '../document/documentThemeSupport';
import { resolveExtensionAssetUri, resolveExtensionNodeModulesUri } from '../util/extensionSupportRoot';
import { isFrontMatterVisible } from './frontMatterDisplayState';

type PreviewPageWidth = 'readable' | 'full';

export function getPreviewTitle(document: vscode.TextDocument, isPresentation = false): string {
  return `${isPresentation ? 'Presentation Preview' : 'Preview'}: ${path.basename(document.fileName)}`;
}

export function buildPreviewHtml(
  extensionUri: vscode.Uri,
  webview: vscode.Webview,
  document: vscode.TextDocument,
  resolvePreviewResource: (rawPath: string) => string | undefined,
): string {
  const stylesheetUri = webview.asWebviewUri(resolveExtensionAssetUri(extensionUri, 'preview', 'preview.css'));
  const katexStylesheetUri = webview.asWebviewUri(resolveExtensionNodeModulesUri(extensionUri, 'katex', 'dist', 'katex.min.css'));
  const previewThemeRuntimeScriptUri = webview.asWebviewUri(resolveExtensionAssetUri(extensionUri, 'preview', 'preview-theme-runtime.js'));
  const scriptUri = webview.asWebviewUri(resolveExtensionAssetUri(extensionUri, 'preview', 'preview.js'));
  const mermaidUri = webview.asWebviewUri(resolveExtensionNodeModulesUri(extensionUri, 'mermaid', 'dist', 'mermaid.esm.min.mjs'));
  const nonce = getNonce();
  const source = document.getText();
  const isPresentation = isMarkdownPresentationSource(source);
  const previewPageWidth = getPreviewPageWidth(document);
  const allowRemoteResources = vscode.workspace.getConfiguration('markdownAiStudio', document.uri).get<boolean>('allowRemoteResources', true);
  const showFrontMatter = isFrontMatterVisible(document.uri);
  const renderer = createMarkdownRenderer({
    resolveImageSrc: (rawPath) => {
      if (/^https?:/i.test(rawPath)) {
        return allowRemoteResources ? rawPath : null;
      }

      return resolvePreviewResource(rawPath);
    },
    rewriteLink: (href): { href?: string; removeHref?: boolean; attributes?: Record<string, string> } | undefined => {
      if (/^https?:/i.test(href)) {
        return {
          removeHref: true,
          attributes: {
            'data-href': href,
          },
        };
      }

      return {
        removeHref: true,
        attributes: {
          'data-href': href,
        },
      };
    },
  });
  const renderMarkdown = (markdown: string): string => sanitizeRenderedHtml(renderer.render(markdown));
  let previewMode: 'presentation' | 'document' = isPresentation ? 'presentation' : 'document';
  let previewThemeStylesheet = '';
  let documentThemeStylesheet = '';
  let documentThemeBodyClass = 'document-theme-auto';
  let documentThemeModeClass = 'document-theme-mode-auto';
  let documentMermaidThemeLight = 'default';
  let documentMermaidThemeDark = 'dark';
  let documentMermaidTransparentBackgroundLight = false;
  let documentMermaidTransparentBackgroundDark = false;
  let documentThemeName = 'auto';
  let previewBody = buildDocumentPreviewBody(source, renderMarkdown, showFrontMatter);

  if (!isPresentation) {
    try {
      const meta = extractMarkdownFrontMatterMeta(source);
      const documentThemeRegistry = loadDocumentThemeRegistryForDocument(extensionUri, document.uri);
      const frontMatterTheme = typeof meta['theme'] === 'string' ? meta['theme'] : '';
      const settingTheme = vscode.workspace.getConfiguration('markdownAiStudio', document.uri).get<string>('documentPreviewTheme', 'auto');
      const docThemeSelection = resolveDocumentThemeSelection(frontMatterTheme || settingTheme, documentThemeRegistry);
      documentThemeStylesheet = buildDocumentThemeStylesheet(documentThemeRegistry);
      documentThemeBodyClass = docThemeSelection.themeClassName;
      documentThemeModeClass = `document-theme-mode-${docThemeSelection.themeMode}`;
      documentMermaidThemeLight = docThemeSelection.lightMermaidTheme;
      documentMermaidThemeDark = docThemeSelection.darkMermaidTheme;
      documentMermaidTransparentBackgroundLight = docThemeSelection.lightMermaidTransparentBackground;
      documentMermaidTransparentBackgroundDark = docThemeSelection.darkMermaidTransparentBackground;
      documentThemeName = docThemeSelection.themeName;
    } catch (error) {
      console.warn('[markdown-ai-studio] Failed to load document theme registry.', error);
    }
  }

  if (isPresentation) {
    try {
      const previewThemeRegistry = loadPreviewThemeRegistryForDocument(extensionUri, document.uri);
      previewThemeStylesheet = buildPreviewThemeStylesheet(previewThemeRegistry);
      previewBody = renderPresentationPreview(source, renderMarkdown, previewThemeRegistry, createJsdomDocument).html;
    } catch (error) {
      previewMode = 'document';
      previewBody = buildDocumentPreviewBody(
        source,
        renderMarkdown,
        showFrontMatter,
        '<p><strong>Presentation preview failed to render.</strong> Showing the source as a document preview instead.</p>',
      );
      console.warn('Failed to build presentation preview.', error);
    }
  }

  const bodyClass = previewMode === 'presentation'
    ? 'preview-mode-presentation'
    : `preview-mode-document ${documentThemeBodyClass} ${documentThemeModeClass}`;
  const title = getPreviewTitle(document, isPresentation);
  const combinedThemeStylesheet = [previewThemeStylesheet, documentThemeStylesheet].filter(Boolean).join('\n\n');
  const imgSrcPolicy = allowRemoteResources
    ? `${webview.cspSource} https: data:`
    : `${webview.cspSource} data:`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgSrcPolicy}; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; font-src ${webview.cspSource};" />
  ${combinedThemeStylesheet ? `<style>${combinedThemeStylesheet}</style>` : ''}
  <link rel="stylesheet" href="${stylesheetUri}" />
  <link rel="stylesheet" href="${katexStylesheetUri}" />
  <title>${title}</title>
</head>
<body class="${bodyClass}" data-preview-mode="${previewMode}" data-preview-page-width="${previewPageWidth}" data-document-theme="${documentThemeName}" data-document-theme-mode="${documentThemeModeClass.replace('document-theme-mode-', '')}" data-document-mermaid-theme-light="${documentMermaidThemeLight}" data-document-mermaid-theme-dark="${documentMermaidThemeDark}" data-document-mermaid-transparent-background-light="${documentMermaidTransparentBackgroundLight ? 'true' : 'false'}" data-document-mermaid-transparent-background-dark="${documentMermaidTransparentBackgroundDark ? 'true' : 'false'}">
  ${previewBody}
  <div class="mermaid-lightbox" data-mermaid-lightbox hidden aria-hidden="true">
    <div class="mermaid-lightbox-backdrop" data-mermaid-lightbox-action="close"></div>
    <section class="mermaid-lightbox-shell" role="dialog" aria-modal="true" aria-label="Mermaid diagram viewer" tabindex="-1">
      <header class="mermaid-lightbox-toolbar">
        <div class="mermaid-lightbox-toolbar-group">
          <button type="button" class="mermaid-lightbox-button" data-mermaid-lightbox-action="zoom-out" aria-label="Zoom out">-</button>
          <span class="mermaid-lightbox-zoom" data-mermaid-lightbox-zoom>100%</span>
          <button type="button" class="mermaid-lightbox-button" data-mermaid-lightbox-action="zoom-in" aria-label="Zoom in">+</button>
          <button type="button" class="mermaid-lightbox-button" data-mermaid-lightbox-action="reset" aria-label="Fit diagram">Fit</button>
        </div>
        <button type="button" class="mermaid-lightbox-button mermaid-lightbox-button-close" data-mermaid-lightbox-action="close" aria-label="Close Mermaid diagram viewer">Close</button>
      </header>
      <div class="mermaid-lightbox-viewport" data-mermaid-lightbox-viewport>
        <div class="mermaid-lightbox-stage-wrap">
          <div class="mermaid-lightbox-stage" data-mermaid-lightbox-stage></div>
        </div>
      </div>
    </section>
  </div>
  <script nonce="${nonce}">
    window.__MERMAID_URI__ = '${mermaidUri}';
    (function () {
      const vscode = acquireVsCodeApi();
      window.__previewBridge = {
        openLink: function (href) { vscode.postMessage({ command: 'openLink', href: href }); },
        resolveImage: function (requestId, src) { vscode.postMessage({ command: 'resolveImage', requestId: requestId, src: src }); },
        setState: function (state) { vscode.setState(state); },
        getState: function () { return vscode.getState(); },
      };
    }());
  </script>
  <script nonce="${nonce}" src="${previewThemeRuntimeScriptUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getPreviewPageWidth(document: vscode.TextDocument): PreviewPageWidth {
  const configured = vscode.workspace.getConfiguration('markdownAiStudio', document.uri).get<string>('previewPageWidth', 'readable');
  return configured === 'full' ? 'full' : 'readable';
}

export function buildFrontMatterPanel(source: string): string {
  const entries = Object.entries(extractMarkdownFrontMatterMeta(source));
  if (entries.length === 0) {
    return '';
  }

  const rows = entries.map(([key, value]) => `
        <div class="frontmatter-grid-key">${escapeHtml(key)}</div>
        <div class="frontmatter-grid-value">${escapeHtml(formatFrontMatterValue(value))}</div>`).join('');

  return `<div class="frontmatter-grid">${rows}
  </div>`;
}

export function buildDocumentPreviewBody(
  source: string,
  renderMarkdown: (markdown: string) => string,
  showFrontMatter: boolean,
  documentPrefix = '',
): string {
  const frontMatter = showFrontMatter
    ? `<aside class="frontmatter-shell">${buildFrontMatterPanel(source)}</aside>`
    : '';
  const documentBody = `${documentPrefix}${renderMarkdown(stripMarkdownFrontMatter(source))}`;
  return `${frontMatter}<main class="markdown-body">${documentBody}</main>`;
}

function formatFrontMatterValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value, null, 2) ?? '';
}

function createVersionedWebviewAssetUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  pathSegments: readonly string[],
): string {
  const assetUri = vscode.Uri.joinPath(extensionUri, ...pathSegments);
  const webviewUri = webview.asWebviewUri(assetUri);

  try {
    const version = fs.statSync(assetUri.fsPath).mtimeMs.toString(36);
    return `${webviewUri.toString()}?v=${version}`;
  } catch {
    return webviewUri.toString();
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';

  for (let index = 0; index < 32; index += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function createJsdomDocument(html: string): Document {
  return new JSDOM(html).window.document;
}
