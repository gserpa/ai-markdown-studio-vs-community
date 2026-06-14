import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildDocumentThemeStylesheet,
  getDocumentThemeTokenContract,
  loadDocumentThemeRegistryFromData,
  loadDocumentThemeRegistryFromDirectories,
  resolveDocumentThemeSelection,
} from '../src/document/documentThemeRegistry';

const CODE_COLOR_DEFAULTS = {
  '--md-preview-code-comment-color': '#6e7781',
  '--md-preview-code-keyword-color': '#cf222e',
  '--md-preview-code-number-color': '#0550ae',
  '--md-preview-code-string-color': '#0a3069',
  '--md-preview-code-title-color': '#8250df',
  '--md-preview-code-type-color': '#953800',
  '--md-preview-code-attribute-color': '#116329',
  '--md-preview-code-meta-color': '#1f6feb',
  '--md-preview-code-symbol-color': '#bc4c00',
} as const;

describe('documentThemeRegistry', () => {
  const registry = loadDocumentThemeRegistryFromDirectories([
    path.resolve(__dirname, '..', 'assets', 'themes', 'document'),
  ]);

  it('resolves explicit and auto document theme selections with the correct mode', () => {
    const lightSelection = resolveDocumentThemeSelection('light', registry);
    const darkSelection = resolveDocumentThemeSelection('dark', registry);
    const autoSelection = resolveDocumentThemeSelection('', registry);

    expect(lightSelection.themeName).toBe('light');
    expect(lightSelection.themeClassName).toBe('document-theme-light');
    expect(lightSelection.themeMode).toBe('light');
    expect(lightSelection.lightMermaidTheme).toBe('default');
    expect(lightSelection.darkMermaidTheme).toBe('default');

    expect(darkSelection.themeName).toBe('dark');
    expect(darkSelection.themeClassName).toBe('document-theme-dark');
    expect(darkSelection.themeMode).toBe('dark');
    expect(darkSelection.lightMermaidTheme).toBe('dark');
    expect(darkSelection.darkMermaidTheme).toBe('dark');
    expect(darkSelection.lightMermaidTransparentBackground).toBe(true);
    expect(darkSelection.darkMermaidTransparentBackground).toBe(true);

    expect(autoSelection.themeName).toBe('auto');
    expect(autoSelection.themeClassName).toBe('document-theme-auto');
    expect(autoSelection.themeMode).toBe('auto');
    expect(autoSelection.lightMermaidTheme).toBe('default');
    expect(autoSelection.darkMermaidTheme).toBe('dark');
    expect(autoSelection.lightMermaidTransparentBackground).toBe(false);
    expect(autoSelection.darkMermaidTransparentBackground).toBe(true);
  });

  it('builds explicit and auto document theme selectors', () => {
    const stylesheet = buildDocumentThemeStylesheet(registry);

    expect(stylesheet).toContain('body.document-theme-light {');
    expect(stylesheet).toContain('body.document-theme-dark {');
    expect(stylesheet).toContain('body.vscode-dark.document-theme-auto,');
    expect(stylesheet).toContain('body:not(.vscode-dark):not(.vscode-high-contrast).document-theme-auto {');
    expect(stylesheet).toContain('--md-preview-content-bg: #ffffff;');
    expect(stylesheet).toContain('--md-preview-content-bg: #111111;');
    expect(stylesheet).not.toContain('--md-preview-page-bg-image:');
    expect(stylesheet).toContain('--md-preview-code-bg: #161b22;');
  });

  it('exposes a grouped document token contract', () => {
    const contract = getDocumentThemeTokenContract();

    expect(contract.page).not.toContain('--md-preview-page-bg-image');
    expect(contract.content).toContain('--md-preview-content-padding-inline');
    expect(contract.headings).toContain('--md-preview-heading-font');
    expect(contract.headings).toContain('--md-preview-heading-bg-h1');
    expect(contract.tables).toContain('--md-preview-table-row-hover-bg');
    expect(contract.blockquotes).toContain('--md-preview-blockquote-nested-bg');
    expect(contract.code).toContain('--md-preview-code-keyword-color');
    expect(contract.hover).toContain('--md-preview-hover-border');
    expect(contract.lightbox).toContain('--md-preview-lightbox-viewport-bg');
  });

  it('keeps light document code tokens readable against code backgrounds', () => {
    const failures: string[] = [];

    for (const theme of registry.themes.values()) {
      const selection = resolveDocumentThemeSelection(theme.name, registry);
      if (selection.themeMode !== 'light') {
        continue;
      }

      const codeBg = parseHexColor(theme.tokens['--md-preview-code-bg']);
      if (!codeBg) {
        continue;
      }

      const codeColorTokens = {
        '--md-preview-code-color': theme.tokens['--md-preview-code-color'],
        ...CODE_COLOR_DEFAULTS,
        ...theme.tokens,
      };

      for (const [tokenName, tokenValue] of Object.entries(codeColorTokens)) {
        if (!tokenName.startsWith('--md-preview-code') || !tokenName.endsWith('color')) {
          continue;
        }

        if (tokenName === '--md-preview-code-addition-color' || tokenName === '--md-preview-code-deletion-color') {
          continue;
        }

        const foreground = parseHexColor(tokenValue);
        if (!foreground) {
          continue;
        }

        const contrast = contrastRatio(foreground, codeBg);
        if (contrast < 4.5) {
          failures.push(`${theme.name} ${tokenName} ${tokenValue} on ${theme.tokens['--md-preview-code-bg']} = ${contrast.toFixed(2)}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('filters unsupported tokens and returns warnings', () => {
    const customRegistry = loadDocumentThemeRegistryFromData([
      {
        name: 'custom-light',
        defaultForModes: ['light'],
        tokens: {
          '--md-preview-body-color': '#112233',
          '--md-preview-unknown-token': '#ffffff',
        },
      },
    ]);

    expect(customRegistry.warnings).toHaveLength(1);
    expect(customRegistry.warnings[0]).toContain('unsupported token');
    expect(customRegistry.warnings[0]).toContain('--md-preview-unknown-token');

    const stylesheet = buildDocumentThemeStylesheet(customRegistry);
    expect(stylesheet).toContain('--md-preview-body-color: #112233;');
    expect(stylesheet).not.toContain('--md-preview-unknown-token');
  });
});

type Rgb = [number, number, number];

function parseHexColor(value: string | undefined): Rgb | undefined {
  const match = /^#([0-9a-f]{6})$/iu.exec(value ?? '');
  if (!match) {
    return undefined;
  }

  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map((channel) => (
    channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));

  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}
