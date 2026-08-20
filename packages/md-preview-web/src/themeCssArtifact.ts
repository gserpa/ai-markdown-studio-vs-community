export type ThemeCssArtifact = {
  family: 'document' | 'presentation';
  themeName: string;
  themeClassName: string;
  css: string;
  contentHash: string;
  fileName: string;
};

/** A deterministic, browser-safe content fingerprint for generated CSS descriptors. */
export function stableCssHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(36).padStart(13, '0').slice(0, 13);
}

export function indentCss(value: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return value.split('\n').map((line) => `${prefix}${line}`).join('\n');
}
