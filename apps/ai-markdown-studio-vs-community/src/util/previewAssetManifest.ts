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

export type PreviewAssetManifest = {
  readonly schemaVersion: 1;
  readonly assetSetHash: string;
  readonly assets: Readonly<Record<string, PreviewAssetDescriptor>>;
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
  if (parsed.schemaVersion !== 1 || !parsed.assetSetHash || !parsed.assets || !parsed.themes?.document || !parsed.themes?.presentation) {
    throw new Error('The shared preview asset manifest is invalid. Rebuild the extension assets.');
  }
  return parsed;
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
