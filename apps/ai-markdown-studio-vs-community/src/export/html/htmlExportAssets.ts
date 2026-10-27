import { readFile, stat } from 'node:fs/promises';

/** Bounded, promise-sharing caches for immutable build assets and versioned local files. */
export class HtmlExportAssetCache {
  private readonly text = new Map<string, Promise<string>>();
  private readonly fonts = new Map<string, Promise<string>>();

  constructor(private readonly maxEntries = 48) {}

  async readText(filePath: string, contentHash?: string): Promise<string> {
    const version = contentHash ?? await this.fileVersion(filePath);
    return this.cached(this.text, JSON.stringify([filePath, version]), () => readFile(filePath, 'utf8'));
  }

  async fontDataUri(filePath: string): Promise<string> {
    const version = await this.fileVersion(filePath);
    return this.cached(this.fonts, JSON.stringify([filePath, version]), async () => {
      const bytes = await readFile(filePath);
      const mediaType = filePath.toLowerCase().endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
      return `data:${mediaType};base64,${bytes.toString('base64')}`;
    });
  }

  private async fileVersion(filePath: string): Promise<string> {
    const info = await stat(filePath);
    return `${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  }

  private cached(cache: Map<string, Promise<string>>, key: string, load: () => Promise<string>): Promise<string> {
    const existing = cache.get(key);
    if (existing) return existing;
    const pending = load();
    cache.set(key, pending);
    if (cache.size > this.maxEntries) cache.delete(cache.keys().next().value!);
    // Failed reads must be retryable; another entry may have replaced this one in the meantime.
    void pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
    return pending;
  }
}

/** Filter only the simple, generated bundled font-face blocks, retaining every weight of a referenced family. */
export function selectReferencedPreviewFonts(coreCss: string, context: string, content = ''): string {
  const fontFaces = /@font-face\s*\{[^{}]*\}/giu;
  const cssReferences = `${coreCss.replace(fontFaces, '')}\n${context}`.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\s+/gu, ' ').toLowerCase();
  // Escaped CSS family names cannot be safely inferred by this conservative filter.
  if (cssReferences.includes('\\')) return coreCss;
  // Decode JSON Unicode escapes so chart font settings count as references, too.
  // Ordinary code (for example Windows paths) must not disable font selection.
  const contentReferences = content.replace(/\\u([0-9a-f]{4})/giu, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  const references = `${cssReferences} ${contentReferences}`.replace(/\s+/gu, ' ').toLowerCase();
  return coreCss.replace(fontFaces, (face) => {
    const value = /font-family\s*:\s*([^;}]+)/iu.exec(face)?.[1].trim();
    if (!value) return face;
    const family = value.replace(/^(['"])(.*)\1$/u, '$2').toLowerCase();
    const escaped = family.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return new RegExp(`(^|[^a-z0-9_-])${escaped}(?![a-z0-9_-])`, 'u').test(references) ? face : '';
  });
}
