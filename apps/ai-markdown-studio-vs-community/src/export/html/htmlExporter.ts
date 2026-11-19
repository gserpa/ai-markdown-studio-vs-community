import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { HtmlArtifact, HtmlArtifactOptions, HtmlAsset } from '@mfo/community-api';
import {
  createMarkdownRenderer,
  extractMarkdownFrontMatterMeta,
  isMarkdownPresentationSource,
  sanitizeRenderedHtml,
  stripMarkdownFrontMatter,
  stripReviewComments,
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
import { imageDataUri } from '../../images/imageDataUri';
import { resolveDocumentResource } from '../../util/documentResourceResolver';
import { resolveExtensionAssetUri, resolveExtensionNodeModulesUri } from '../../util/extensionSupportRoot';
import { loadPreviewAssetManifest, matchingThemeAsset, previewAssetUri, selectPreviewStylesheetAssets, type PreviewAssetDescriptor } from '../../util/previewAssetManifest';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ThemeCssArtifact } from '@mfo/preview-web';
import { HtmlExportAssetCache, inlineKatexFontUrls, selectReferencedPreviewFonts } from './htmlExportAssets';
import { preparePortableMarkdown } from './portableMarkdown';
import { portableReviewBody, portableReviewHead, safeScript, validatePortableMediaResources, type PortableShellOptions } from './portableReviewHtml';

export type ExportMode = 'theme' | 'paper' | 'paper-borderless';
type VisualizationExportAssets = { runtime: string; notices: string };
const exportAssets = new HtmlExportAssetCache();

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
  return buildRenderedHtmlArtifact(extensionUri, document, options);
}

