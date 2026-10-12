import * as vscode from 'vscode';
import { resolveDocumentResource } from '../util/documentResourceResolver';
import { detectSupportedRasterMimeType, guessMimeType, normalizeMimeType } from '../util/imageMime';

export async function imageDataUri(document: vscode.TextDocument, source: string, allowRemote: boolean): Promise<string> {
  if (/^data:image\//iu.test(source)) return source;
  let bytes: Buffer;
  let mime: string;
  let fragment = '';
  if (/^https?:\/\//iu.test(source)) {
    if (!allowRemote) throw new Error('Remote resources are disabled in settings.');
    const response = await fetch(source, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Image download failed (HTTP ' + response.status + ').');
    bytes = Buffer.from(await response.arrayBuffer());
    mime = normalizeMimeType(response.headers.get('content-type') || 'application/octet-stream');
    if (mime === 'application/octet-stream') mime = detectSupportedRasterMimeType(bytes) ?? guessMimeType(new URL(response.url || source).pathname);
    fragment = new URL(source).hash;
  } else {
    if (/^[a-z][a-z0-9+.-]*:/iu.test(source) && !/^file:/iu.test(source) && !/^[a-z]:[/\\]/iu.test(source)) throw new Error('Unsupported image URL scheme.');
    const uri = resolveDocumentResource(document, source);
    if (!uri || uri.scheme !== 'file') throw new Error('The image must refer to a local file.');
    bytes = Buffer.from(await vscode.workspace.fs.readFile(uri.with({ query: '', fragment: '' })));
    mime = detectSupportedRasterMimeType(bytes) ?? guessMimeType(uri.fsPath);
    fragment = uri.fragment ? '#' + uri.fragment : '';
  }
  if (!bytes.length || !mime.startsWith('image/')) throw new Error('The resource is not a supported image.');
  return 'data:' + mime + ';base64,' + bytes.toString('base64') + fragment;
}
