import { readFile, writeFile } from 'node:fs/promises';
import {
  createMarkdownRenderer,
  extractMarkdownFrontMatterMeta,
  isMarkdownPresentationSource,
  sanitizeRenderedHtml,
  stripMarkdownFrontMatter,
} from '@mfo/core';
import { JSDOM } from 'jsdom';
import {
  buildDocumentThemeStylesheet,
  buildPreviewThemeStylesheet,
  renderPresentationPreview,
  resolveDocumentThemeSelection,
} from '@mfo/preview-web';
import { getResolvedDocumentPreviewThemeSetting } from '../../document/documentPreviewThemeSettings';
import { loadDocumentThemeRegistryForDocument } from '../../document/documentThemeSupport';
import { loadPreviewThemeRegistryForDocument } from '../../presentation/previewThemeSupport';
import { resolveDocumentResource } from '../../util/documentResourceResolver';
import { resolveExtensionAssetUri, resolveExtensionNodeModulesUri } from '../../util/extensionSupportRoot';
import * as path from 'path';
import * as vscode from 'vscode';

export type ExportMode = 'theme' | 'paper' | 'paper-borderless';

export async function buildExportHtmlString(
  extensionUri: vscode.Uri,
  document: vscode.TextDocument,
  options: { exportMode?: ExportMode } = {},
): Promise<string> {
  const exportMode = options.exportMode ?? 'theme';
  const [previewCss, katexCss, mermaidScript, previewThemeRuntimeScript, previewScript] = await Promise.all([
    readFile(resolveExtensionAssetUri(extensionUri, 'preview', 'preview.css').fsPath, 'utf8'),
    readFile(resolveExtensionNodeModulesUri(extensionUri, 'katex', 'dist', 'katex.min.css').fsPath, 'utf8'),
    readFile(resolveExtensionNodeModulesUri(extensionUri, 'mermaid', 'dist', 'mermaid.min.js').fsPath, 'utf8'),
    readFile(resolveExtensionAssetUri(extensionUri, 'preview', 'preview-theme-runtime.js').fsPath, 'utf8'),
    readFile(resolveExtensionAssetUri(extensionUri, 'preview', 'preview.js').fsPath, 'utf8'),
  ]);

  const source = document.getText();
  const allowRemoteResources = vscode.workspace.getConfiguration('markdownAiStudio', document.uri).get<boolean>('allowRemoteResources', true);
  const renderer = createMarkdownRenderer({
    resolveImageSrc: (rawPath) => {
      if (/^https?:/i.test(rawPath)) {
        return allowRemoteResources ? rawPath : null;
      }

      return resolveDocumentResource(document, rawPath)?.toString();
    },
    rewriteLink: (href) => {
      if (/^https?:/i.test(href) || href.startsWith('#')) {
        return /^https?:/i.test(href)
          ? {
              attributes: {
                target: '_blank',
                rel: 'noopener noreferrer',
              },
            }
          : undefined;
      }

      return {
        href: resolveDocumentResource(document, href)?.toString() ?? href,
      };
    },
  });
  const renderMarkdown = (markdown: string): string => sanitizeRenderedHtml(renderer.render(markdown));

  if (isMarkdownPresentationSource(source)) {
    const registry = loadPreviewThemeRegistryForDocument(extensionUri, document.uri);
    const rendered = renderPresentationPreview(
      source,
      renderMarkdown,
      registry,
      (html) => new JSDOM(html).window.document,
    );

    return buildPresentationStandaloneHtml({
      title: path.basename(document.fileName),
      body: rendered.html,
      previewCss,
      katexCss: rewriteKatexCssUrls(katexCss),
      mermaidScript,
      previewThemeRuntimeScript,
      previewScript,
      exportMode,
      previewThemeCss: buildPreviewThemeStylesheet(registry),
    });
  }

  const exportMarkdown = getExportMarkdown(source);
  const body = renderMarkdown(exportMarkdown);
  const theme = resolveExportDocumentTheme(extensionUri, document, source, exportMode);

  return buildStandaloneHtml({
    title: path.basename(document.fileName),
    body,
    previewCss,
    katexCss: rewriteKatexCssUrls(katexCss),
    mermaidScript,
    htmlClass: theme.hostThemeClass,
    bodyClass: theme.bodyClass,
    bodyAttributes: theme.bodyAttributes,
    documentThemeCss: theme.documentThemeCss,
    exportMode,
  });
}

