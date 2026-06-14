import * as path from 'path';
import * as vscode from 'vscode';

export async function ensureDirectory(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

export async function createUniqueUri(folderUri: vscode.Uri, requestedName: string): Promise<vscode.Uri> {
  const parsed = path.parse(requestedName);
  const base = parsed.name || 'generated';
  const extension = parsed.ext || '.md';

  let attempt = 0;
  while (true) {
    const name = attempt === 0 ? `${base}${extension}` : `${base} ${attempt + 1}${extension}`;
    const uri = vscode.Uri.joinPath(folderUri, name);
    try {
      await vscode.workspace.fs.stat(uri);
      attempt += 1;
    } catch {
      return uri;
    }
  }
}

export function getPrimaryWorkspaceFolder(): vscode.WorkspaceFolder {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('Open a workspace folder before saving Markdown files with this tool.');
  }
  return workspaceFolder;
}

export function isUriInsideWorkspace(uri: vscode.Uri): boolean {
  return vscode.workspace.workspaceFolders?.some((folder) => {
    const relative = path.relative(folder.uri.fsPath, uri.fsPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }) ?? false;
}

export async function readWorkspaceTextFile(rawUri: string | undefined, description: string): Promise<string> {
  if (!rawUri?.trim()) {
    return '';
  }

  const uri = vscode.Uri.parse(rawUri.trim());
  if (uri.scheme !== 'file' || !isUriInsideWorkspace(uri)) {
    throw new Error(`${description} URI must be a file inside the current workspace.`);
  }

  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString('utf8');
}

export function normalizeWorkspaceRelativeDirectory(rawDirectory: string | undefined): string[] {
  if (!rawDirectory?.trim() || rawDirectory.trim() === '.') {
    return [];
  }

  if (path.isAbsolute(rawDirectory)) {
    throw new Error('workspaceRelativeDirectory must be relative to the workspace folder.');
  }

  const segments = rawDirectory
    .split(/[\\/]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error('workspaceRelativeDirectory cannot contain . or .. path segments.');
  }

  return segments;
}

export function normalizeMarkdownFilename(filename: string): string {
  const trimmed = filename.trim();
  if (path.isAbsolute(trimmed) || /[\\/]/u.test(trimmed)) {
    throw new Error('filename must be a file name, not a path.');
  }

  const parsed = path.parse(trimmed);
  const base = parsed.name.trim() || 'generated';
  return `${base.replace(/[<>:"|?*]/gu, '-').trim() || 'generated'}.md`;
}
