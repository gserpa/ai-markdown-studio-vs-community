import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const yauzl = require('yauzl');
const files = new Map();
const generated = 'extension/assets/preview/generated/';
const required = [
  'extension/skills/markdown-ai-studio-presentation/references/visualizations.md',
  'extension/skills/markdown-ai-studio-presentation-copilot/references/visualizations.md',
];
await new Promise((resolve, reject) => {
  yauzl.open(path.resolve(process.argv[2]), { lazyEntries: true }, (error, zip) => {
    if (error || !zip) return reject(error ?? new Error('Could not open package.'));
    zip.on('error', reject);
    zip.on('entry', entry => {
      if (!entry.fileName.startsWith(generated) && !required.includes(entry.fileName)) { zip.readEntry(); return; }
      zip.openReadStream(entry, (streamError, stream) => {
        if (streamError || !stream) { zip.close(); reject(streamError ?? new Error('Could not read package entry.')); return; }
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => { files.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); });
      });
    });
    zip.on('end', resolve);
    zip.readEntry();
  });
});

const manifest = JSON.parse(files.get(generated + 'asset-manifest.json')?.toString('utf8') ?? 'null');
assert.equal(manifest?.schemaVersion, 2, 'Missing or invalid packaged preview manifest.');
for (const name of ['previewCore', 'previewCoreRuntime', 'previewDocument', 'previewDocumentRuntime', 'previewPresentation', 'previewPresentationRuntime', 'previewThemeRuntime', 'previewVisualizationsRuntime', 'previewVisualizationsNotices']) {
  assert(manifest.assets[name], `Missing preview asset declaration: ${name}`);
}
for (const mode of ['document', 'presentation']) {
  const modules = manifest.stylesheets[mode];
  assert(modules?.length && new Set(modules.map(entry => entry.asset)).size === modules.length, 'Invalid packaged stylesheet plan: ' + mode);
  for (const entry of modules) assert(manifest.assets[entry.asset]?.mediaType.startsWith('text/css'), 'Missing packaged CSS module: ' + entry.asset);
}
const descriptors = [...Object.values(manifest.assets), ...Object.values(manifest.themes.document), ...Object.values(manifest.themes.presentation)];
for (const asset of descriptors) {
  assert(!asset.path.split('/').some(segment => !segment || segment === '.' || segment === '..'), 'Unsafe preview asset path.');
  const bytes = files.get('extension/assets/preview/' + asset.path);
  assert(bytes, `Missing packaged asset: ${asset.path}`);
  assert.equal(bytes.length, asset.bytes, `Incorrect packaged asset length: ${asset.path}`);
  assert.equal(createHash('sha256').update(bytes).digest('base64url').slice(0, 18), asset.contentHash, `Incorrect packaged asset hash: ${asset.path}`);
}
const hash = createHash('sha256').update(JSON.stringify({ assets: manifest.assets, themes: manifest.themes, stylesheets: manifest.stylesheets })).digest('base64url').slice(0, 18);
assert.equal(hash, manifest.assetSetHash, 'Incorrect packaged preview asset-set hash.');
const notices = files.get('extension/assets/preview/' + manifest.assets.previewVisualizationsNotices.path).toString('utf8');
for (const text of ['Markdown AI Studio Community', 'MIT License', 'vega@', 'vega-lite@', 'vega-interpreter@']) assert(notices.includes(text), `Missing chart notice: ${text}`);
for (const entry of required) {
  const reference = files.get(entry)?.toString('utf8');
  assert(reference?.includes('```vega-lite') && reference.includes('```metric'), `Missing packaged visualization authoring reference: ${entry}`);
}
console.log(`Packaged preview check passed: ${descriptors.length} fingerprinted assets and both authoring references.`);
