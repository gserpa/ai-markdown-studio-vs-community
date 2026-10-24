import type * as vscode from 'vscode';
import type { PreviewPage } from './previewHtmlBuilder';

/** Shared by both VS Code preview hosts. Only one document patch is in flight. */
export class PreviewDocumentUpdater {
  private loaded?: PreviewPage;
  private desired?: PreviewPage;
  private ready = false;
  private disposed = false;
  private revision = 0;
  private pending?: { revision: number; page: PreviewPage };
  private editTimer?: ReturnType<typeof setTimeout>;
  private responseTimer?: ReturnType<typeof setTimeout>;

  public constructor(private readonly webview: Pick<vscode.Webview, 'html' | 'postMessage'>) {}

  public refresh(build: () => PreviewPage, debounce = false): void {
    clearTimeout(this.editTimer);
    if (this.disposed) return;
    if (debounce) {
      this.editTimer = setTimeout(() => {
        if (this.disposed) return;
        try { this.update(build()); }
        catch (error) { console.warn('[preview] Failed to refresh document.', error); }
      }, 150);
    } else {
      this.update(build());
    }
  }

  public handleMessage(message: { command?: string; sessionId?: string; revision?: number; applied?: boolean }): boolean {
    if (message.command !== 'previewReady' && message.command !== 'documentUpdateResult') return false;
    if (this.disposed || !this.loaded || message.sessionId !== this.loaded.sessionId) return true;
    if (message.command === 'previewReady') {
      // A recreated webview starts from its original HTML, even if earlier
      // patches had been acknowledged. Restore the newest complete snapshot.
      if (this.ready) this.reload();
      else { this.ready = true; this.flush(); }
    } else if (this.pending && this.pending.revision === message.revision) {
      clearTimeout(this.responseTimer);
      if (!message.applied) this.reload();
      else {
        this.loaded = { ...this.pending.page, sessionId: this.loaded!.sessionId };
        this.pending = undefined;
        this.flush();
      }
    }
    return true;
  }

  public dispose(): void {
    this.disposed = true;
    clearTimeout(this.editTimer);
    clearTimeout(this.responseTimer);
    this.pending = undefined;
    this.loaded = this.desired = undefined;
  }

  private update(page: PreviewPage): void {
    this.desired = page;
    if (!this.loaded || page.mode !== 'document' || this.loaded.compatibilityKey !== page.compatibilityKey) {
      this.reload();
    } else {
      this.flush();
    }
  }

  private reload(): void {
    clearTimeout(this.responseTimer);
    this.pending = undefined;
    this.ready = false;
    this.loaded = this.desired;
    if (this.loaded && !this.disposed) this.webview.html = this.loaded.html;
  }

  private flush(): void {
    if (this.disposed || !this.loaded || !this.desired || this.pending) return;
    if (this.loaded.body === this.desired.body) {
      clearTimeout(this.responseTimer);
      return;
    }
    clearTimeout(this.responseTimer);
    // Also covers edits arriving while the first page is still initializing.
    this.responseTimer = setTimeout(() => this.reload(), 5000);
    if (!this.ready) return;
    const pending = { revision: ++this.revision, page: this.desired };
    this.pending = pending;
    const sessionId = this.loaded.sessionId;
    void (async () => {
      try {
        const delivered = await this.webview.postMessage({
          command: 'updateDocument', sessionId, revision: pending.revision, body: pending.page.body,
        });
        if (!delivered && this.pending === pending) this.reload();
      } catch {
        if (this.pending === pending) this.reload();
      }
    })();
  }
}
