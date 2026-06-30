import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const previewStylesheet = fs.readFileSync(
  path.resolve(__dirname, '..', 'assets', 'preview.css'),
  'utf8',
);

const previewRuntime = fs.readFileSync(
  path.resolve(__dirname, '..', 'assets', 'preview.js'),
  'utf8',
);

describe('preview Mermaid theming', () => {
  it('does not repaint Mermaid colors in the stylesheet', () => {
    expect(previewStylesheet).not.toContain('/* Document Preview: Mermaid dark-mode patching */');
    expect(previewStylesheet).not.toContain('/* Presentation Preview: Mermaid dark-mode patching */');
    expect(previewStylesheet).not.toContain('.presentation-preview .presentation-slide-body .mermaid-rendered svg .node rect,');
  });

  it('does not repaint Mermaid colors in runtime after render', () => {
    expect(previewRuntime).not.toContain('patchDarkModeMermaid(');
    expect(previewRuntime).not.toContain('function patchMermaidPalette(');
    expect(previewRuntime).not.toContain('setRenderedMermaidThemeClass(');
    expect(previewRuntime).toContain('patchMermaidLabelContrast(block);');
    expect(previewRuntime).toContain('function patchMermaidLabelContrast(block)');
    expect(previewRuntime).toContain('contrastRatio(currentLabelColor, fillColor) >= 4.5');
    expect(previewRuntime).toContain('function pickHighContrastTextColor(background)');
    expect(previewRuntime).toContain('function getMermaidNodeFillColor(node)');
  });

  it('normalizes rendered Mermaid SVG dimensions from the viewBox', () => {
    expect(previewRuntime).toContain('normalizeRenderedMermaidSvgSizing(block);');
    expect(previewRuntime).toContain("svg.setAttribute('width', String(viewBox.width));");
    expect(previewRuntime).toContain("svg.setAttribute('height', String(viewBox.height));");
    expect(previewRuntime).toContain("svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');");
  });
});
