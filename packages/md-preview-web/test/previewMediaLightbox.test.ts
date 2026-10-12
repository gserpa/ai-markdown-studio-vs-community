import * as fs from 'node:fs';
import * as path from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

const runtime = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'preview.js'), 'utf8');

async function createPreview(body: string, mode = 'document', mermaid?: object) {
  const dom = new JSDOM(`<body class="preview-mode-${mode}" data-preview-mode="${mode}"><main class="markdown-body">${body}</main></body>`, {
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  Object.assign(dom.window, { __previewBridge: { openLink: vi.fn(), resolveImage: vi.fn(), getState: () => ({}), setState: vi.fn() }, mermaid });
  await dom.window.eval(runtime);
  return dom;
}

describe('shared media lightbox', () => {
  it.each([
    { width: 800, height: 400, viewportWidth: 600, viewportHeight: 500, padding: '24px' },
    { width: 400, height: 800, viewportWidth: 600, viewportHeight: 500, padding: '24px' },
    { width: 400, height: 800, viewportWidth: 180, viewportHeight: 120, padding: '12px 20px' },
  ])('fits within the padded viewport on open and after reset: %j', async ({ width, height, viewportWidth, viewportHeight, padding }) => {
    const dom = await createPreview('<img src="data:image/png;base64,AA==">');
    try {
      const document = dom.window.document;
      const viewport = document.querySelector<HTMLElement>('[data-mermaid-lightbox-viewport]')!;
      Object.defineProperties(viewport, { clientWidth: { value: viewportWidth }, clientHeight: { value: viewportHeight } });
      const stage = document.querySelector<HTMLElement>('[data-mermaid-lightbox-stage]')!;
      stage.parentElement!.style.padding = padding;
      const image = document.querySelector('main img')!;
      Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: width }, naturalHeight: { value: height } });
      image.getBoundingClientRect = () => ({ left: 10, top: 10, right: 110, bottom: 110, width: 100, height: 100, x: 10, y: 10, toJSON() {} });
      image.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
      const wrapStyle = dom.window.getComputedStyle(stage.parentElement!);
      const availableWidth = viewportWidth - parseFloat(wrapStyle.paddingLeft) - parseFloat(wrapStyle.paddingRight);
      const availableHeight = viewportHeight - parseFloat(wrapStyle.paddingTop) - parseFloat(wrapStyle.paddingBottom);
      const expectedScale = Math.min((availableWidth - 1) / width, (availableHeight - 1) / height);
      const expectFit = async () => {
        await vi.waitFor(() => {
          expect(parseFloat(stage.style.width)).toBeCloseTo(width * expectedScale);
          expect(parseFloat(stage.style.height)).toBeCloseTo(height * expectedScale);
        });
        expect(parseFloat(stage.style.width)).toBeLessThan(availableWidth);
        expect(parseFloat(stage.style.height)).toBeLessThan(availableHeight);
      };
      await expectFit();
      document.querySelector<HTMLButtonElement>('[data-mermaid-lightbox-action="zoom-in"]')!.click();
      expect(parseFloat(stage.style.width)).toBeGreaterThan(width * expectedScale);
      document.querySelector<HTMLButtonElement>('[data-mermaid-lightbox-action="reset"]')!.click();
      await expectFit();
    } finally { dom.window.close(); }
  });

  it.each(['document', 'presentation'])('creates a missing viewer and zooms images in %s mode', async (mode) => {
    const dom = await createPreview('<img src="data:image/png;base64,AA==" alt="Example">', mode);
    try {
      const document = dom.window.document;
      const image = document.querySelector('main img')!;
      Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 640 }, naturalHeight: { value: 480 } });
      image.getBoundingClientRect = () => ({ left: 10, top: 10, right: 650, bottom: 490, width: 640, height: 480, x: 10, y: 10, toJSON() {} });
      image.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
      const trigger = document.querySelector<HTMLButtonElement>('.image-zoom-trigger')!;
      expect(trigger.hidden).toBe(false);
      trigger.click();
      const viewer = document.querySelector<HTMLElement>('[data-mermaid-lightbox]')!;
      expect(viewer.hidden).toBe(false);
      expect(viewer.querySelector('img')?.getAttribute('src')).toBe(image.getAttribute('src'));
      expect(viewer.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Image viewer');
      const stage = viewer.querySelector<HTMLElement>('[data-mermaid-lightbox-stage]')!;
      viewer.querySelector<HTMLButtonElement>('[data-mermaid-lightbox-action="zoom-in"]')!.click();
      expect(parseFloat(stage.style.width)).toBeGreaterThan(640);
      dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(viewer.hidden).toBe(true);
      expect(stage.childElementCount).toBe(0);
      expect(document.activeElement).toBe(image);
    } finally { dom.window.close(); }
  });

  it('renders Mermaid and opens zoom without host-supplied lightbox markup', async () => {
    const dom = await createPreview('<div class="mermaid">flowchart TD\nA-->B</div>', 'document', {
      initialize: vi.fn(),
      render: vi.fn(async () => ({ svg: '<svg id="preview-mermaid-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><rect width="800" height="400" /></svg>' })),
    });
    try {
      const document = dom.window.document;
      document.querySelector<HTMLButtonElement>('[data-mermaid-action="open-lightbox"]')!.click();
      const viewer = document.querySelector<HTMLElement>('[data-mermaid-lightbox]')!;
      expect(viewer.hidden).toBe(false);
      expect(viewer.querySelector('[data-mermaid-lightbox-stage] svg')).not.toBeNull();
      // Mermaid styles are scoped to this SVG id, so the viewer must preserve it.
      expect(viewer.querySelector('svg')?.id).toBe('preview-mermaid-1');
      viewer.querySelector<HTMLButtonElement>('[data-mermaid-lightbox-action="close"]')!.click();
      expect(viewer.hidden).toBe(true);
      await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    } finally { dom.window.close(); }
  });

  it('keeps linked image clicks available', async () => {
    const dom = await createPreview('<a href="https://example.com"><img src="image.png"></a>');
    try {
      const document = dom.window.document;
      expect(document.querySelectorAll('[data-mermaid-lightbox]')).toHaveLength(1);
      const image = document.querySelector('main img')!;
      image.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      expect((dom.window as unknown as { __previewBridge: { openLink: ReturnType<typeof vi.fn> } }).__previewBridge.openLink).toHaveBeenCalledWith('https://example.com');
      expect(document.querySelector<HTMLElement>('[data-mermaid-lightbox]')!.hidden).toBe(true);
    } finally { dom.window.close(); }
  });
});
