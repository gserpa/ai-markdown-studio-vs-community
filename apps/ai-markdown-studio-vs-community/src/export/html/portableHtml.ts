import { JSDOM } from 'jsdom';

export type PortableShellOptions = {
  markdown: string;
  markdownName: string;
  allowRemoteResources: boolean;
  notices: string;
};

export function validatePortableMediaResources(renderedHtml: string, allowRemoteResources: boolean): void {
  if (allowRemoteResources) return;
  const dom = new JSDOM(renderedHtml);
  try {
    for (const element of dom.window.document.querySelectorAll('video[src], video[poster], video source[src], video track[src]')) {
      for (const attribute of ['src', 'poster']) {
        const value = element.getAttribute(attribute)?.trim();
        if (!value) continue;
        let url: URL;
        try {
          url = new URL(value, 'file:///portable.html');
        } catch {
          throw new Error('Cannot export portable HTML: invalid media URL (' + value + ').');
        }
        if (url.protocol === 'http:' || url.protocol === 'https:' || (url.protocol === 'file:' && url.host)) {
          throw new Error('Cannot export portable HTML: remote media is disabled in settings (' + value + ').');
        }
      }
    }
  } finally {
    dom.window.close();
  }
}

export function portableHead(options: PortableShellOptions): { policy: string; style: string } {
  const policy = options.allowRemoteResources ? '' : `<meta http-equiv="Content-Security-Policy" content="img-src data: blob:; media-src file: data: blob:; font-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval' blob: data:; worker-src blob: data:; connect-src 'none'; frame-src 'none'; object-src 'none'">
<script>document.addEventListener('securitypolicyviolation', () => {
  const show = () => { document.getElementById('ams-portable-resource-warning').textContent =
    'Some resources were blocked by the portable resource policy. The preview may be incomplete.'; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, { once: true });
  else show();
});</script>`;
  const style = `<style>
#ams-portable-controls[hidden] { display: none; }
.ams-document-controls { position: fixed; top: 8px; right: 10px; z-index: 90; }
.ams-document-controls button { cursor: pointer; padding: 6px 10px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
.ams-document-controls button:focus-visible { outline: 2px solid var(--vscode-focusBorder, #007acc); outline-offset: 2px; }
.ams-document-menu { position: absolute; top: 100%; right: 0; padding-top: 4px; white-space: nowrap; }
.ams-document-menu[hidden] { display: none; }
@media (hover: hover) {
  .ams-document-controls:not(.is-revealed):not(:focus-within):not(.is-open) { opacity: 0; pointer-events: none; }
}
@media (any-pointer: coarse) { .ams-document-controls { opacity: 1 !important; pointer-events: auto !important; } }
#ams-portable-status, #ams-portable-resource-warning { position: fixed; bottom: 8px; left: 8px; z-index: 90; color: #222; background: #fff; }
#ams-portable-resource-warning { bottom: 40px; }
#ams-portable-status:empty, #ams-portable-resource-warning:empty { display: none; }
@media print { #ams-portable-controls, #ams-save-markdown, #ams-portable-status, #ams-portable-resource-warning { display: none; } }
</style>`;
  return { policy, style };
}

export function portableDownloadControl(mode: 'document' | 'presentation'): string {
  if (mode === 'presentation') {
    return `<button id="ams-save-markdown" type="button" class="presentation-tab" title="Download Markdown"><svg class="presentation-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12 M8 11l4 4 4-4 M5 17v4h14v-4"></path></svg>Download Markdown</button>`;
  }
  return `<nav id="ams-portable-controls" class="ams-document-controls" aria-label="HTML export menu" hidden>
  <button id="ams-export-menu" type="button" aria-label="HTML export menu" aria-expanded="false" aria-controls="ams-export-menu-items">☰</button>
  <div id="ams-export-menu-items" class="ams-document-menu" hidden><button id="ams-save-markdown" type="button">Download Markdown</button></div>
</nav>`;
}

export function portableBody(options: PortableShellOptions, mode: 'document' | 'presentation', escapeHtml: (value: string) => string): string {
  const data = (id: string, value: unknown) =>
    `<script type="application/octet-stream" id="${id}">${Buffer.from(JSON.stringify(value), 'utf8').toString('base64')}</script>`;
  return `${mode === 'document' ? portableDownloadControl(mode) : ''}
<div id="ams-portable-status" role="status"></div>
<div id="ams-portable-resource-warning" role="status"></div>
<template data-ams-portable-notices>${escapeHtml(options.notices)}</template>
${data('ams-portable-source', options.markdown)}
${data('ams-portable-config', { markdownName: options.markdownName })}
<script>
(() => {
  const status = document.getElementById('ams-portable-status');
  const controls = document.getElementById('ams-portable-controls');
  const download = document.getElementById('ams-save-markdown');
  const decode = id => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(atob(document.getElementById(id).textContent.trim()), character => character.charCodeAt(0)),
  ));
  try {
    const markdown = decode('ams-portable-source');
    const config = decode('ams-portable-config');
    if (typeof markdown !== 'string' || typeof config.markdownName !== 'string') throw new Error('The embedded Markdown is invalid.');
    download.addEventListener('click', event => {
      event.stopPropagation();
      try {
        if (!window.Blob || !URL.createObjectURL) throw new Error('This browser does not support downloads.');
        const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
        try {
          const link = document.createElement('a');
          link.href = url;
          link.download = config.markdownName;
          link.addEventListener('click', click => click.stopPropagation());
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (error) {
          URL.revokeObjectURL(url);
          throw error;
        }
        status.textContent = 'Download requested. Confirm that your browser saved the file.';
      } catch (error) {
        status.textContent = 'Could not request Markdown download: ' + (error instanceof Error ? error.message : String(error));
      }
    });
    if (controls) {
      const menuButton = document.getElementById('ams-export-menu');
      const menu = document.getElementById('ams-export-menu-items');
      const close = () => { menu.hidden = true; controls.classList.remove('is-open'); menuButton.setAttribute('aria-expanded', 'false'); };
      menuButton.addEventListener('click', () => {
        menu.hidden = !menu.hidden;
        controls.classList.toggle('is-open', !menu.hidden);
        menuButton.setAttribute('aria-expanded', String(!menu.hidden));
      });
      document.addEventListener('pointermove', event => {
        controls.classList.toggle('is-revealed', event.clientX >= window.innerWidth - 200 && event.clientY <= 100);
      }, { passive: true });
      document.addEventListener('pointerdown', event => { if (!controls.contains(event.target)) close(); });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !menu.hidden) { close(); menuButton.focus(); }
      });
      controls.hidden = false;
    }
  } catch (error) {
    if (download) download.hidden = true;
    status.textContent = 'Cannot initialize Markdown download: ' + (error instanceof Error ? error.message : String(error));
  }
})();
</script>`;
}

export function safeScript(source: string): string {
  return source.replace(/<\/script/giu, '<\\/script');
}
