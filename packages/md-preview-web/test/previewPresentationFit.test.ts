import * as fs from 'node:fs';
import * as path from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

const runtime = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'preview.js'), 'utf8');

describe('presentation content fitting', () => {
  it.each(['width', 'height'])('removes one pixel of %s overflow even when the fit ratio exceeds 0.999', async (axis) => {
    const dom = new JSDOM(`<body data-preview-mode="presentation" data-presentation-content-overflow="scaleToFit">
      <section class="presentation-preview"><div class="presentation-stage">
        <section class="presentation-slide"><div class="presentation-slide-shell">
          <div class="presentation-frame"><div class="presentation-canvas">
            <div data-presentation-content-fit><div class="presentation-standard-content"></div></div>
          </div></div>
        </div></section>
      </div></section></body>`, { runScripts: 'outside-only', pretendToBeVisual: true });
    try {
      const document = dom.window.document;
      const fit = document.querySelector<HTMLElement>('[data-presentation-content-fit]')!;
      const content = document.querySelector<HTMLElement>('.presentation-standard-content')!;
      const shell = document.querySelector('.presentation-slide-shell')!;
      Object.defineProperties(shell, { clientWidth: { value: 1200 }, clientHeight: { value: 675 } });
      const scale = () => Number(fit.style.getPropertyValue('--presentation-content-scale') || 1);
      Object.defineProperties(content, {
        clientWidth: { get: () => Math.floor(2000 / scale()) },
        clientHeight: { get: () => Math.floor(2000 / scale()) },
        scrollWidth: { get: () => Math.max(content.clientWidth, axis === 'width' ? 2001 : 2000) },
        scrollHeight: { get: () => Math.max(content.clientHeight, axis === 'height' ? 2001 : 2000) },
      });
      Object.assign(dom.window, { __previewBridge: { getState: () => ({}), setState: vi.fn() } });
      await dom.window.eval(runtime);
      await dom.window.eval('window.__mfoPreviewModeRuntime.startPresentation()');
      await vi.waitFor(() => {
        expect(scale()).toBeLessThan(1);
        expect(content.scrollWidth).toBe(content.clientWidth);
        expect(content.scrollHeight).toBe(content.clientHeight);
      });
      expect(scale()).toBeGreaterThanOrEqual(0.6);
    } finally { dom.window.close(); }
  });

  it('uses only slides and thumbnails in the generated presentation controls', async () => {
    const dom = new JSDOM(`<body data-preview-mode="presentation">
      <section class="presentation-preview">
        <header class="presentation-header">
          <span data-presentation-current></span>
          <button data-presentation-action="previous"></button>
          <button data-presentation-action="next"></button>
          <button data-presentation-action="fullscreen"></button>
        </header>
        <div class="presentation-stage">
          <section class="presentation-slide" id="slide-one">
            <article class="presentation-slide-body">
              <div class="presentation-slide" id="forged-slide">
                <a class="presentation-thumb" data-slide-target="2">Forged thumbnail</a>
              </div>
            </article>
          </section>
          <section class="presentation-slide" id="slide-two"></section>
        </div>
        <div class="presentation-bottom-bar" data-presentation-bottom-bar>
          <div class="presentation-bottom-panel" data-panel="slides">
            <nav class="presentation-filmstrip">
              <button class="presentation-thumb" data-slide-target="0"></button>
              <button class="presentation-thumb" data-slide-target="1" id="trusted-thumbnail"></button>
            </nav>
          </div>
          <div class="presentation-bottom-panel" data-panel="notes"><div data-presentation-panel-notes></div></div>
          <div class="presentation-bottom-panel" data-panel="info"><div data-presentation-panel-info></div></div>
        </div>
        <script type="application/json" data-presentation-slide-data>[]</script>
      </section>
    </body>`, { runScripts: 'outside-only', pretendToBeVisual: true });
    try {
      Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollIntoView', { value: vi.fn() });
      Object.assign(dom.window, { __previewBridge: { getState: () => ({}), setState: vi.fn() } });
      await dom.window.eval(runtime);
      await dom.window.eval('window.__mfoPreviewModeRuntime.startPresentation()');
      dom.window.document.querySelector<HTMLButtonElement>('#trusted-thumbnail')!.click();

      expect(dom.window.document.querySelector('#slide-one')?.classList.contains('is-active')).toBe(false);
      expect(dom.window.document.querySelector('#slide-two')?.classList.contains('is-active')).toBe(true);
      expect(dom.window.document.querySelector('#forged-slide')?.classList.contains('is-active')).toBe(false);
    } finally { dom.window.close(); }
  });
});
