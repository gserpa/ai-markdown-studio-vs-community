import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { HtmlArtifact, HtmlArtifactOptions, HtmlAsset } from '@mfo/community-api';
import {
  createMarkdownRenderer,
  extractMarkdownFrontMatterMeta,
  isMarkdownPresentationSource,
  sanitizeRenderedHtml,
  stripMarkdownFrontMatter,
} from '@mfo/core';
import { JSDOM } from 'jsdom';
import {
  buildDocumentThemeCssArtifact,
  buildPreviewThemeCssArtifact,
  renderPresentationPreview,
  resolveDocumentThemeSelection,
} from '@mfo/preview-web';
import { getResolvedDocumentPreviewThemeSetting } from '../../document/documentPreviewThemeSettings';
import { loadDocumentThemeRegistryForDocument } from '../../document/documentThemeSupport';
import { loadPreviewThemeRegistryForDocument } from '../../presentation/previewThemeSupport';
import { getResolvedPresentationPreviewThemeSetting } from '../../presentation/presentationPreviewThemeSettings';
import { resolveDocumentResource } from '../../util/documentResourceResolver';
import { resolveExtensionAssetUri, resolveExtensionNodeModulesUri } from '../../util/extensionSupportRoot';
import { loadPreviewAssetManifest, previewAssetUri, type PreviewAssetDescriptor } from '../../util/previewAssetManifest';
import * as path from 'path';
import * as vscode from 'vscode';

export type ExportMode = 'theme' | 'paper' | 'paper-borderless';

export async function buildExportHtmlString(
  extensionUri: vscode.Uri,
  document: vscode.TextDocument,
  options: { exportMode?: ExportMode } = {},
): Promise<string> {
  return (await buildExportHtmlArtifact(extensionUri, document, {
    assetMode: 'inline',
    exportMode: options.exportMode,
  })).html;
}

export async function buildExportHtmlArtifact(
  extensionUri: vscode.Uri,
  document: vscode.TextDocument,
  options: HtmlArtifactOptions,
): Promise<HtmlArtifact> {
  const exportMode = options.exportMode ?? 'theme';
  const manifest = loadPreviewAssetManifest(extensionUri);
  const readPreviewAsset = (descriptor: PreviewAssetDescriptor): Promise<string> => readFile(previewAssetUri(extensionUri, descriptor).fsPath, 'utf8');
  const [rawPreviewCoreCss, previewDocumentCss, previewPresentationCss, previewMermaidCss, katexCss, mermaidScript, previewThemeRuntimeScript, previewCoreRuntimeScript, previewPresentationRuntimeScript] = await Promise.all([
    readPreviewAsset(manifest.assets.previewCore),
    readPreviewAsset(manifest.assets.previewDocument),
    readPreviewAsset(manifest.assets.previewPresentation),
    readPreviewAsset(manifest.assets.previewMermaid),
    readFile(resolveExtensionNodeModulesUri(extensionUri, 'katex', 'dist', 'katex.min.css').fsPath, 'utf8'),
    readFile(resolveExtensionNodeModulesUri(extensionUri, 'mermaid', 'dist', 'mermaid.min.js').fsPath, 'utf8'),
    readPreviewAsset(manifest.assets.previewThemeRuntime),
    readPreviewAsset(manifest.assets.previewCoreRuntime),
    readPreviewAsset(manifest.assets.previewPresentationRuntime),
  ]);
  const previewCoreCss = await inlinePreviewFontUrls(rawPreviewCoreCss, extensionUri);

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
      getResolvedPresentationPreviewThemeSetting(document.uri),
    );

    const hasMermaid = containsMermaid(rendered.html);
    const hasMath = containsMath(rendered.html);
    const html = buildPresentationStandaloneHtml({
      title: path.basename(document.fileName),
      body: rendered.html,
      previewCss: [previewCoreCss, previewPresentationCss, hasMermaid ? previewMermaidCss : ''].filter(Boolean).join('\n\n'),
      katexCss: hasMath ? rewriteKatexCssUrls(katexCss) : '',
      mermaidScript: hasMermaid ? mermaidScript : '',
      previewThemeRuntimeScript,
      previewCoreRuntimeScript,
      previewPresentationRuntimeScript,
      exportMode,
      hostThemeClass: exportMode === 'theme' ? getHostThemeClass() : '',
      previewThemeCss: buildPreviewThemeCssArtifact(registry, rendered.themeSelection.themeName).css,
    });
    return options.assetMode === 'external' ? externalizeHtmlArtifact(html) : { html, assets: [] };
  }

  const exportMarkdown = getExportMarkdown(source);
  const body = renderMarkdown(exportMarkdown);
  const theme = resolveExportDocumentTheme(extensionUri, document, source, exportMode);
  const documentTableLayout = getDocumentTableLayout(document);

  const hasMermaid = containsMermaid(body);
  const hasMath = containsMath(body);
  const html = buildStandaloneHtml({
    title: path.basename(document.fileName),
    body,
    previewCss: [previewCoreCss, previewDocumentCss, hasMermaid ? previewMermaidCss : ''].filter(Boolean).join('\n\n'),
    katexCss: hasMath ? rewriteKatexCssUrls(katexCss) : '',
    mermaidScript: hasMermaid ? mermaidScript : '',
    htmlClass: theme.hostThemeClass,
    bodyClass: theme.bodyClass,
    bodyAttributes: `${theme.bodyAttributes} data-preview-page-width="${documentTableLayout === 'wide' ? 'full' : 'readable'}" data-document-table-layout="${documentTableLayout}"`,
    documentThemeCss: theme.documentThemeCss,
    exportMode,
  });
  return options.assetMode === 'external' ? externalizeHtmlArtifact(html) : { html, assets: [] };
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

