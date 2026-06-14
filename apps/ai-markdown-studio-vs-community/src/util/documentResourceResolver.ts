import * as path from 'path';
import * as vscode from 'vscode';

export function resolveDocumentResource(
  document: vscode.TextDocument,
  rawPath: string,
  options: { resolveFragmentToDocument?: boolean } = {},
): vscode.Uri | undefined {
  if (!rawPath) {
    return undefined;
  }

  if (rawPath.startsWith('#')) {
    return options.resolveFragmentToDocument
      ? document.uri.with({ fragment: rawPath.slice(1) })
      : vscode.Uri.parse(rawPath);
  }

  if (/^(https?:|file:)/i.test(rawPath)) {
    return vscode.Uri.parse(rawPath);
  }

  const [pathPart, fragment] = splitFragment(rawPath);
  const decodedPathPart = decodeUriPathSafely(pathPart);

  if (decodedPathPart.startsWith('/')) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (workspaceFolder) {
      return vscode.Uri.joinPath(workspaceFolder.uri, decodedPathPart.replace(/^[/\\]+/u, '')).with({ fragment });
    }
  }

  if (path.isAbsolute(decodedPathPart)) {
    return vscode.Uri.file(decodedPathPart).with({ fragment });
  }

  const baseDir = vscode.Uri.file(path.dirname(document.uri.fsPath));
  return vscode.Uri.joinPath(baseDir, decodedPathPart).with({ fragment });
}

export function splitFragment(rawPath: string): [string, string] {
  const fragmentIndex = rawPath.indexOf('#');
  if (fragmentIndex < 0) {
    return [rawPath, ''];
  }

  return [rawPath.slice(0, fragmentIndex), rawPath.slice(fragmentIndex + 1)];
}

function decodeUriPathSafely(pathPart: string): string {
  try {
    return decodeURIComponent(pathPart);
  } catch {
    return pathPart;
  }
}
