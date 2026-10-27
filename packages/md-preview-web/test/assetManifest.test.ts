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
      .update(JSON.stringify({ assets: manifest.assets, themes: manifest.themes, stylesheets: manifest.stylesheets }))
      .digest('base64url')
      .slice(0, 18);
    expect(manifest.assetSetHash).toBe(expected);
  });

  it('ships the Community license and chart library notices for portable redistribution', () => {
    const notices = fs.readFileSync(path.join(assetsRoot, manifest.assets.previewVisualizationsNotices.path), 'utf8');
    const license = fs.readFileSync(path.resolve(__dirname, '../../../LICENSE'), 'utf8');
    expect(notices).toContain(license);
    for (const name of ['vega', 'vega-lite', 'vega-interpreter']) expect(notices).toContain(name + '@');
  });

  it('keeps shared Markdown primitives before presentation overrides', () => {
    const stylesheet = manifest.stylesheets.presentation
      .filter((entry: { feature?: string }) => !entry.feature)
      .map((entry: { asset: string }) => fs.readFileSync(path.join(assetsRoot, manifest.assets[entry.asset].path), 'utf8'))
      .join('\n').replace(/\s+/gu, '');

    expect(stylesheet).toContain('table{width:max-content;');
    expect(stylesheet).toContain('th,td{padding:12px16px;');
    expect(stylesheet).toContain('.presentation-slide-bodytable{');
    expect(stylesheet.indexOf('table{width:max-content;')).toBeLessThan(stylesheet.indexOf('.presentation-slide-bodytable{'));
  });
  it('builds the combined fallback stylesheet from the source modules in order', () => {
    const stylesRoot = path.resolve(assetsRoot, '..', 'styles');
    const plan = JSON.parse(fs.readFileSync(path.join(stylesRoot, 'modules.json'), 'utf8'));
    const combined = plan.modules.map((module: { file: string }) => fs.readFileSync(path.join(stylesRoot, module.file), 'utf8')).join('\n');
    expect(fs.readFileSync(path.join(assetsRoot, 'preview.css'), 'utf8')).toBe(combined);
    expect(fs.readdirSync(stylesRoot).filter(name => name.endsWith('.css')).sort()).toEqual(plan.modules.map((module: { file: string }) => module.file).sort());
    for (const mode of ['document', 'presentation']) {
      expect(manifest.stylesheets[mode]).toEqual(plan.modules.filter((module: { modes: string[] }) => module.modes.includes(mode)).map((module: { asset: string; feature?: string }) => ({ asset: module.asset, ...(module.feature ? { feature: module.feature } : {}) })));
    }
  });

  it.each(['document', 'presentation'])('includes each %s CSS module once and isolates mode-specific styles', mode => {
    const modules = manifest.stylesheets[mode].map((entry: { asset: string }) => entry.asset);
    expect(new Set(modules).size).toBe(modules.length);
    expect(modules).toContain('previewTables');
    expect(modules).toContain('previewSyntax');
    if (mode === 'presentation') {
      expect(modules).not.toContain('previewDocument');
      expect(modules).not.toContain('previewDocumentSyntax');
    } else {
      expect(modules.some((name: string) => name.startsWith('previewPresentation'))).toBe(false);
    }
    const css = modules.map((name: string) => fs.readFileSync(path.join(assetsRoot, manifest.assets[name].path), 'utf8')).join('\n');
    expect(css.match(/\.mermaid-lightbox\s*\{/gu)).toHaveLength(1);
  });

});