function externalizeHtmlArtifact(html: string): HtmlArtifact {
  const dom = new JSDOM(html);
  const outputDocument = dom.window.document;
  const assets: HtmlAsset[] = [];
  const styleElements = [...outputDocument.querySelectorAll<HTMLStyleElement>('style[data-ams-export-asset="styles"]')];
  const css = styleElements.map((element) => element.textContent ?? '').filter(Boolean).join('\n\n');
  if (css) {
    const asset = createHtmlAsset('markdown-ai-studio', 'css', 'text/css; charset=utf-8', css);
    assets.push(asset);
    const link = outputDocument.createElement('link');
    link.rel = 'stylesheet';
    link.href = asset.path;
    styleElements[0]?.before(link);
    styleElements.forEach((element) => element.remove());
  }

  for (const script of outputDocument.querySelectorAll<HTMLScriptElement>('script[data-ams-export-asset]')) {
    const logicalName = script.dataset.amsExportAsset;
    const source = script.textContent ?? '';
    if (!logicalName || !source) continue;
    const asset = createHtmlAsset(logicalName, 'js', 'text/javascript; charset=utf-8', source);
    assets.push(asset);
    script.textContent = '';
    script.src = asset.path;
    script.removeAttribute('data-ams-export-asset');
  }

  return {
    html: dom.serialize(),
    assets: deduplicateHtmlAssets(assets),
  };
}

function createHtmlAsset(logicalName: string, extension: string, mediaType: string, source: string): HtmlAsset {
  const bytes = Buffer.from(source, 'utf8');
  const contentHash = createHash('sha256').update(bytes).digest('base64url').slice(0, 18);
  return {
    path: `_assets/${logicalName}.${contentHash}.${extension}`,
    mediaType,
    contentHash,
    bytes,
  };
}

function deduplicateHtmlAssets(assets: readonly HtmlAsset[]): readonly HtmlAsset[] {
  return [...new Map(assets.map((asset) => [`${asset.contentHash}:${asset.mediaType}`, asset])).values()];
}

function containsMermaid(html: string): boolean {
  return /class="[^"]*\bmermaid(?:-rendered)?\b/u.test(html);
}

function containsMath(html: string): boolean {
  return /class="[^"]*\bkatex\b/u.test(html);
}

