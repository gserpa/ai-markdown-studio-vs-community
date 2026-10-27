import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { build, transformSync } from 'esbuild';

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

const stylesRoot = path.join(packageRoot, 'styles');
const stylePlan = JSON.parse(readFileSync(path.join(stylesRoot, 'modules.json'), 'utf8'));
assert.equal(stylePlan.schemaVersion, 1, 'Invalid stylesheet source plan.');
const assets = {};
const stylesheets = { document: [], presentation: [] };
const sources = [];
const names = new Set();
const sourceFiles = new Set();
for (const module of stylePlan.modules) {
  assert(!names.has(module.asset), 'Duplicate stylesheet module: ' + module.asset);
  assert(!sourceFiles.has(module.file), 'Duplicate stylesheet source: ' + module.file);
  assert(/^[a-z][a-z0-9-]*\.css$/u.test(module.file), 'Unsafe stylesheet source: ' + module.file);
  assert(module.modes.length && module.modes.every(mode => mode === 'document' || mode === 'presentation'), 'Invalid stylesheet modes.');
  assert(module.feature === undefined || module.feature === 'media', 'Invalid stylesheet feature.');
  names.add(module.asset);
  sourceFiles.add(module.file);
  const source = readFileSync(path.join(stylesRoot, module.file), 'utf8');
  sources.push(source);
  assets[module.asset] = writeTextAsset(module.asset.replace(/[A-Z]/g, character => '-' + character.toLowerCase()) + '.css', rewriteGeneratedFontUrls(source), 'text/css; charset=utf-8');
  for (const mode of module.modes) stylesheets[mode].push({ asset: module.asset, ...(module.feature ? { feature: module.feature } : {}) });
}
// Preserve a combined stylesheet for hosts which have not adopted the module manifest.
writeFileSync(path.join(assetsRoot, 'preview.css'), sources.join('\n'), 'utf8');

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

const visualizations = await build({
  absWorkingDir: packageRoot,
  entryPoints: ['src/visualizations/browser.mts'],
  bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2022',
  write: false, metafile: true, legalComments: 'eof', outfile: 'visualizations.js',
});
assert(Object.values(visualizations.metafile.outputs).every(output => output.imports.every(entry => !entry.external)), 'Visualization assets must bundle every import locally.');
assets.previewVisualizationsRuntime = writeTextAsset('preview-visualizations-runtime.js', visualizations.outputFiles[0].text, 'text/javascript; charset=utf-8');

// Ship complete license texts for the packages actually included in the bundle.
const bundledDirectories = [...new Set(Object.keys(visualizations.metafile.inputs).flatMap(input => {
  const match = [...input.matchAll(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/gu)].at(-1);
  return match ? [input.slice(0, match.index + match[0].length)] : [];
}))].sort();
const notices = bundledDirectories.map(directory => {
  const dependencyRoot = path.resolve(packageRoot, directory);
  const dependency = JSON.parse(readFileSync(path.join(dependencyRoot, 'package.json'), 'utf8'));
  const licenses = readdirSync(dependencyRoot).filter(name => /^(?:licen[cs]e|copying|notice)(?:\.|$)/iu.test(name)).sort();
  assert(licenses.length, `Missing bundled license: ${dependency.name}`);
  return `${dependency.name}@${dependency.version} (${dependency.license})\n${licenses.map(name => readFileSync(path.join(dependencyRoot, name), 'utf8')).join('\n')}`;
});
assets.previewVisualizationsNotices = writeTextAsset('preview-visualizations-notices.txt', [
  `Markdown AI Studio Community\n${readFileSync(path.resolve(packageRoot, '../../LICENSE'), 'utf8')}`,
  ...notices,
].join('\n\n' + '='.repeat(72) + '\n\n') + '\n', 'text/plain; charset=utf-8');

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
  schemaVersion: 2,
  assetSetHash: contentHash(JSON.stringify({ assets, themes, stylesheets })),
  assets,
  themes,
  stylesheets,
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
  if (mediaType.startsWith('text/css')) {
    // Whitespace-only minification preserves cascade order, fallbacks, and custom properties.
    source = transformSync(source, { loader: 'css', minifyWhitespace: true, minifySyntax: false, minifyIdentifiers: false, charset: 'utf8', legalComments: 'inline' }).code;
  }
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

function rewriteGeneratedFontUrls(source) {
  return source.replaceAll("url('./fonts/", "url('../fonts/");
}