async function buildRenderedHtmlArtifact(
  extensionUri: vscode.Uri,
  document: vscode.TextDocument,
  options: HtmlArtifactOptions,
  portable?: PortableShellOptions,
): Promise<HtmlArtifact> {
  const exportMode = options.exportMode ?? 'theme';
  const manifest = loadPreviewAssetManifest(extensionUri);
  const readPreviewAsset = (descriptor: PreviewAssetDescriptor): Promise<string> => exportAssets.readText(previewAssetUri(extensionUri, descriptor).fsPath, descriptor.contentHash);
  const visualizationAssets = async (body: string): Promise<VisualizationExportAssets | undefined> => {
    if (!body.includes('data-md-visualization="vega-lite"')) return undefined;
    const [runtime, notices] = await Promise.all([
      readPreviewAsset(manifest.assets.previewVisualizationsRuntime),
      readPreviewAsset(manifest.assets.previewVisualizationsNotices),
    ]);
    return { runtime, notices };
  };
  const loadAssets = async (body: string, mode: 'document' | 'presentation', theme?: ThemeCssArtifact) => {
    const hasMermaid = containsMermaid(body);
    const themeAsset = theme && matchingThemeAsset(manifest, theme);
    const [styles, katexCss, mermaidScript, previewThemeRuntimeScript, previewCoreRuntimeScript, modeRuntimeScript, themeCss, visualizations] = await Promise.all([
      Promise.all(selectPreviewStylesheetAssets(manifest, mode, hasMermaid || containsImages(body)).map(readPreviewAsset)),
      containsMath(body) ? exportAssets.readText(resolveExtensionNodeModulesUri(extensionUri, 'katex', 'dist', 'katex.min.css').fsPath) : '',
      hasMermaid ? exportAssets.readText(resolveExtensionNodeModulesUri(extensionUri, 'mermaid', 'dist', 'mermaid.min.js').fsPath) : '',
      readPreviewAsset(manifest.assets.previewThemeRuntime),
      readPreviewAsset(manifest.assets.previewCoreRuntime),
      readPreviewAsset(manifest.assets[mode === 'presentation' ? 'previewPresentationRuntime' : 'previewDocumentRuntime']),
      themeAsset ? readPreviewAsset(themeAsset) : theme?.css ?? '',
      visualizationAssets(body),
    ]);
    const selectedCss = selectReferencedPreviewFonts(styles.join('\n\n'), themeCss, body);
    const previewCss = await inlinePreviewFontUrls(selectedCss, extensionUri);
    return {
      previewCss,
      katexCss: !portable ? rewriteKatexCssUrls(katexCss) : await inlineKatexFontUrls(
        katexCss, name => exportAssets.fontDataUri(resolveExtensionNodeModulesUri(extensionUri, 'katex', 'dist', 'fonts', name).fsPath),
      ), mermaidScript,
      previewThemeRuntimeScript, previewCoreRuntimeScript, modeRuntimeScript, themeCss, visualizations,
    };
  };

  const source = stripReviewComments(portable?.markdown ?? document.getText());
  const allowRemoteResources = portable?.allowRemoteResources
    ?? vscode.workspace.getConfiguration('markdownAiStudio', document.uri).get<boolean>('allowRemoteResources', true);
  const renderer = createMarkdownRenderer({
    resolveImageSrc: (rawPath) => {
      if (/^data:image\//i.test(rawPath)) return rawPath;
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

    const presentationBody = await embedLocalHtmlImages(rendered.html, document);
    if (portable) validatePortableMediaResources(presentationBody, allowRemoteResources);
    const assets = await loadAssets(presentationBody, 'presentation', buildPreviewThemeCssArtifact(registry, rendered.themeSelection.themeName));
    const html = buildStandaloneHtml({
      mode: 'presentation',
      title: path.basename(document.fileName),
      body: presentationBody,
      ...assets,
      exportMode,
      hostThemeClass: exportMode === 'theme' ? getHostThemeClass() : '',
      allowRemoteResources,
      portable,
    });
    return options.assetMode === 'external' ? externalizeHtmlArtifact(html) : { html, assets: [] };
  }

  const exportMarkdown = getExportMarkdown(source);
  const body = await embedLocalHtmlImages(renderMarkdown(exportMarkdown), document);
  if (portable) validatePortableMediaResources(body, allowRemoteResources);
  const theme = resolveExportDocumentTheme(extensionUri, document, source, exportMode);
  const documentTableLayout = getDocumentTableLayout(document);

  const assets = await loadAssets(body, 'document', theme.documentThemeArtifact);
  const html = buildStandaloneHtml({
    mode: 'document',
    title: path.basename(document.fileName),
    body,
    ...assets,
    hostThemeClass: theme.hostThemeClass,
    bodyClass: theme.bodyClass,
    bodyAttributes: `${theme.bodyAttributes} data-preview-page-width="${documentTableLayout === 'wide' ? 'full' : 'readable'}" data-document-table-layout="${documentTableLayout}"`,
    exportMode,
    allowRemoteResources,
    portable,
  });
  return options.assetMode === 'external' ? externalizeHtmlArtifact(html) : { html, assets: [] };
}

export async function buildPortableReviewHtml(extensionUri: vscode.Uri, document: vscode.TextDocument): Promise<string> {
  const allowRemoteResources = vscode.workspace.getConfiguration('markdownAiStudio', document.uri).get<boolean>('allowRemoteResources', true);
  const markdown = await preparePortableMarkdown(document.getText(), source => {
    if (!allowRemoteResources && !/^(?:data:image\/|https?:)/iu.test(source)) {
      const uri = resolveDocumentResource(document, source);
      if (/^[/\\]{2}/u.test(source) || (uri?.scheme === 'file' && (uri.authority || /^[/\\]{2}/u.test(uri.fsPath)))) {
        throw new Error('Remote resources are disabled in settings.');
      }
    }
    return imageDataUri(document, source, allowRemoteResources);
  });
  const manifest = loadPreviewAssetManifest(extensionUri);
  const readAsset = (name: string) => {
    const descriptor = manifest.assets[name];
    if (!descriptor) throw new Error('Missing portable review asset: ' + name);
    return exportAssets.readText(previewAssetUri(extensionUri, descriptor).fsPath, descriptor.contentHash);
  };
  const [renderer, reviewUi, reviewCss, host, notices] = await Promise.all([
    readAsset('portableReviewRenderer'), readAsset('previewReviewRuntime'),
    readAsset('previewReviewStyle'), readAsset('portableReviewHostRuntime'), readAsset('portableReviewNotices'),
  ]);
  const name = path.parse(document.fileName).name;
  const artifact = await buildRenderedHtmlArtifact(extensionUri, document, { assetMode: 'inline' }, {
    markdown, mode: isMarkdownPresentationSource(markdown) ? 'presentation' : 'document',
    htmlName: `${name}.html`, markdownName: `${name}.md`,
    presentationThemes: loadPreviewThemeRegistryForDocument(extensionUri, document.uri),
    presentationTheme: getResolvedPresentationPreviewThemeSetting(document.uri),
    themeMode: getHostThemeClass() === 'vscode-dark' ? 'dark' : 'light',
    allowRemoteResources, renderer, reviewUi, reviewCss, host, notices,
  });
  return artifact.html;
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

  const html = await buildPortableReviewHtml(extensionUri, document);
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

  const notices = outputDocument.querySelector<HTMLTemplateElement>('template[data-ams-visualization-notices]');
  if (notices) {
    const asset = createHtmlAsset('visualizations-notices', 'txt', 'text/plain; charset=utf-8', notices.content.textContent ?? '');
    assets.push(asset);
    const link = outputDocument.createElement('link');
    link.rel = 'license';
    link.type = 'text/plain';
    link.href = asset.path;
    outputDocument.head.append(link);
    notices.remove();
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

function containsImages(html: string): boolean {
  return /<img\b/iu.test(html);
}

/** Resolve every rendered local image before export, including presentation media and HTML img tags. */
export async function embedLocalHtmlImages(html: string, document: vscode.TextDocument): Promise<string> {
  if (!containsImages(html)) return html;
  const dom = new JSDOM(html);
  const cache = new Map<string, Promise<string>>();
  try {
    for (const image of dom.window.document.querySelectorAll('img[src]')) {
      const source = image.getAttribute('src')!;
      if (/^(?:https?:|data:)/iu.test(source)) continue;
      let pending = cache.get(source);
      if (!pending) { pending = imageDataUri(document, source, false); cache.set(source, pending); }
      try {
        image.setAttribute('src', await pending);
        image.removeAttribute('data-source-src');
      } catch (error) {
        throw new Error('Cannot export portable HTML: could not embed image "' + source + '". ' + (error instanceof Error ? error.message : String(error)));
      }
    }
    return dom.window.document.body.innerHTML;
  } finally { dom.window.close(); }
}

function containsMath(html: string): boolean {
  return /class="[^"]*\bkatex\b/u.test(html);
}

function rewriteKatexCssUrls(css: string): string {
  return css.replace(/url\((?:\.\/)?fonts\//gu, 'url(https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/fonts/');
}

async function inlinePreviewFontUrls(css: string, extensionUri: vscode.Uri): Promise<string> {
  const names = [...new Set([...css.matchAll(/url\(['"]?\.\.\/fonts\/([^'"\)]+)['"]?\)/gu)].map((match) => match[1]))];
  const fonts = await Promise.all(names.map(async (name) => [
    name, await exportAssets.fontDataUri(resolveExtensionAssetUri(extensionUri, 'preview', 'fonts', name).fsPath),
  ] as const));
  let output = css;
  for (const [name, dataUri] of fonts) output = output.replaceAll(`../fonts/${name}`, dataUri);
  return output;
}

function getExportMarkdown(source: string): string {
  return stripMarkdownFrontMatter(source);
}

function getDocumentTableLayout(document: vscode.TextDocument): 'wide' | 'wrap' {
  const configured = vscode.workspace.getConfiguration('markdownAiStudio', document.uri).get<string>('documentTableLayout', 'wide');
  return configured === 'wrap' ? 'wrap' : 'wide';
}

type StandaloneHtmlInput = {
  title: string;
  body: string;
  previewCss: string;
  katexCss: string;
  mermaidScript: string;
  previewThemeRuntimeScript: string;
  previewCoreRuntimeScript: string;
  modeRuntimeScript: string;
  visualizations?: VisualizationExportAssets;
  themeCss: string;
  hostThemeClass: string;
  exportMode: ExportMode;
  allowRemoteResources: boolean;
  portable?: PortableShellOptions;
} & (
  | { mode: 'document'; bodyClass: string; bodyAttributes: string }
  | { mode: 'presentation' }
);

function buildStandaloneHtml(input: StandaloneHtmlInput): string {
  const fallback = input.mode === 'presentation' ? buildPresentationExportFallback(input.body, !!input.portable) : undefined;
  const bodyClass = input.mode === 'document'
    ? input.bodyClass
    : ['preview-mode-presentation', input.hostThemeClass].filter(Boolean).join(' ');
  const bodyAttributes = input.mode === 'document'
    ? ` data-md-preview-root data-preview-mode="document"${input.bodyAttributes}`
    : ' data-preview-mode="presentation" data-presentation-content-overflow="scaleToFit"';
  const portableHead = input.portable ? portableReviewHead(input.portable) : undefined;
  const script = (name: string, source: string) => input.portable
    ? `<script data-ams-export-asset="${name}" type="application/x-ams-runtime">\n${safeScript(source)}\n  </script>`
    : `<script data-ams-export-asset="${name}">\n${source}\n  </script>`;
  const bridge = input.portable ? '' : `<script>
${getStandalonePreviewBridgeScript()}
${input.mode === 'presentation' ? `document.addEventListener('md-slide-changed', () => {
  document.body.dataset.amsPresentationReady = 'true';
}, { once: true });` : ''}
  </script>`;
  return `<!DOCTYPE html>
<html lang="en" data-md-host-scheme="auto"${input.hostThemeClass ? ` class="${escapeHtml(input.hostThemeClass)}"` : ''}>
<head>
  ${portableHead?.policy ?? ''}
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(input.title)}</title>
  <style data-ams-export-asset="styles">
${input.previewCss}
  </style>
  ${input.katexCss ? `<style data-ams-export-asset="styles">
${input.katexCss}
  </style>` : ''}
  ${input.themeCss || input.mode === 'presentation' ? `<style data-ams-export-asset="styles">
${input.themeCss}
  </style>` : ''}
  <style data-ams-export-asset="styles">
${getExportThemeCss()}
  </style>
  ${fallback ? `<style data-ams-export-asset="styles">
${fallback.css}
  </style>` : ''}
  ${input.exportMode !== 'theme' ? `<style data-ams-export-asset="styles">
${getPrinterFriendlyExportCss(input.exportMode)}
  </style>` : ''}
  ${input.mode === 'document' ? `<style data-ams-export-asset="styles">
${getExportScrollCss()}
  </style>` : ''}
  ${portableHead?.style ?? ''}
</head>
<body class="${escapeHtml(bodyClass)}"${bodyAttributes} data-md-chart-remote-images="${input.allowRemoteResources}">
  ${fallback ? fallback.body : `<main class="markdown-body">${input.body}</main>`}
  ${bridge}
  ${input.mermaidScript ? script('mermaid', input.mermaidScript) : ''}
  ${script('preview-theme-runtime', input.previewThemeRuntimeScript)}
  ${script('preview-core-runtime', input.previewCoreRuntimeScript)}
  ${script(`preview-${input.mode}-runtime`, input.modeRuntimeScript)}
  ${visualizationExportHtml(input.visualizations, script)}
  ${input.portable ? portableReviewBody(input.portable, escapeHtml) : ''}
</body>
</html>`;
}

function buildPresentationExportFallback(body: string, portable: boolean): { body: string; css: string } {
  const dom = new JSDOM(body);
  const document = dom.window.document;
  if (portable) document.querySelectorAll('script:not([data-ams-export-asset])').forEach(script => script.remove());
  const stage = document.querySelector<HTMLElement>('.presentation-preview > .presentation-stage');
  if (!stage) {
    throw new Error('Cannot build presentation HTML without a slide stage.');
  }
  const slides = [...stage.querySelectorAll<HTMLElement>(':scope > .presentation-slide')];
  if (!slides.length) {
    throw new Error('Cannot build presentation HTML without slides.');
  }

  const navigation = document.createElement('form');
  navigation.className = 'presentation-export-fallback';
  navigation.setAttribute('aria-label', 'Slide navigation, limited view');
  const heading = document.createElement('span');
  heading.textContent = 'Limited view: select a slide';
  navigation.append(heading);
  for (const [index, slide] of slides.entries()) {
    slide.dataset.slideIndex = String(index);
    slide.removeAttribute('aria-hidden');
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'ams-export-slide';
    radio.value = String(index);
    if (index === 0) radio.setAttribute('checked', '');
    radio.setAttribute('aria-label', `Slide ${index + 1}: ${slide.dataset.slideTitle || `Slide ${index + 1}`}`);
    const number = document.createElement('span');
    number.textContent = String(index + 1);
    number.setAttribute('aria-hidden', 'true');
    label.append(radio, number);
    navigation.append(label);
  }
  stage.after(navigation);

  const fallback = 'body.preview-mode-presentation:not([data-ams-presentation-ready])';
  const selectionCss = slides.map((_, index) => {
    const selected = `${fallback} .presentation-preview:has(> .presentation-export-fallback input[value="${index}"]:checked) > .presentation-stage > .presentation-slide`;
    return `${selected} { display: none; }\n${selected}[data-slide-index="${index}"] { display: block; }`;
  }).join('\n');
  const css = `
.presentation-export-fallback { display: none; }
${fallback} .presentation-header-controls,
${fallback} .presentation-bottom-bar { display: none; }
${fallback} .presentation-export-fallback {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: auto;
  color: var(--vscode-editor-foreground);
}
${fallback} .presentation-export-fallback > span { flex: none; }
${fallback} .presentation-export-fallback label { flex: none; cursor: pointer; }
${fallback} .presentation-export-fallback input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
${fallback} .presentation-export-fallback label span {
  display: block;
  padding: 4px 10px;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
}
${fallback} .presentation-export-fallback input:checked + span {
  background: var(--presentation-accent);
  color: var(--presentation-contrast);
}
${fallback} .presentation-export-fallback input:focus-visible + span {
  outline: 2px solid var(--vscode-focusBorder);
  outline-offset: 2px;
}
${fallback} .presentation-stage { container-type: size; }
${selectionCss}
${fallback} .presentation-frame.presentation-ratio-16-9 { width: min(100cqw, 177.7777778cqh); }
${fallback} .presentation-frame.presentation-ratio-4-3 { width: min(100cqw, 133.3333333cqh); }
${fallback} .presentation-frame .presentation-canvas {
  width: 1280px;
  height: 720px;
  transform: scale(min(calc(100cqw / 1280px), calc(100cqh / 720px)));
}
${fallback} .presentation-frame.presentation-ratio-4-3 .presentation-canvas {
  height: 960px;
  transform: scale(min(calc(100cqw / 1280px), calc(100cqh / 960px)));
}
`;
  const renderedBody = document.body.innerHTML;
  dom.window.close();
  return { body: renderedBody, css };
}

function visualizationExportHtml(assets: VisualizationExportAssets | undefined, script: (name: string, source: string) => string): string {
  if (!assets) return '';
  // Keep the complete distribution notices inert and portable in a single file.
  // Website exports extract this template into one fingerprinted license asset.
  return `<template data-ams-visualization-notices>${escapeHtml(assets.notices)}</template>
  ${script('preview-visualizations-runtime', safeScript(assets.runtime))}`;
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
body.preview-mode-document.mermaid-lightbox-open {
  overflow: hidden;
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

body.preview-mode-presentation .md-visualization {
  color: #24292f !important;
  border-color: #d0d7de !important;
  --presentation-accent: #0969da;
  --presentation-accent-soft: #0969da;
  --presentation-muted-color: #57606a;
  --presentation-panel-bg: #ffffff;
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

function resolveExportDocumentTheme(
  extensionUri: vscode.Uri,
  document: vscode.TextDocument,
  source: string,
  exportMode: ExportMode,
): {
  hostThemeClass: string;
  bodyClass: string;
  bodyAttributes: string;
  documentThemeArtifact?: ThemeCssArtifact;
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
      documentThemeArtifact: buildDocumentThemeCssArtifact(documentThemeRegistry, selection.themeName),
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
