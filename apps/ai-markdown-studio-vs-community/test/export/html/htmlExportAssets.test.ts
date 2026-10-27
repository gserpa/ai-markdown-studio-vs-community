import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile, stat } from 'node:fs/promises';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn(), stat: vi.fn() }));
import { HtmlExportAssetCache, selectReferencedPreviewFonts } from '../../../src/export/html/htmlExportAssets';

const faces = ['Inter', 'Fraunces', 'JetBrains Mono'].map(family =>
  [400, 700].map(weight => `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url('../fonts/${family}-${weight}.woff2'); }`).join('\n'),
).join('\n');

describe('export font selection', () => {
  it('removes unused bundled families from system-font themes', () => {
    const css = selectReferencedPreviewFonts(faces + 'body{font-family:system-ui}', 'body{--md-preview-body-font:Arial,sans-serif}');
    expect(css).not.toContain('@font-face');
    expect(css).toContain('body{font-family:system-ui}');
  });

  it('keeps all weights of referenced families, including auto theme alternatives and chart fonts', () => {
    const css = selectReferencedPreviewFonts(faces, `body { --md-preview-body-font: inter, sans-serif; } @media(prefers-color-scheme:dark){body{--md-preview-heading-font:'Fraunces'}} <code>{"font":"JetBrains Mono"}</code>`);
    expect(css.match(/@font-face/gu)).toHaveLength(6);
  });

  it('does not embed unused fonts because code contains backslashes', () => {
    expect(selectReferencedPreviewFonts(faces, 'body{font-family:system-ui}', String.raw`<code>C:\docs\file.md</code>`)).not.toContain('@font-face');
  });

  it('recognizes escaped font names in chart JSON', () => {
    expect(selectReferencedPreviewFonts(faces, '', String.raw`<code>{"font":"\u0049nter"}</code>`).match(/@font-face/gu)).toHaveLength(2);
  });

  it('does not mistake substrings or comments for a font family', () => {
    const css = selectReferencedPreviewFonts(faces, '/* Inter */ body{font-family:Interstate, sans-serif}');
    expect(css).not.toContain('@font-face');
  });

  it('keeps a selected family without embedding unrelated families', () => {
    const css = selectReferencedPreviewFonts(faces, 'body{--md-preview-body-font:"Inter",Arial}');
    expect(css.match(/@font-face/gu)).toHaveLength(2);
    expect(css).not.toContain('Fraunces');
    expect(css).not.toContain('JetBrains Mono');
  });

  it('retains fonts conservatively when custom CSS uses escaped family names', () => {
    expect(selectReferencedPreviewFonts(faces, String.raw`body{font-family:\49 nter}`)).toBe(faces);
  });
});

describe('export asset caching', () => {
  beforeEach(() => {
    vi.mocked(readFile).mockReset().mockResolvedValue('asset');
    vi.mocked(stat).mockReset().mockResolvedValue({ size: 10, mtimeMs: 1, ctimeMs: 1 } as never);
  });

  it('shares concurrent immutable reads and invalidates when the content hash changes', async () => {
    const cache = new HtmlExportAssetCache();
    expect(await Promise.all([cache.readText('core.css', 'v1'), cache.readText('core.css', 'v1')])).toEqual(['asset', 'asset']);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(stat).not.toHaveBeenCalled();
    vi.mocked(readFile).mockResolvedValueOnce('updated');
    expect(await cache.readText('core.css', 'v2')).toBe('updated');
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('isolates extension roots and bounds retained assets', async () => {
    const cache = new HtmlExportAssetCache(2);
    await cache.readText('a/core.css', 'same');
    await cache.readText('b/core.css', 'same');
    await cache.readText('c/core.css', 'same');
    await cache.readText('a/core.css', 'same');
    expect(readFile).toHaveBeenCalledTimes(4);
  });

  it('does not cache a failed read', async () => {
    const cache = new HtmlExportAssetCache();
    vi.mocked(readFile).mockRejectedValueOnce(new Error('temporarily unavailable'));
    await expect(cache.readText('core.css', 'v1')).rejects.toThrow('temporarily unavailable');
    expect(await cache.readText('core.css', 'v1')).toBe('asset');
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('refreshes non-fingerprinted vendor assets when their metadata changes', async () => {
    const cache = new HtmlExportAssetCache();
    await cache.readText('mermaid.min.js');
    await cache.readText('mermaid.min.js');
    expect(readFile).toHaveBeenCalledTimes(1);
    vi.mocked(stat).mockResolvedValueOnce({ size: 10, mtimeMs: 2, ctimeMs: 2 } as never);
    vi.mocked(readFile).mockResolvedValueOnce('new runtime');
    expect(await cache.readText('mermaid.min.js')).toBe('new runtime');
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('reuses encoded fonts and refreshes an updated font', async () => {
    const cache = new HtmlExportAssetCache();
    vi.mocked(readFile).mockResolvedValue(Buffer.from('font'));
    expect(await Promise.all([cache.fontDataUri('inter.woff2'), cache.fontDataUri('inter.woff2')])).toEqual([
      'data:font/woff2;base64,Zm9udA==', 'data:font/woff2;base64,Zm9udA==',
    ]);
    expect(readFile).toHaveBeenCalledTimes(1);
    vi.mocked(stat).mockResolvedValueOnce({ size: 10, mtimeMs: 2, ctimeMs: 2 } as never);
    vi.mocked(readFile).mockResolvedValueOnce(Buffer.from('updated'));
    expect(await cache.fontDataUri('inter.woff2')).toBe('data:font/woff2;base64,dXBkYXRlZA==');
    expect(readFile).toHaveBeenCalledTimes(2);
  });
});
