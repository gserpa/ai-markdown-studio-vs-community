import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

const previewStylesheet = fs.readFileSync(
  path.resolve(__dirname, '..', 'assets', 'preview.css'),
  'utf8',
);

describe('preview stylesheet document theme foundations', () => {
  it('keeps the page surface host-driven and the content surface theme-driven', () => {
    expect(previewStylesheet).toContain('background-color: var(--vscode-editor-background, light-dark(#ffffff, #0d1117));');
    expect(previewStylesheet).toContain('background: var(--md-preview-content-bg);');
    expect(previewStylesheet).toContain('background: var(--md-preview-table-row-bg, var(--md-preview-code-bg));');
  });
});

// A light document can live in a dark host, including hosts without mode metadata.
describe('document code colors in a dark host', () => {
  it.each(['vscode-dark', 'vscode-high-contrast'])('uses theme tokens in %s', (hostClass) => {
    for (const modeClass of ['', 'document-theme-mode-light', 'document-theme-mode-auto', 'document-theme-mode-dark']) {
      const dom = new JSDOM(`<style>${previewStylesheet}</style>
        <body class="preview-mode-document ${hostClass} ${modeClass}">
          <main class="markdown-body"><pre class="hljs"><code class="hljs">Marker Android/
            <span class="hljs-comment"># Build debug APK</span>
            <span class="hljs-keyword">const</span>
            <span class="hljs-string">"file.md"</span>
            <span class="hljs-meta">meta</span>
            <span class="hljs-symbol">symbol</span>
          </code></pre></main>
        </body>`);
      try {
        const expectedTokens = {
          'pre': '--md-preview-code-color',
          'code': '--md-preview-code-color',
          '.hljs-comment': '--md-preview-code-comment-color',
          '.hljs-keyword': '--md-preview-code-keyword-color',
          '.hljs-string': '--md-preview-code-string-color',
          '.hljs-meta': '--md-preview-code-meta-color',
          '.hljs-symbol': '--md-preview-code-symbol-color',
        };
        for (const [selector, token] of Object.entries(expectedTokens)) {
          const element = dom.window.document.querySelector(selector)!;
          // jsdom preserves var() expressions; the browser resolves the theme's value.
          expect(dom.window.getComputedStyle(element).color).toContain(`var(${token}`);
        }
      } finally {
        dom.window.close();
      }
    }
  });
});
