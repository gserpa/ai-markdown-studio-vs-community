import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

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
