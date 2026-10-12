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
});
