import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import HtmlToDocx from 'html-to-docx';
import { buildExportHtmlString } from '../html/htmlExporter';

export async function exportMarkdownAsBasicDocx(extensionUri: vscode.Uri, document: vscode.TextDocument): Promise<vscode.Uri | undefined> {
  const defaultTarget = vscode.Uri.file(path.join(path.dirname(document.uri.fsPath), `${path.parse(document.fileName).name}.docx`));
  const targetUri = await vscode.window.showSaveDialog({
    defaultUri: defaultTarget,
    filters: {
      Word: ['docx'],
    },
    saveLabel: 'Export DOCX',
  });

  if (!targetUri) {
    return undefined;
  }

  const html = await buildExportHtmlString(extensionUri, document);
  const result = await HtmlToDocx(html, null, { decodeUnicode: true });
  const buffer = Buffer.isBuffer(result) ? result : Buffer.from(result as ArrayBuffer);
  await writeFile(targetUri.fsPath, buffer);
  return targetUri;
}
