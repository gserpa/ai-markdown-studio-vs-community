import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

const REQUIRED_ASSET_SEGMENTS = ['assets', 'preview', 'preview.css'];

export function getExtensionSupportRootUri(extensionUri: vscode.Uri): vscode.Uri {
  if (isExtensionSupportRoot(extensionUri.fsPath)) {
    return extensionUri;
  }

  let candidate = extensionUri;
  for (let index = 0; index < 3; index += 1) {
    candidate = vscode.Uri.joinPath(candidate, '..');
    if (isExtensionSupportRoot(candidate.fsPath)) {
      return candidate;
    }
  }

  return extensionUri;
}

export function resolveExtensionAssetUri(extensionUri: vscode.Uri, ...segments: string[]): vscode.Uri {
  return vscode.Uri.joinPath(getExtensionSupportRootUri(extensionUri), 'assets', ...segments);
}

export function resolveExtensionNodeModulesUri(extensionUri: vscode.Uri, ...segments: string[]): vscode.Uri {
  return vscode.Uri.joinPath(getExtensionSupportRootUri(extensionUri), 'node_modules', ...segments);
}

export function resolveRealPackageUri(extensionUri: vscode.Uri, ...segments: string[]): vscode.Uri {
  const packageUri = resolveExtensionNodeModulesUri(extensionUri, ...segments);
  try {
    return vscode.Uri.file(fs.realpathSync(packageUri.fsPath));
  } catch {
    return packageUri;
  }
}

function isExtensionSupportRoot(rootPath: string): boolean {
  return fs.existsSync(path.join(rootPath, ...REQUIRED_ASSET_SEGMENTS))
    && fs.existsSync(path.join(rootPath, 'node_modules'));
}