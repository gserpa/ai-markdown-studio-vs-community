import { JSDOM } from 'jsdom';
import type { PreviewThemeRegistry } from '@mfo/preview-web';

export type PortableShellOptions = {
  markdown: string;
  mode: 'document' | 'presentation';
  htmlName: string;
  markdownName: string;
  presentationThemes: PreviewThemeRegistry;
  presentationTheme: string;
  themeMode: 'light' | 'dark';
  allowRemoteResources: boolean;
  renderer: string;
  reviewUi: string;
  reviewCss: string;
  notices: string;
  host: string;
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

export function portableReviewHead(options: PortableShellOptions): { policy: string; style: string } {
  const policy = options.allowRemoteResources ? '' : `<meta http-equiv="Content-Security-Policy" content="img-src data: blob:; media-src file: data: blob:; font-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval' blob: data:; worker-src blob: data:; connect-src 'none'; frame-src 'none'; object-src 'none'">
<script>document.addEventListener('securitypolicyviolation', () => {
  const show = () => { document.getElementById('ams-portable-resource-warning').textContent =
    'Some resources were blocked by the portable resource policy. The preview may be incomplete.'; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, { once: true });
  else show();
});</script>`;
  const style = `<style>${options.reviewCss}
#ams-portable-controls { position: fixed; top: 8px; left: 8px; z-index: 90; display: flex; gap: 6px; }
#ams-portable-controls[hidden] { display: none; }
#ams-portable-controls:not(.presentation-portable-downloads) button { cursor: pointer; padding: 5px 8px; }
#ams-portable-controls.presentation-portable-downloads { position: static; display: contents; }
#ams-portable-controls.presentation-portable-downloads[hidden] { display: none; }
#ams-portable-status { position: fixed; bottom: 8px; left: 8px; z-index: 90; color: #222; background: #fff; }
#ams-portable-resource-warning { position: fixed; bottom: 40px; left: 8px; z-index: 90; color: #222; background: #fff; }
#ams-portable-status:empty, #ams-portable-resource-warning:empty { display: none; }
@media print { #ams-portable-controls, #ams-portable-controls.presentation-portable-downloads, #ams-portable-status, #ams-portable-resource-warning { display: none; } }
</style>`;
  return { policy, style };
}

export function portableReviewBody(options: PortableShellOptions, escapeHtml: (value: string) => string): string {
  const button = (id: string, label: string, path: string) => options.mode === 'presentation'
    ? `<button id="${id}" type="button" class="presentation-tab"><svg class="presentation-icon md-review-tab-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"></path></svg>${label}</button>`
    : `<button id="${id}" type="button">${label}</button>`;
  const data = (id: string, value: unknown) =>
    `<script type="application/octet-stream" id="${id}">${Buffer.from(JSON.stringify(value), 'utf8').toString('base64')}</script>`;
  const config = {
    mode: options.mode,
    htmlName: options.htmlName,
    markdownName: options.markdownName,
    presentationTheme: options.presentationTheme,
    themeMode: options.themeMode,
    presentationThemes: {
      ...options.presentationThemes,
      themes: [...options.presentationThemes.themes],
      aliases: [...options.presentationThemes.aliases],
    },
  };
  return `<nav id="ams-portable-controls" aria-label="Portable review downloads" hidden>
${button('ams-save-html', 'Save reviewed HTML', 'M6 3h9l3 3v15H6z M9 3v6h6V3 M9 21v-7h6v7')}
${button('ams-save-markdown', 'Download Markdown', 'M12 3v12 M8 11l4 4 4-4 M5 17v4h14v-4')}
</nav>
<div id="ams-portable-status" role="status">Initializing portable review...</div>
<div id="ams-portable-resource-warning" role="status"></div>
<template data-ams-portable-notices>${escapeHtml(options.notices)}</template>
${data('ams-portable-source', options.markdown)}
${data('ams-portable-config', config)}
<script type="application/x-ams-runtime" data-ams-runtime="renderer">${safeScript(options.renderer)}</script>
<script type="application/x-ams-runtime" data-ams-runtime="review">${safeScript(options.reviewUi)}</script>
<script>${safeScript(options.host)}</script>`;
}

export function safeScript(source: string): string {
  return source.replace(/<\/script/giu, '<\\/script');
}
