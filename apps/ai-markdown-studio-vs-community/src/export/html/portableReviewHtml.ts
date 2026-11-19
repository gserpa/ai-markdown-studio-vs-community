import { JSDOM } from 'jsdom';
import type { PreviewThemeRegistry } from '@mfo/preview-web';

type PortableShellOptions = {
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

export function buildPortableReviewShell(renderedHtml: string, options: PortableShellOptions): string {
  const dom = new JSDOM(renderedHtml);
  try {
    const document = dom.window.document;
    for (const script of document.querySelectorAll('script')) {
      if (!script.hasAttribute('data-ams-export-asset')) {
        script.remove();
      } else {
        script.type = 'application/x-ams-runtime';
        script.textContent = safeScript(script.textContent ?? '');
      }
    }
    if (!options.allowRemoteResources) {
      const policy = document.createElement('meta');
      policy.httpEquiv = 'Content-Security-Policy';
      policy.content = "img-src data: blob:; media-src file: data: blob:; font-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval' blob: data:; worker-src blob: data:; connect-src 'none'; frame-src 'none'; object-src 'none'";
      const warning = document.createElement('script');
      warning.textContent = `document.addEventListener('securitypolicyviolation', () => {
  const show = () => { document.getElementById('ams-portable-resource-warning').textContent =
    'Some resources were blocked by the portable resource policy. The preview may be incomplete.'; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, { once: true });
  else show();
});`;
      document.head.prepend(policy, warning);
    }
    const style = document.createElement('style');
    style.textContent = options.reviewCss + `
#ams-portable-controls { position: fixed; top: 8px; left: 8px; z-index: 90; display: flex; gap: 6px; }
#ams-portable-controls[hidden] { display: none; }
#ams-portable-controls button { cursor: pointer; padding: 5px 8px; }
#ams-portable-status { position: fixed; bottom: 8px; left: 8px; z-index: 90; color: #222; background: #fff; }
#ams-portable-resource-warning { position: fixed; bottom: 40px; left: 8px; z-index: 90; color: #222; background: #fff; }
#ams-portable-status:empty, #ams-portable-resource-warning:empty { display: none; }
@media print { #ams-portable-controls, #ams-portable-status, #ams-portable-resource-warning { display: none; } }
`;
    document.head.append(style);
    const controls = document.createElement('nav');
    controls.id = 'ams-portable-controls';
    controls.setAttribute('aria-label', 'Portable review downloads');
    controls.hidden = true;
    for (const [id, label] of [['ams-save-html', 'Save reviewed HTML'], ['ams-save-markdown', 'Download Markdown']]) {
      const button = document.createElement('button');
      button.id = id;
      button.type = 'button';
      button.textContent = label;
      controls.append(button);
    }
    const status = document.createElement('div');
    status.id = 'ams-portable-status';
    status.setAttribute('role', 'status');
    status.textContent = 'Initializing portable review...';
    const resourceWarning = document.createElement('div');
    resourceWarning.id = 'ams-portable-resource-warning';
    resourceWarning.setAttribute('role', 'status');
    document.body.append(controls, status, resourceWarning);
    const notices = document.createElement('template');
    notices.setAttribute('data-ams-portable-notices', '');
    notices.content.textContent = options.notices;
    document.body.append(notices);
    const data = (id: string, value: unknown) => {
      const element = document.createElement('script');
      element.type = 'application/octet-stream';
      element.id = id;
      element.textContent = Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
      document.body.append(element);
    };
    data('ams-portable-source', options.markdown);
    data('ams-portable-config', {
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
    });
    const runtime = (name: string, text: string) => {
      const element = document.createElement('script');
      element.type = 'application/x-ams-runtime';
      element.dataset.amsRuntime = name;
      element.textContent = safeScript(text);
      document.body.append(element);
    };
    runtime('renderer', options.renderer);
    runtime('review', options.reviewUi);
    const host = document.createElement('script');
    host.textContent = safeScript(options.host);
    document.body.append(host);
    return dom.serialize();
  } finally {
    dom.window.close();
  }
}

function safeScript(source: string): string {
  return source.replace(/<\/script/giu, '<\\/script');
}
