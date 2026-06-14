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

export class MarkdownPreviewPanel {
  private static activePreviewDocumentUri: vscode.Uri | undefined;
  private readonly frontMatterContextOwner = {};
  private readonly panel: vscode.WebviewPanel;
  private document: vscode.TextDocument;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    document: vscode.TextDocument,
    private readonly onDispose: () => void,
  ) {
    this.document = document;
    this.panel = vscode.window.createWebviewPanel(
      'markdownAiStudio.preview',
      this.getTitle(document),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        enableFindWidget: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          resolveExtensionAssetUri(extensionUri),
          resolveExtensionNodeModulesUri(extensionUri),
          resolveRealPackageUri(extensionUri, '@mfo', 'preview-web'),
          vscode.Uri.file(path.dirname(document.uri.fsPath)),
        ],
      },
    );

    this.panel.onDidDispose(() => {
      if (MarkdownPreviewPanel.activePreviewDocumentUri?.toString() === this.document.uri.toString()) {
        MarkdownPreviewPanel.activePreviewDocumentUri = undefined;
        void deactivatePreviewFrontMatterContext(this.frontMatterContextOwner);
      }
      this.onDispose();
    });

    this.panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        MarkdownPreviewPanel.activePreviewDocumentUri = this.document.uri;
        void activatePreviewFrontMatterContext(this.frontMatterContextOwner, this.document);
        return;
      }

      if (MarkdownPreviewPanel.activePreviewDocumentUri?.toString() === this.document.uri.toString()) {
        MarkdownPreviewPanel.activePreviewDocumentUri = undefined;
        void deactivatePreviewFrontMatterContext(this.frontMatterContextOwner);
      }
    });

    this.panel.webview.onDidReceiveMessage(async (message: { command?: string; href?: string; requestId?: string; src?: string }) => {
      if (message.command === 'openLink' && message.href) {
        if (/^https?:/i.test(message.href)) {
          await vscode.env.openExternal(vscode.Uri.parse(message.href));
          return;
        }

        const target = this.resolveDocumentUri(message.href);
        if (!target) {
          return;
        }

        await this.openResolvedLink(target);
        return;
      }

      if (message.command === 'resolveImage' && message.requestId && message.src) {
        const dataUrl = await this.resolveImageToDataUrl(message.src);
        await this.panel.webview.postMessage({
          command: 'resolveImageResult',
          requestId: message.requestId,
          dataUrl,
        });
      }
    });
  }

  public reveal(): void {
    this.panel.reveal(vscode.ViewColumn.Active, true);
  }

  public static getActivePreviewDocumentUri(): vscode.Uri | undefined {
    return MarkdownPreviewPanel.activePreviewDocumentUri;
  }

  public async refresh(document?: vscode.TextDocument): Promise<void> {
    this.document = document ?? this.document;
    this.panel.title = this.getTitle(this.document);
    this.panel.webview.html = this.getHtml(this.panel.webview, this.document);
    if (this.panel.active) {
      MarkdownPreviewPanel.activePreviewDocumentUri = this.document.uri;
      await activatePreviewFrontMatterContext(this.frontMatterContextOwner, this.document);
    } else {
      await refreshPreviewFrontMatterContext(this.document);
    }
  }

  private getTitle(document: vscode.TextDocument, isPresentation = false): string {
    return getPreviewTitle(document, isPresentation);
  }

  private resolvePreviewResource(rawPath: string): string | undefined {
    if (/^(https?:|data:)/i.test(rawPath)) {
      return rawPath;
    }

    const resourceUri = this.resolveDocumentUri(rawPath);
    if (!resourceUri) {
      return undefined;
    }

    return this.panel.webview.asWebviewUri(resourceUri).toString();
  }

  private resolveDocumentUri(rawPath: string): vscode.Uri | undefined {
    return resolveDocumentResource(this.document, rawPath, { resolveFragmentToDocument: true });
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

  private getHtml(webview: vscode.Webview, document: vscode.TextDocument): string {
    return buildPreviewHtml(this.extensionUri, webview, document, (rawPath) => this.resolvePreviewResource(rawPath));
  }

    private async resolveImageToDataUrl(rawPath: string): Promise<string | undefined> {
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

        const target = this.resolveDocumentUri(rawPath);
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
