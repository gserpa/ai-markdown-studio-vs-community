import * as path from 'path';
import * as vscode from 'vscode';
import { guessMimeType } from '../util/imageMime';
import { buildPreviewHtml, getPreviewTitle } from './previewHtmlBuilder';
import { resolveDocumentResource } from '../util/documentResourceResolver';
import { resolveExtensionAssetUri, resolveExtensionNodeModulesUri, resolveRealPackageUri } from '../util/extensionSupportRoot';
import {
  activatePreviewFrontMatterContext,
  deactivatePreviewFrontMatterContext,
  refreshPreviewFrontMatterContext,
} from './frontMatterDisplayState';

export class MarkdownPreviewCustomEditor implements vscode.CustomReadonlyEditorProvider<vscode.CustomDocument> {
  public static readonly viewType = 'markdownAiStudio.markdownPreview';
  private static activeDocumentUri: vscode.Uri | undefined;
  private readonly panels = new Map<string, Set<vscode.WebviewPanel>>();

  public constructor(private readonly extensionUri: vscode.Uri) {}

  public static getActiveDocumentUri(): vscode.Uri | undefined {
    return MarkdownPreviewCustomEditor.activeDocumentUri;
  }

  public closeForUri(uri: vscode.Uri): void {
    const key = uri.toString();
    const panels = this.panels.get(key);
    if (!panels) {
      return;
    }

    for (const panel of [...panels]) {
      panel.dispose();
    }
  }

  public openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return {
      uri,
      dispose: () => undefined,
    };
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const key = document.uri.toString();
    const frontMatterContextOwner = {};
    const textDocument = await vscode.workspace.openTextDocument(document.uri);