export async function exportMarkdownAsHtml(extensionUri: vscode.Uri, document: vscode.TextDocument): Promise<vscode.Uri | undefined> {
  const defaultTarget = vscode.Uri.file(path.join(path.dirname(document.uri.fsPath), `${path.parse(document.fileName).name}.html`));
  const targetUri = await vscode.window.showSaveDialog({
    defaultUri: defaultTarget,
    filters: {
      HTML: ['html'],
    },
    saveLabel: 'Export HTML',
  });

  if (!targetUri) {
    return undefined;
  }

  const html = await buildExportHtmlString(extensionUri, document);
  await writeFile(targetUri.fsPath, html, 'utf8');
  return targetUri;
}

function rewriteKatexCssUrls(css: string): string {
  return css.replace(/url\((?:\.\/)?fonts\//gu, 'url(https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/fonts/');
}

function getExportMarkdown(source: string): string {
  return stripMarkdownFrontMatter(source);
}

function buildStandaloneHtml(input: {
  title: string;
  body: string;
  previewCss: string;
  katexCss: string;
  mermaidScript: string;
  htmlClass: string;
  bodyClass: string;
  bodyAttributes: string;
  documentThemeCss: string;
  exportMode: ExportMode;
}): string {
  return `<!DOCTYPE html>
<html lang="en"${input.htmlClass ? ` class="${escapeHtml(input.htmlClass)}"` : ''}>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(input.title)}</title>
  <style>
${getExportThemeCss()}
  </style>
  ${input.documentThemeCss ? `<style>
${input.documentThemeCss}
  </style>` : ''}
  <style>
${input.katexCss}
  </style>
  <style>
${input.previewCss}
  </style>
  ${input.exportMode === 'paper-borderless' ? `<style>
${getBorderlessExportCss()}
  </style>` : ''}
  <style>
${getExportScrollCss()}
  </style>
</head>
<body class="${escapeHtml(input.bodyClass)}" data-preview-mode="document"${input.bodyAttributes}>
  <main class="markdown-body">${input.body}</main>
  <script>
${input.mermaidScript}
  </script>
  <script>
${getMermaidBootstrapScript()}
  </script>
</body>
</html>`;
}

function buildPresentationStandaloneHtml(input: {
  title: string;
  body: string;
  previewCss: string;
  katexCss: string;
  mermaidScript: string;
  previewThemeRuntimeScript: string;
  previewScript: string;
  previewThemeCss: string;
  exportMode: ExportMode;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(input.title)}</title>
  <style>
${getExportThemeCss()}
  </style>
  <style>
${input.previewThemeCss}
  </style>
  <style>
${input.katexCss}
  </style>
  <style>
${input.previewCss}
  </style>
  ${input.exportMode === 'paper-borderless' ? `<style>
${getBorderlessExportCss()}
  </style>` : ''}
</head>
<body class="preview-mode-presentation" data-preview-mode="presentation">
  ${input.body}
  <script>
${getStandalonePreviewBridgeScript()}
  </script>
  <script>
${input.mermaidScript}
  </script>
  <script>
${input.previewThemeRuntimeScript}
  </script>
  <script>
${input.previewScript}
  </script>
</body>
</html>`;
}

function getStandalonePreviewBridgeScript(): string {
  return `window.__previewBridge = {
  openLink(href) {
    if (href) {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  },
  resolveImage() {},
  setState(state) {
    window.__markdownAiStudioPreviewState = state;
  },
  getState() {
    return window.__markdownAiStudioPreviewState || {};
  },
};`;
}

function getExportScrollCss(): string {
  return `
body.preview-mode-document {
  height: auto;
  min-height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
  background-color: var(--md-preview-content-bg);
}
html {
  background-color: var(--md-preview-content-bg);
}

body.preview-mode-document .document-preview-shell {
  display: block;
  width: 100%;
  height: auto;
  min-height: 100vh;
}

body.preview-mode-document .document-preview-scroll {
  display: block;
  flex: none;
  min-height: 0;
  overflow: visible;
}
`;
}

function getBorderlessExportCss(): string {
  return `
body.preview-mode-document .markdown-body,
body.preview-mode-presentation .presentation-slide-shell,
body.preview-mode-presentation .presentation-frame,
body.preview-mode-presentation .presentation-surface,
body.preview-mode-presentation .presentation-slide-body.markdown-body {
  border: 0 !important;
  box-shadow: none !important;
}
`;
}

function getExportThemeCss(): string {
  return `
:root {
  --vscode-editor-foreground: #24292f;
  --vscode-editor-background: #ffffff;
  --vscode-panel-border: #d0d7de;
  --vscode-descriptionForeground: #57606a;
  --vscode-textBlockQuote-border: #d0d7de;
  --vscode-textLink-foreground: #0969da;
  --vscode-textLink-activeForeground: #1a7f37;
  --vscode-focusBorder: #0969da;
  --vscode-editorHoverWidget-background: #f6f8fa;
  --vscode-foreground: #24292f;
}

html.vscode-dark,
body.vscode-dark {
  --vscode-editor-foreground: #c9d1d9;
  --vscode-editor-background: #0d1117;
  --vscode-panel-border: #30363d;
  --vscode-descriptionForeground: #8b949e;
  --vscode-textBlockQuote-border: #3d444d;
  --vscode-textLink-foreground: #58a6ff;
  --vscode-textLink-activeForeground: #79c0ff;
  --vscode-focusBorder: #2f81f7;
  --vscode-editorHoverWidget-background: #161b22;
  --vscode-foreground: #c9d1d9;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background: var(--vscode-editor-background);
}
`;
}

function getMermaidBootstrapScript(): string {
  return `(async () => {
  const body = document.body;
  if (!window.mermaid || !(body instanceof HTMLBodyElement)) {
    return;
  }

  const hostIsDarkMode = body.classList.contains('vscode-dark') || body.classList.contains('vscode-high-contrast');
  const documentThemeMode = body.dataset.documentThemeMode === 'dark' || body.dataset.documentThemeMode === 'light' || body.dataset.documentThemeMode === 'auto'
    ? body.dataset.documentThemeMode
    : 'auto';
  const useDarkDocumentTheme = documentThemeMode === 'dark' || (documentThemeMode === 'auto' && hostIsDarkMode);
  const mermaidTheme = useDarkDocumentTheme
    ? (body.dataset.documentMermaidThemeDark || 'dark')
    : (body.dataset.documentMermaidThemeLight || 'default');
  const mermaidTransparentBackground = useDarkDocumentTheme
    ? body.dataset.documentMermaidTransparentBackgroundDark === 'true'
    : body.dataset.documentMermaidTransparentBackgroundLight === 'true';

  window.mermaid.startOnLoad = false;
  window.mermaid.initialize({
    startOnLoad: false,
    theme: mermaidTheme,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    htmlLabels: true,
    fontFamily: 'Segoe UI, Arial, sans-serif',
    flowchart: {
      htmlLabels: true,
      useMaxWidth: true,
      padding: 10,
    },
  });

  const blocks = [...document.querySelectorAll('.mermaid, .mermaid-rendered[data-mermaid-source]')];
  for (const [index, block] of blocks.entries()) {
    const source = block.getAttribute('data-mermaid-source')?.trim() || block.textContent?.trim();
    if (!source) {
      continue;
    }

    const renderId = 'export-mermaid-' + (index + 1);
    const renderResult = await window.mermaid.render(renderId, source);
    const svg = typeof renderResult === 'string' ? renderResult : renderResult?.svg;
    if (typeof svg === 'string' && svg.trim()) {
      block.innerHTML = svg;
      block.classList.remove('mermaid');
      block.classList.add('mermaid-rendered');
      block.setAttribute('data-mermaid-source', source);
      neutralizeStrictMermaidInteractivity(block);
      normalizeRenderedMermaidSvgSizing(block);
      if (mermaidTransparentBackground) {
        patchTransparentMermaidBackground(block);
      }
    }

    if (typeof renderResult?.bindFunctions === 'function') {
      renderResult.bindFunctions(block);
    }
  }

  function neutralizeStrictMermaidInteractivity(block) {
    if (!(block instanceof HTMLElement)) {
      return;
    }

    for (const anchor of block.querySelectorAll('a')) {
      const linkTarget = getAnchorLinkTarget(anchor);
      if (linkTarget) {
        anchor.setAttribute('href', linkTarget);
      }

      anchor.removeAttribute('onclick');
    }

    for (const element of block.querySelectorAll('[onclick]')) {
      element.removeAttribute('onclick');
    }
  }

  function getAnchorLinkTarget(anchor) {
    if (!(anchor instanceof Element)) {
      return '';
    }

    const namespacedHref = anchor.getAttribute('href')
      || anchor.getAttribute('xlink:href')
      || anchor.getAttributeNS?.('http://www.w3.org/1999/xlink', 'href')
      || anchor.getAttribute('data-href');
    if (typeof namespacedHref === 'string' && namespacedHref.trim()) {
      return namespacedHref.trim();
    }

    const hrefObject = anchor.href;
    if (typeof hrefObject === 'string' && hrefObject.trim()) {
      return hrefObject.trim();
    }

    if (hrefObject && typeof hrefObject === 'object') {
      const baseVal = typeof hrefObject.baseVal === 'string' ? hrefObject.baseVal.trim() : '';
      if (baseVal) {
        return baseVal;
      }

      const animVal = typeof hrefObject.animVal === 'string' ? hrefObject.animVal.trim() : '';
      if (animVal) {
        return animVal;
      }
    }

    return '';
  }

  function normalizeRenderedMermaidSvgSizing(block) {
    if (!(block instanceof HTMLElement)) {
      return;
    }

    const svg = block.querySelector('svg');
    if (!(svg instanceof SVGElement)) {
      return;
    }

    const viewBox = parseSvgViewBox(svg.getAttribute('viewBox'));
    if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0) {
      return;
    }

    svg.setAttribute('width', String(viewBox.width));
    svg.setAttribute('height', String(viewBox.height));
    if (!svg.hasAttribute('preserveAspectRatio')) {
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }

    svg.style.removeProperty('width');
    svg.style.removeProperty('height');
    svg.style.removeProperty('max-width');
  }

  function patchTransparentMermaidBackground(block) {
    if (!(block instanceof HTMLElement)) {
      return;
    }

    const svg = block.querySelector('svg');
    if (!(svg instanceof SVGElement)) {
      return;
    }

    svg.classList.add('mermaid-background-transparent');
    svg.style.background = 'transparent';
    svg.style.backgroundColor = 'transparent';

    const viewBox = parseSvgViewBox(svg.getAttribute('viewBox'));
    const backgroundElements = block.querySelectorAll('svg > rect, svg .background, svg rect.background, svg .diagram-background');
    for (const element of backgroundElements) {
      if (!(element instanceof SVGElement) || !isMermaidBackgroundElement(element, viewBox)) {
        continue;
      }

      element.setAttribute('fill', 'transparent');
      element.style.fill = 'transparent';
      element.style.background = 'transparent';
      element.style.backgroundColor = 'transparent';
    }
  }

  function parseSvgViewBox(value) {
    const parts = (value || '').trim().split(/\\s+/).map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
      return undefined;
    }

    return {
      width: parts[2],
      height: parts[3],
    };
  }

  function isMermaidBackgroundElement(element, viewBox) {
    const className = String(element.getAttribute('class') || '').toLowerCase();
    const id = String(element.getAttribute('id') || '').toLowerCase();
    if (className.includes('background') || id.includes('background')) {
      return true;
    }

    if (element.parentElement?.tagName.toLowerCase() !== 'svg') {
      return false;
    }

    const width = String(element.getAttribute('width') || '').trim();
    const height = String(element.getAttribute('height') || '').trim();
    if (width === '100%' || height === '100%') {
      return true;
    }

    if (!viewBox) {
      return false;
    }

    return Number(width) >= viewBox.width && Number(height) >= viewBox.height;
  }
})();`;
}

function resolveExportDocumentTheme(
  extensionUri: vscode.Uri,
  document: vscode.TextDocument,
  source: string,
  exportMode: ExportMode,
): {
  hostThemeClass: string;
  bodyClass: string;
  bodyAttributes: string;
  documentThemeCss: string;
} {
  const usePrinterFriendlyTheme = exportMode !== 'theme';
  const hostThemeClass = usePrinterFriendlyTheme ? '' : getHostThemeClass();

  try {
    const meta = extractMarkdownFrontMatterMeta(source);
    const documentThemeRegistry = loadDocumentThemeRegistryForDocument(extensionUri, document.uri);
    const frontMatterTheme = typeof meta.theme === 'string' ? meta.theme : '';
    const settingTheme = getResolvedDocumentPreviewThemeSetting(document.uri);
    const themeName = usePrinterFriendlyTheme
      ? documentThemeRegistry.defaultLightThemeName
      : frontMatterTheme || settingTheme;
    const selection = resolveDocumentThemeSelection(themeName, documentThemeRegistry);

    return {
      hostThemeClass,
      bodyClass: ['preview-mode-document', selection.themeClassName, `document-theme-mode-${selection.themeMode}`, hostThemeClass]
        .filter(Boolean)
        .join(' '),
      bodyAttributes: buildBodyAttributes({
        previewMode: 'document',
        documentTheme: selection.themeName,
        documentThemeMode: selection.themeMode,
        documentMermaidThemeLight: selection.lightMermaidTheme,
        documentMermaidThemeDark: selection.darkMermaidTheme,
        documentMermaidTransparentBackgroundLight: selection.lightMermaidTransparentBackground ? 'true' : 'false',
        documentMermaidTransparentBackgroundDark: selection.darkMermaidTransparentBackground ? 'true' : 'false',
      }),
      documentThemeCss: buildDocumentThemeStylesheet(documentThemeRegistry),
    };
  } catch (error) {
    console.warn('[markdown-ai-studio] Failed to resolve export document theme. Falling back to auto theme.', error);
    return {
      hostThemeClass,
      bodyClass: ['preview-mode-document', 'document-theme-auto', 'document-theme-mode-auto', hostThemeClass]
        .filter(Boolean)
        .join(' '),
      bodyAttributes: buildBodyAttributes({
        previewMode: 'document',
        documentTheme: 'auto',
        documentThemeMode: 'auto',
        documentMermaidThemeLight: 'default',
        documentMermaidThemeDark: 'dark',
        documentMermaidTransparentBackgroundLight: 'false',
        documentMermaidTransparentBackgroundDark: 'false',
      }),
      documentThemeCss: '',
    };
  }
}

function buildBodyAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([name, value]) => ` data-${toKebabCase(name)}="${escapeHtml(value)}"`)
    .join('');
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/gu, (match) => `-${match.toLowerCase()}`);
}

function getHostThemeClass(): string {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast
    ? 'vscode-dark'
    : '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}
