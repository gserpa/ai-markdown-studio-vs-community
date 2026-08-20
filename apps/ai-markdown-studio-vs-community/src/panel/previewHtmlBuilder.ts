import * as path from 'path';
import * as vscode from 'vscode';
import { JSDOM } from 'jsdom';
import { createMarkdownRenderer, sanitizeRenderedHtml, stripMarkdownFrontMatter } from '@mfo/core';
import { isMarkdownPresentationSource, extractMarkdownFrontMatterMeta } from '@mfo/core';
import { renderPresentationPreview } from '@mfo/preview-web';
import { buildPreviewThemeCssArtifact, buildDocumentThemeCssArtifact, resolveDocumentThemeSelection } from '@mfo/preview-web';
import { getResolvedDocumentPreviewThemeSetting } from '../document/documentPreviewThemeSettings';
import { loadPreviewThemeRegistryForDocument } from '../presentation/previewThemeSupport';
import { getResolvedPresentationPreviewThemeSetting } from '../presentation/presentationPreviewThemeSettings';
import { loadDocumentThemeRegistryForDocument } from '../document/documentThemeSupport';
import { resolveExtensionNodeModulesUri } from '../util/extensionSupportRoot';
import { loadPreviewAssetManifest, matchingThemeAsset, previewAssetUri, type PreviewAssetDescriptor } from '../util/previewAssetManifest';
import { isFrontMatterVisible } from './frontMatterDisplayState';

type PreviewPageWidth = 'readable' | 'full';
type PresentationContentOverflow = 'scroll' | 'scaleToFit';

export function getPreviewTitle(document: vscode.TextDocument, isPresentation = false): string {
  return `${isPresentation ? 'Presentation Preview' : 'Preview'}: ${path.basename(document.fileName)}`;
}

