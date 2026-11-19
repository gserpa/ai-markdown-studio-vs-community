(() => {
  const sourceElement = document.getElementById('ams-portable-source');
  const configElement = document.getElementById('ams-portable-config');
  const status = document.getElementById('ams-portable-status');
  const shell = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  const sourceTag = sourceElement.outerHTML;
  const sourceIndex = shell.indexOf(sourceTag);
  if (sourceIndex < 0 || shell.indexOf(sourceTag, sourceIndex + 1) !== -1) {
    status.textContent = 'Cannot initialize portable review: the source container is invalid.';
    return;
  }
  const encode = value => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 16384) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    }
    return btoa(binary);
  };
  const decode = element => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(atob(element.textContent.trim()), character => character.charCodeAt(0)),
  ));
  const run = script => {
    const executable = document.createElement('script');
    executable.textContent = script.textContent;
    document.body.append(executable);
  };
  const saveDownload = (name, type, content) => {
    if (!window.Blob || !URL.createObjectURL) throw new Error('This browser does not support downloads.');
    const url = URL.createObjectURL(new Blob([content], { type }));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.addEventListener('click', event => event.stopPropagation());
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    status.textContent = 'Download requested. Confirm that your browser saved the file; changes remain unsaved here.';
  };
  (async () => {
    const source = decode(sourceElement);
    const config = decode(configElement);
    if (typeof source !== 'string') throw new Error('The embedded Markdown is invalid.');
    const scripts = [...document.querySelectorAll('script[type="application/x-ams-runtime"]')];
    const renderer = scripts.find(script => script.dataset.amsRuntime === 'renderer');
    const reviewUi = scripts.find(script => script.dataset.amsRuntime === 'review');
    if (!renderer || !reviewUi) throw new Error('The portable review runtime is missing.');
    run(renderer);
    const api = window.__mfoPortableReview;
    const registry = {
      ...config.presentationThemes,
      themes: new Map(config.presentationThemes.themes),
      aliases: new Map(config.presentationThemes.aliases),
    };
    const sessionId = crypto.randomUUID();
    const host = await api.createPortableReviewHost(source, sessionId, {
      presentationThemes: registry, presentationTheme: config.presentationTheme, themeMode: config.themeMode,
    });
    const previousRoot = document.querySelector(config.mode === 'presentation' ? '.presentation-preview' : 'main.markdown-body');
    if (!previousRoot || host.snapshot().mode !== config.mode) throw new Error('The preview mode does not match the embedded Markdown.');
    const template = document.createElement('template');
    template.innerHTML = host.snapshot().body;
    const root = template.content.firstElementChild;
    if (!root) throw new Error('The portable preview could not be rendered.');
    previousRoot.replaceWith(template.content);
    const controls = document.getElementById('ams-portable-controls');
    if (config.mode === 'presentation') {
      const tabs = root.querySelector('.presentation-bottom-bar-tabs');
      if (!tabs) throw new Error('The presentation controls are missing.');
      controls.classList.add('presentation-portable-downloads');
      tabs.append(controls);
      controls.addEventListener('click', event => event.stopPropagation());
    }
    window.__previewBridge = {
      ...api.createPortableReviewBridge(host, root, sessionId),
      openLink: href => { if (href) window.open(href, '_blank', 'noopener,noreferrer'); },
      resolveImage: requestId => window.dispatchEvent(new MessageEvent('message', {
        data: { command: 'resolveImageResult', requestId, error: 'This image is unavailable in the portable file.' },
      })),
    };
    document.addEventListener('md-slide-changed', () => { document.body.dataset.amsPresentationReady = 'true'; }, { once: true });
    for (const script of scripts) if (script !== renderer && script !== reviewUi) run(script);
    run(reviewUi);
    let dirty = false;
    document.addEventListener('md-portable-review-changed', () => { dirty = true; });
    document.addEventListener('input', event => {
      if (event.target.closest?.('.md-review-composer')) dirty = true;
    });
    window.addEventListener('beforeunload', event => {
      if (dirty) { event.preventDefault(); event.returnValue = ''; }
    });
    document.getElementById('ams-save-html').addEventListener('click', () => {
      try {
        const tag = sourceTag.replace(sourceElement.textContent, encode(host.snapshot().markdown));
        const html = shell.slice(0, sourceIndex) + tag + shell.slice(sourceIndex + sourceTag.length);
        saveDownload(config.htmlName, 'text/html;charset=utf-8', html);
      } catch (error) { status.textContent = 'Could not request HTML download: ' + (error instanceof Error ? error.message : String(error)); }
    });
    document.getElementById('ams-save-markdown').addEventListener('click', () => {
      try { saveDownload(config.markdownName, 'text/markdown;charset=utf-8', host.snapshot().markdown); }
      catch (error) { status.textContent = 'Could not request Markdown download: ' + (error instanceof Error ? error.message : String(error)); }
    });
    controls.hidden = false;
    status.textContent = '';
  })().catch(error => {
    status.textContent = 'Cannot initialize portable review: ' + (error instanceof Error ? error.message : String(error));
  });
})();
