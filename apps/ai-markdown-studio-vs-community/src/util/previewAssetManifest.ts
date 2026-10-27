import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ThemeCssArtifact } from '@mfo/preview-web';
import { resolveExtensionAssetUri } from './extensionSupportRoot';

export type PreviewAssetDescriptor = {
  readonly path: string;
  readonly mediaType: string;
  readonly contentHash: string;
  readonly bytes: number;
};

type PreviewThemeAssetDescriptor = PreviewAssetDescriptor & {
  readonly themeName: string;
  readonly themeClassName: string;
  readonly sourceHash: string;
};

export type PreviewStylesheetReference = {
  readonly asset: string;
  readonly feature?: 'media';
};

export type PreviewAssetManifest = {
  readonly schemaVersion: 2;
  readonly assetSetHash: string;
  readonly assets: Readonly<Record<string, PreviewAssetDescriptor>>;
  readonly stylesheets: Readonly<Record<'document' | 'presentation', readonly PreviewStylesheetReference[]>>;
  readonly themes: {
    readonly document: Readonly<Record<string, PreviewThemeAssetDescriptor>>;
    readonly presentation: Readonly<Record<string, PreviewThemeAssetDescriptor>>;
  };
};

export function loadPreviewAssetManifest(extensionUri: vscode.Uri): PreviewAssetManifest {
  const uri = resolveExtensionAssetUri(extensionUri, 'preview', 'generated', 'asset-manifest.json');
  const manifestPath = fs.existsSync(uri.fsPath)
    ? uri.fsPath
    : path.resolve(process.cwd(), 'assets', 'preview', 'generated', 'asset-manifest.json');
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PreviewAssetManifest;
  if (parsed.schemaVersion !== 2 || !parsed.assetSetHash || !parsed.assets || !parsed.themes?.document || !parsed.themes?.presentation) {
    throw new Error('The shared preview asset manifest is invalid. Rebuild the extension assets.');
  }
  for (const mode of ['document', 'presentation'] as const) {
    const references = parsed.stylesheets?.[mode];
    if (!Array.isArray(references) || !references.length) throw new Error('The shared preview stylesheet plan is missing. Rebuild the extension assets.');
    const names = new Set<string>();
    for (const reference of references) {
      if (!reference || names.has(reference.asset) || !parsed.assets[reference.asset]?.mediaType.startsWith('text/css') || (reference.feature !== undefined && reference.feature !== 'media')) {
        throw new Error('The shared preview stylesheet plan is invalid. Rebuild the extension assets.');
      }
      names.add(reference.asset);
    }
  }
  return parsed;
}

/** Preview and export use this same ordered list; each selected module occurs once. */
export function selectPreviewStylesheetAssets(
  manifest: PreviewAssetManifest,
  mode: 'document' | 'presentation',
  hasMedia: boolean,
): readonly PreviewAssetDescriptor[] {
  return manifest.stylesheets[mode]
    .filter(reference => reference.feature !== 'media' || hasMedia)
    .map(reference => manifest.assets[reference.asset]);
}

export function previewAssetUri(extensionUri: vscode.Uri, descriptor: PreviewAssetDescriptor): vscode.Uri {
  const safeSegments = descriptor.path.split('/');
  if (safeSegments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe preview asset path: ${descriptor.path}`);
  }
  return resolveExtensionAssetUri(extensionUri, 'preview', ...safeSegments);
}

export function matchingThemeAsset(
  manifest: PreviewAssetManifest,
  artifact: ThemeCssArtifact,
): PreviewAssetDescriptor | undefined {
  const descriptor = manifest.themes[artifact.family][artifact.themeName];
  return descriptor?.sourceHash === artifact.contentHash ? descriptor : undefined;
}
