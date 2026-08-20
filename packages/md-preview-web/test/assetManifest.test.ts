import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('generated asset manifest', () => {
  const assetsRoot = path.resolve(__dirname, '..', 'assets');
  const manifest = JSON.parse(fs.readFileSync(path.join(assetsRoot, 'generated', 'asset-manifest.json'), 'utf8'));

  it('declares deterministic content hashes for every generated file', () => {
    const descriptors = [
      ...Object.values(manifest.assets),
      ...Object.values(manifest.themes.document),
      ...Object.values(manifest.themes.presentation),
    ] as Array<{ path: string; contentHash: string; bytes: number }>;

    for (const descriptor of descriptors) {
      const bytes = fs.readFileSync(path.join(assetsRoot, ...descriptor.path.split('/')));
      expect(bytes.byteLength).toBe(descriptor.bytes);
      expect(createHash('sha256').update(bytes).digest('base64url').slice(0, 18)).toBe(descriptor.contentHash);
      expect(path.basename(descriptor.path)).toContain(`.${descriptor.contentHash}.`);
    }
    expect(new Set(descriptors.map((descriptor) => descriptor.path)).size).toBe(descriptors.length);
  });

  it('derives the asset-set hash from logical descriptors, independent of documents or workspaces', () => {
    const expected = createHash('sha256')
      .update(JSON.stringify({ assets: manifest.assets, themes: manifest.themes }))
      .digest('base64url')
      .slice(0, 18);
    expect(manifest.assetSetHash).toBe(expected);
  });

  it('keeps the shared Markdown primitives in the presentation stylesheet', () => {
    const presentation = manifest.assets.previewPresentation as { path: string };
    const stylesheet = fs
      .readFileSync(path.join(assetsRoot, ...presentation.path.split('/')), 'utf8')
      .replace(/\r\n/g, '\n');

    expect(stylesheet).toContain(`table {
  width: max-content;`);
    expect(stylesheet).toContain(`th,
td {
  padding: 12px 16px;`);
    expect(stylesheet).toContain('.presentation-slide-body table {');
  });
});
