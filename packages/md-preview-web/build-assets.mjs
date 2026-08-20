import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildDocumentThemeCssArtifact,
  buildPreviewThemeCssArtifact,
  loadDocumentThemeRegistryFromDirectories,
  loadPreviewThemeRegistry,
} from './dist/index.js';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const assetsRoot = path.join(packageRoot, 'assets');
const outputRoot = path.join(assetsRoot, 'generated');

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const previewCss = readFileSync(path.join(assetsRoot, 'preview.css'), 'utf8');
const cssChunks = splitPreviewCss(previewCss);
const assets = {};

for (const [logicalName, source] of Object.entries(cssChunks)) {
  assets[logicalName] = writeTextAsset(`${logicalName.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}.css`, source, 'text/css; charset=utf-8');
}

assets.previewCoreRuntime = writeTextAsset(
  'preview-core-runtime.js',
  readFileSync(path.join(assetsRoot, 'preview.js'), 'utf8'),
  'text/javascript; charset=utf-8',
);
assets.previewDocumentRuntime = writeTextAsset(
  'preview-document-runtime.js',
  "window.__mfoPreviewModeRuntime?.startDocument();\n",
  'text/javascript; charset=utf-8',
);
assets.previewPresentationRuntime = writeTextAsset(
  'preview-presentation-runtime.js',
  "window.__mfoPreviewModeRuntime?.startPresentation();\n",
  'text/javascript; charset=utf-8',
);
assets.previewThemeRuntime = writeTextAsset(
  'preview-theme-runtime.js',
  readFileSync(path.join(assetsRoot, 'preview-theme-runtime.js'), 'utf8'),
  'text/javascript; charset=utf-8',
);

const documentRegistry = loadDocumentThemeRegistryFromDirectories([
  path.join(assetsRoot, 'themes', 'document'),
]);
const presentationRegistry = loadPreviewThemeRegistry(path.join(assetsRoot, 'themes', 'presentation'));
const themes = { document: {}, presentation: {} };

for (const name of ['auto', ...[...documentRegistry.themes.keys()].sort()]) {
  const artifact = buildDocumentThemeCssArtifact(documentRegistry, name);
  themes.document[name] = writeThemeAsset(artifact);
}
for (const name of ['auto', ...[...presentationRegistry.themes.keys()].sort()]) {
  const artifact = buildPreviewThemeCssArtifact(presentationRegistry, name);
  themes.presentation[name] = writeThemeAsset(artifact);
}

const manifest = {
  schemaVersion: 1,
  assetSetHash: contentHash(JSON.stringify({ assets, themes })),
  assets,
  themes,
};
writeFileSync(path.join(outputRoot, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

function writeThemeAsset(artifact) {
  const descriptor = writeTextAsset(artifact.fileName, artifact.css, 'text/css; charset=utf-8');
  return {
    ...descriptor,
    themeName: artifact.themeName,
    themeClassName: artifact.themeClassName,
    sourceHash: artifact.contentHash,
  };
}

function writeTextAsset(suggestedPath, source, mediaType) {
  const hash = contentHash(source);
  const extension = path.extname(suggestedPath);
  const stem = suggestedPath.slice(0, -extension.length).replace(/\.[a-z0-9_-]{8,}$/iu, '');
  const relativePath = `${stem}.${hash}${extension}`.split(path.sep).join('/');
  const outputPath = path.join(outputRoot, ...relativePath.split('/'));
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, source, 'utf8');
  return { path: `generated/${relativePath}`, mediaType, contentHash: hash, bytes: Buffer.byteLength(source) };
}

function contentHash(source) {
  return createHash('sha256').update(source).digest('base64url').slice(0, 18);
}

function splitPreviewCss(source) {
  const documentStart = requiredIndex(source, 'Document Preview: Base Layout + Content Primitives');
  const documentMarkerStart = source.lastIndexOf('/*', documentStart);
  const mermaidStart = requiredIndex(source, 'Document Preview: Mermaid + Lightbox');
  const mermaidMarkerStart = source.lastIndexOf('/*', mermaidStart);
  const wideTableStart = requiredIndex(source, '/* Wide table controls for document preview. */');
  const lightboxStart = requiredIndex(source, '.mermaid-lightbox {');
  const utilitiesStart = requiredIndex(source, 'Document Preview: Tables + Utilities');
  const utilitiesMarkerStart = source.lastIndexOf('/*', utilitiesStart);
  const presentationStart = requiredIndex(source, 'Presentation Preview');
  const presentationMarkerStart = source.lastIndexOf('/*', presentationStart);
  const compatibilityStart = requiredIndex(source, '/* Browser compatibility fallbacks for standalone exports');

  return {
    previewCore: rewriteGeneratedFontUrls([
      source.slice(0, documentMarkerStart),
    ].join('\n')),
    previewDocument: [
      source.slice(documentMarkerStart, mermaidMarkerStart),
      source.slice(wideTableStart, lightboxStart),
      source.slice(utilitiesMarkerStart, presentationMarkerStart),
      source.slice(compatibilityStart),
    ].join('\n'),
    previewMermaid: [
      source.slice(mermaidMarkerStart, wideTableStart),
      source.slice(lightboxStart, utilitiesMarkerStart),
    ].join('\n'),
    // Preserve the original single-stylesheet cascade: presentation overrides
    // depend on the generic Markdown, table, and typography primitives that
    // appear before them in preview.css.
    previewPresentation: [
      source.slice(documentMarkerStart, compatibilityStart),
      source.slice(compatibilityStart),
    ].join('\n'),
  };
}

function rewriteGeneratedFontUrls(source) {
  return source.replaceAll("url('./fonts/", "url('../fonts/");
}

function requiredIndex(source, marker) {
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`preview.css is missing required split marker: ${marker}`);
  return index;
}