    if (textDocument.getText().trim().length === 0) {
      webviewPanel.dispose();
      await vscode.window.showTextDocument(textDocument, { preview: false });
      return;
    }

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        resolveExtensionAssetUri(this.extensionUri),
        resolveExtensionNodeModulesUri(this.extensionUri),
        resolveRealPackageUri(this.extensionUri, '@mfo', 'preview-web'),
        vscode.Uri.file(path.dirname(document.uri.fsPath)),
      ],
    };

    const openPanels = this.panels.get(key) ?? new Set<vscode.WebviewPanel>();
    openPanels.add(webviewPanel);
    this.panels.set(key, openPanels);

    webviewPanel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        MarkdownPreviewCustomEditor.activeDocumentUri = document.uri;
        void vscode.workspace.openTextDocument(document.uri).then((textDocument) => (
          activatePreviewFrontMatterContext(frontMatterContextOwner, textDocument)
        ));
        return;
      }

      if (MarkdownPreviewCustomEditor.activeDocumentUri?.toString() === key) {
        MarkdownPreviewCustomEditor.activeDocumentUri = undefined;
        void deactivatePreviewFrontMatterContext(frontMatterContextOwner);
      }
    });

    webviewPanel.onDidDispose(() => {
      openPanels.delete(webviewPanel);
      if (openPanels.size === 0) {
        this.panels.delete(key);
      }

      if (MarkdownPreviewCustomEditor.activeDocumentUri?.toString() === key) {
        MarkdownPreviewCustomEditor.activeDocumentUri = undefined;
        void deactivatePreviewFrontMatterContext(frontMatterContextOwner);
      }
    });

    webviewPanel.webview.onDidReceiveMessage(async (message: { command?: string; href?: string; requestId?: string; src?: string }) => {
      if (message.command === 'openLink' && message.href) {
        if (/^https?:/i.test(message.href)) {
          await vscode.env.openExternal(vscode.Uri.parse(message.href));
          return;
        }

        const textDocument = await vscode.workspace.openTextDocument(document.uri);
        const target = resolveDocumentResource(textDocument, message.href, { resolveFragmentToDocument: true });
        if (target) {
          await this.openResolvedLink(target);
        }
        return;
      }

      if (message.command === 'resolveImage' && message.requestId && message.src) {
        const dataUrl = await this.resolveImageToDataUrl(document.uri, message.src);
        await webviewPanel.webview.postMessage({
          command: 'resolveImageResult',
          requestId: message.requestId,
          dataUrl,
        });
      }
    });

    webviewPanel.title = getPreviewTitle(textDocument);
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview, textDocument);
    if (webviewPanel.active) {
      MarkdownPreviewCustomEditor.activeDocumentUri = document.uri;
      await activatePreviewFrontMatterContext(frontMatterContextOwner, textDocument);
    }
  }

  public async refreshDocument(document: vscode.TextDocument): Promise<void> {
    const panels = this.panels.get(document.uri.toString());
    if (!panels) {
      return;
    }

    for (const panel of panels) {
      panel.title = getPreviewTitle(document);
      panel.webview.html = this.getHtml(panel.webview, document);
    }
    await refreshPreviewFrontMatterContext(document);
  }

  public async refreshAll(): Promise<void> {
    for (const [key, panels] of this.panels.entries()) {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(key));
      for (const panel of panels) {
        panel.title = getPreviewTitle(document);
        panel.webview.html = this.getHtml(panel.webview, document);
      }
      await refreshPreviewFrontMatterContext(document);
    }
  }

  private getHtml(webview: vscode.Webview, document: vscode.TextDocument): string {
    return buildPreviewHtml(this.extensionUri, webview, document, (rawPath) => this.resolvePreviewResource(webview, document, rawPath));
  }

  private async openResolvedLink(target: vscode.Uri): Promise<void> {
    if (target.scheme === 'file') {
      const targetFile = target.with({ fragment: '' });

      if (isMarkdownFileUri(targetFile)) {
        await vscode.commands.executeCommand('markdownAiStudio.openPreview', targetFile);
        return;
      }

      await vscode.commands.executeCommand('vscode.open', targetFile, {
        preview: false,
      });
      return;
    }

    try {
      await vscode.commands.executeCommand('vscode.open', target, {
        preview: false,
      });
    } catch {
      // Ignore non-file open failures silently; callers already guarded target creation.
    }
  }

  private resolvePreviewResource(webview: vscode.Webview, document: vscode.TextDocument, rawPath: string): string | undefined {
    if (/^(https?:|data:)/i.test(rawPath)) {
      return rawPath;
    }

    const resourceUri = resolveDocumentResource(document, rawPath, { resolveFragmentToDocument: true });
    if (!resourceUri) {
      return undefined;
    }

    return webview.asWebviewUri(resourceUri).toString();
  }

  private async resolveImageToDataUrl(documentUri: vscode.Uri, rawPath: string): Promise<string | undefined> {
    if (!rawPath || rawPath.startsWith('data:')) {
      return rawPath || undefined;
    }

    try {
      if (/^https?:/i.test(rawPath)) {
        const allowRemote = vscode.workspace.getConfiguration('markdownAiStudio').get<boolean>('allowRemoteResources', true);
        if (!allowRemote) {
          return undefined;
        }

        const response = await fetch(rawPath);
        if (!response.ok) {
          return undefined;
        }

        const contentType = response.headers.get('content-type') || guessMimeType(rawPath, 'image/png');
        const buffer = Buffer.from(await response.arrayBuffer());
        return `data:${contentType};base64,${buffer.toString('base64')}`;
      }

      const document = await vscode.workspace.openTextDocument(documentUri);
      const target = resolveDocumentResource(document, rawPath);
      if (!target || target.scheme !== 'file') {
        return undefined;
      }

      const bytes = await vscode.workspace.fs.readFile(target);
      const contentType = guessMimeType(target.fsPath, 'image/png');
      return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
    } catch {
      return undefined;
    }
  }
}

function isMarkdownFileUri(uri: vscode.Uri): boolean {
  return path.extname(uri.fsPath).toLowerCase() === '.md';
}