function rewriteKatexCssUrls(css: string): string {
  return css.replace(/url\((?:\.\/)?fonts\//gu, 'url(https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/fonts/');
}

async function inlinePreviewFontUrls(css: string, extensionUri: vscode.Uri): Promise<string> {
  const names = [...new Set([...css.matchAll(/url\(['"]?\.\.\/fonts\/([^'"\)]+)['"]?\)/gu)].map((match) => match[1]))];
  let output = css;
  await Promise.all(names.map(async (name) => {
    const bytes = await readFile(resolveExtensionAssetUri(extensionUri, 'preview', 'fonts', name).fsPath);
    const mediaType = name.toLowerCase().endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
    const dataUri = `data:${mediaType};base64,${bytes.toString('base64')}`;
    output = output.replaceAll(`../fonts/${name}`, dataUri);
  }));
  return output;
}

function getExportMarkdown(source: string): string {
  return stripMarkdownFrontMatter(source);
}

function getDocumentTableLayout(document: vscode.TextDocument): 'wide' | 'wrap' {
  const configured = vscode.workspace.getConfiguration('markdownAiStudio', document.uri).get<string>('documentTableLayout', 'wide');
  return configured === 'wrap' ? 'wrap' : 'wide';
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
<html lang="en" data-md-host-scheme="auto"${input.htmlClass ? ` class="${escapeHtml(input.htmlClass)}"` : ''}>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(input.title)}</title>
  <style data-ams-export-asset="styles">
${input.previewCss}
  </style>
  ${input.katexCss ? `<style data-ams-export-asset="styles">
${input.katexCss}
  </style>` : ''}
  ${input.documentThemeCss ? `<style data-ams-export-asset="styles">
${input.documentThemeCss}
  </style>` : ''}
  <style data-ams-export-asset="styles">
${getExportThemeCss()}
  </style>
  ${input.exportMode !== 'theme' ? `<style data-ams-export-asset="styles">
${getPrinterFriendlyExportCss(input.exportMode)}
  </style>` : ''}
  <style data-ams-export-asset="styles">
${getExportScrollCss()}
  </style>
</head>
<body class="${escapeHtml(input.bodyClass)}" data-md-preview-root data-preview-mode="document"${input.bodyAttributes}>
  <main class="markdown-body">${input.body}</main>
  ${input.mermaidScript ? `<script data-ams-export-asset="mermaid">
${input.mermaidScript}
  </script>
  <script>
${getMermaidBootstrapScript()}
  </script>` : ''}
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
  previewCoreRuntimeScript: string;
  previewPresentationRuntimeScript: string;
  previewThemeCss: string;
  hostThemeClass: string;
  exportMode: ExportMode;
}): string {
  return `<!DOCTYPE html>
<html lang="en" data-md-host-scheme="auto"${input.hostThemeClass ? ` class="${escapeHtml(input.hostThemeClass)}"` : ''}>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(input.title)}</title>
  <style data-ams-export-asset="styles">
${input.previewCss}
  </style>
  ${input.katexCss ? `<style data-ams-export-asset="styles">
${input.katexCss}
  </style>` : ''}
  <style data-ams-export-asset="styles">
${input.previewThemeCss}
  </style>
  <style data-ams-export-asset="styles">
${getExportThemeCss()}
  </style>
  ${input.exportMode !== 'theme' ? `<style data-ams-export-asset="styles">
${getPrinterFriendlyExportCss(input.exportMode)}
  </style>` : ''}
</head>
<body class="${escapeHtml(['preview-mode-presentation', input.hostThemeClass].filter(Boolean).join(' '))}" data-preview-mode="presentation" data-presentation-content-overflow="scaleToFit">
  ${input.body}
  <script>
${getStandalonePreviewBridgeScript()}
  </script>
  ${input.mermaidScript ? `<script data-ams-export-asset="mermaid">
${input.mermaidScript}
  </script>` : ''}
  <script data-ams-export-asset="preview-theme-runtime">
${input.previewThemeRuntimeScript}
  </script>
  <script data-ams-export-asset="preview-core-runtime">
${input.previewCoreRuntimeScript}
  </script>
  <script data-ams-export-asset="preview-presentation-runtime">
${input.previewPresentationRuntimeScript}
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

function getPrinterFriendlyExportCss(exportMode: ExportMode): string {
  return `
html,
body,
body.preview-mode-document,
body.preview-mode-presentation,
body.preview-mode-document .document-preview-shell,
body.preview-mode-document .document-preview-scroll,
body.preview-mode-presentation .presentation-preview,
body.preview-mode-presentation .presentation-stage,
body.preview-mode-presentation .presentation-slide,
body.preview-mode-presentation .presentation-slide-shell,
body.preview-mode-presentation .presentation-frame,
body.preview-mode-presentation .presentation-canvas,
body.preview-mode-presentation .presentation-surface,
body.preview-mode-document .markdown-body,
body.preview-mode-presentation .presentation-slide-body.markdown-body {
  background-color: #ffffff !important;
  background-image: none !important;
  background: #ffffff !important;
}

${exportMode === 'paper-borderless' ? `
body.preview-mode-document .markdown-body,
body.preview-mode-presentation .presentation-slide-shell,
body.preview-mode-presentation .presentation-frame,
body.preview-mode-presentation .presentation-surface,
body.preview-mode-presentation .presentation-slide-body.markdown-body {
  border: 0 !important;
  box-shadow: none !important;
}
` : ''}

body.preview-mode-document .markdown-body,
body.preview-mode-presentation .presentation-slide-body.markdown-body {
  --md-preview-content-bg: #ffffff;
  --md-preview-content-border: transparent;
  --md-preview-content-shadow: none;
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
        documentTheme: selection.themeName,
        documentThemeMode: selection.themeMode,
        documentMermaidThemeLight: selection.lightMermaidTheme,
        documentMermaidThemeDark: selection.darkMermaidTheme,
        documentMermaidTransparentBackgroundLight: selection.lightMermaidTransparentBackground ? 'true' : 'false',
        documentMermaidTransparentBackgroundDark: selection.darkMermaidTransparentBackground ? 'true' : 'false',
      }),
      documentThemeCss: buildDocumentThemeCssArtifact(documentThemeRegistry, selection.themeName).css,
    };
  } catch (error) {
    console.warn('[markdown-ai-studio] Failed to resolve export document theme. Falling back to auto theme.', error);
    return {
      hostThemeClass,
      bodyClass: ['preview-mode-document', 'document-theme-auto', 'document-theme-mode-auto', hostThemeClass]
        .filter(Boolean)
        .join(' '),
      bodyAttributes: buildBodyAttributes({
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
