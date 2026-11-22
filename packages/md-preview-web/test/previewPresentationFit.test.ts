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

  it('updates the speaker notes empty state when navigating between slides', async () => {
    const dom = new JSDOM(`<body data-preview-mode="presentation">
      <section class="presentation-preview">
        <header class="presentation-header">
          <button data-presentation-action="previous"></button>
          <button data-presentation-action="next"></button>
        </header>
        <div class="presentation-stage">
          <section class="presentation-slide"></section>
          <section class="presentation-slide"></section>
          <section class="presentation-slide"></section>
        </div>
        <div class="presentation-bottom-bar" data-presentation-bottom-bar>
          <button class="presentation-tab" data-panel="notes">Speaker Notes</button>
          <div class="presentation-bottom-panel" data-panel="notes" hidden>
            <div class="presentation-bottom-panel-notes markdown-body" data-presentation-panel-notes></div>
          </div>
        </div>
        <script type="application/json" data-presentation-slide-data>[{"notesHtml":""},{"notesHtml":"<p>Presenter <strong>note</strong></p>"},{}]</script>
      </section>
    </body>`, { runScripts: 'outside-only', pretendToBeVisual: true });
    try {
      Object.assign(dom.window, { __previewBridge: { getState: () => ({}), setState: vi.fn() } });
      await dom.window.eval(runtime);
      await dom.window.eval('window.__mfoPreviewModeRuntime.startPresentation()');
      const document = dom.window.document;
      const notes = document.querySelector<HTMLElement>('[data-presentation-panel-notes]')!;
      const tab = document.querySelector<HTMLButtonElement>('.presentation-tab[data-panel="notes"]')!;
      const next = document.querySelector<HTMLButtonElement>('[data-presentation-action="next"]')!;
      const previous = document.querySelector<HTMLButtonElement>('[data-presentation-action="previous"]')!;

      tab.click();
      expect(notes.textContent).toBe('No speaker notes.');
      next.click();
      expect(notes.querySelector('strong')?.textContent).toBe('note');
      expect(notes.textContent).toBe('Presenter note');
      next.click();
      expect(notes.textContent).toBe('No speaker notes.');
      previous.click();
      expect(notes.textContent).toBe('Presenter note');
      tab.click();
      previous.click();
      tab.click();
      expect(notes.textContent).toBe('No speaker notes.');
    } finally { dom.window.close(); }
  });

  it('navigates once per vertical wheel gesture without intercepting scrollable content', async () => {
    const dom = new JSDOM(`<body data-preview-mode="presentation">
      <section class="presentation-preview"><div class="presentation-stage">
        <section class="presentation-slide"><div id="scrollable" style="overflow-y: auto"><span>Content</span></div></section>
        <section class="presentation-slide"></section><section class="presentation-slide"></section>
      </div></section></body>`, { runScripts: 'outside-only', pretendToBeVisual: true });
    try {
      Object.assign(dom.window, { __previewBridge: { getState: () => ({}), setState: vi.fn() } });
      await dom.window.eval(runtime);
      await dom.window.eval('window.__mfoPreviewModeRuntime.startPresentation()');
      const stage = dom.window.document.querySelector('.presentation-stage')!;
      const slides = [...stage.querySelectorAll('.presentation-slide')];
      const wheel = (target: Element, options: WheelEventInit) => {
        const event = new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true, ...options });
        target.dispatchEvent(event);
        return event;
      };
      expect(wheel(stage, { deltaY: 100 }).defaultPrevented).toBe(true);
      expect(slides[1].classList.contains('is-active')).toBe(true);
      wheel(stage, { deltaY: 10 });
      expect(slides[1].classList.contains('is-active')).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 220));
      wheel(stage, { deltaY: -100 });
      expect(slides[0].classList.contains('is-active')).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 220));
      const scrollable = dom.window.document.querySelector<HTMLElement>('#scrollable')!;
      Object.defineProperties(scrollable, { scrollHeight: { value: 200 }, clientHeight: { value: 100 } });
      expect(wheel(scrollable.querySelector('span')!, { deltaY: 100 }).defaultPrevented).toBe(false);
      expect(wheel(stage, { deltaY: 100, ctrlKey: true }).defaultPrevented).toBe(false);
      expect(wheel(stage, { deltaX: 100, deltaY: 10 }).defaultPrevented).toBe(false);
      expect(slides[0].classList.contains('is-active')).toBe(true);
    } finally { dom.window.close(); }
  });
});