export function buildPreviewHtml(
  extensionUri: vscode.Uri,
  webview: vscode.Webview,
  document: vscode.TextDocument,
  resolvePreviewResource: (rawPath: string) => string | undefined,
): string {
  const assetManifest = loadPreviewAssetManifest(extensionUri);
  const assetHref = (descriptor: PreviewAssetDescriptor): string => webview.asWebviewUri(previewAssetUri(extensionUri, descriptor)).toString();
  const coreStylesheetUri = assetHref(assetManifest.assets.previewCore);
  const katexStylesheetUri = webview.asWebviewUri(resolveExtensionNodeModulesUri(extensionUri, 'katex', 'dist', 'katex.min.css'));
  const previewThemeRuntimeScriptUri = assetHref(assetManifest.assets.previewThemeRuntime);
  const scriptUri = assetHref(assetManifest.assets.previewCoreRuntime);
  const mermaidUri = webview.asWebviewUri(resolveExtensionNodeModulesUri(extensionUri, 'mermaid', 'dist', 'mermaid.esm.min.mjs'));
  const nonce = getNonce();
  const source = document.getText();
  const isPresentation = isMarkdownPresentationSource(source);
  const previewPageWidth = getPreviewPageWidth(document);
  const documentTableLayout = getDocumentTableLayout(document);
  const presentationContentOverflow = getPresentationContentOverflow(document);
  const presentationDefaultTheme = getResolvedPresentationPreviewThemeSetting(document.uri);
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
  let inlineThemeStylesheet = '';
  let themeStylesheetUri = '';
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
      const settingTheme = getResolvedDocumentPreviewThemeSetting(document.uri);
      const docThemeSelection = resolveDocumentThemeSelection(frontMatterTheme || settingTheme, documentThemeRegistry);
      const artifact = buildDocumentThemeCssArtifact(documentThemeRegistry, docThemeSelection.themeName);
      const asset = matchingThemeAsset(assetManifest, artifact);
      if (asset) themeStylesheetUri = assetHref(asset);
      else inlineThemeStylesheet = artifact.css;
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
      const rendered = renderPresentationPreview(source, renderMarkdown, previewThemeRegistry, createJsdomDocument, presentationDefaultTheme);
      previewBody = rendered.html;
      const artifact = buildPreviewThemeCssArtifact(previewThemeRegistry, rendered.themeSelection.themeName);
      const asset = matchingThemeAsset(assetManifest, artifact);
      if (asset) themeStylesheetUri = assetHref(asset);
      else inlineThemeStylesheet = artifact.css;
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
  const hasMermaid = /class="[^"]*\bmermaid(?:-rendered)?\b/u.test(previewBody);
  const hasMath = /class="[^"]*\bkatex\b/u.test(previewBody);
  const modeStylesheetUri = assetHref(assetManifest.assets[previewMode === 'presentation' ? 'previewPresentation' : 'previewDocument']);
  const modeScriptUri = assetHref(assetManifest.assets[previewMode === 'presentation' ? 'previewPresentationRuntime' : 'previewDocumentRuntime']);
  const mermaidStylesheetUri = hasMermaid ? assetHref(assetManifest.assets.previewMermaid) : '';
  const imgSrcPolicy = allowRemoteResources
    ? `${webview.cspSource} https: data:`
    : `${webview.cspSource} data:`;

  return `<!DOCTYPE html>
<html lang="en" data-md-host-scheme="auto">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgSrcPolicy}; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; font-src ${webview.cspSource};" />
  <link rel="stylesheet" href="${coreStylesheetUri}" />
  <link rel="stylesheet" href="${modeStylesheetUri}" />
  ${mermaidStylesheetUri ? `<link rel="stylesheet" href="${mermaidStylesheetUri}" />` : ''}
  ${hasMath ? `<link rel="stylesheet" href="${katexStylesheetUri}" />` : ''}
  ${themeStylesheetUri ? `<link rel="stylesheet" href="${themeStylesheetUri}" />` : ''}
  ${inlineThemeStylesheet ? `<style>${inlineThemeStylesheet}</style>` : ''}
  <title>${title}</title>
</head>
<body class="${bodyClass}" data-md-preview-root data-preview-mode="${previewMode}" data-preview-page-width="${previewPageWidth}" data-document-table-layout="${documentTableLayout}" data-presentation-content-overflow="${presentationContentOverflow}" data-document-theme="${documentThemeName}" data-document-theme-mode="${documentThemeModeClass.replace('document-theme-mode-', '')}" data-document-mermaid-theme-light="${documentMermaidThemeLight}" data-document-mermaid-theme-dark="${documentMermaidThemeDark}" data-document-mermaid-transparent-background-light="${documentMermaidTransparentBackgroundLight ? 'true' : 'false'}" data-document-mermaid-transparent-background-dark="${documentMermaidTransparentBackgroundDark ? 'true' : 'false'}">
  ${previewBody}
  ${hasMermaid ? `<div class="mermaid-lightbox" data-md-theme-scope data-mermaid-lightbox hidden aria-hidden="true">
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
  </div>` : ''}
  <script nonce="${nonce}">
    ${hasMermaid ? `window.__MERMAID_URI__ = '${mermaidUri}';` : ''}
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
  ${previewMode === 'presentation' ? `<script nonce="${nonce}" src="${previewThemeRuntimeScriptUri}"></script>` : ''}
  <script nonce="${nonce}" src="${scriptUri}"></script>
  <script nonce="${nonce}" src="${modeScriptUri}"></script>
</body>
</html>`;
}

function getPreviewPageWidth(document: vscode.TextDocument): PreviewPageWidth {
  const configured = vscode.workspace.getConfiguration('markdownAiStudio', document.uri).get<string>('previewPageWidth', 'readable');
  return configured === 'full' ? 'full' : 'readable';
}

function getDocumentTableLayout(document: vscode.TextDocument): 'wide' | 'wrap' {
  const configured = vscode.workspace.getConfiguration('markdownAiStudio', document.uri).get<string>('documentTableLayout', 'wide');
  return configured === 'wrap' ? 'wrap' : 'wide';
}

function getPresentationContentOverflow(document: vscode.TextDocument): PresentationContentOverflow {
  const configured = vscode.workspace.getConfiguration('markdownAiStudio', document.uri).get<string>('presentationContentOverflow', 'scaleToFit');
  return configured === 'scaleToFit' ? 'scaleToFit' : 'scroll';
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
  return `<div class="document-preview-shell">${frontMatter}<div class="document-preview-scroll"><main class="markdown-body">${documentBody}</main></div></div>`;
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
