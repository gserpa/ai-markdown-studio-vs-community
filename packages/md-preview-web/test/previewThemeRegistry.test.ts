import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildPreviewThemeStylesheet,
  buildPreviewThemeCssArtifact,
  getPreviewThemeTokenContract,
  loadPreviewThemeRegistry,
  loadPreviewThemeRegistryFromData,
  loadPreviewThemeRegistryFromDirectories,
  resolvePreviewThemeSelection,
} from '../src/presentation/previewThemeRegistry';

describe('previewThemeRegistry', () => {
  const registry = loadPreviewThemeRegistry(path.resolve(__dirname, '..', 'assets', 'themes'));

  it('loads theme files from the preview theme folder', () => {
    expect([...registry.themes.keys()]).toEqual(expect.arrayContaining(['black', 'galaxy', 'modern-blue', 'midnight-delivery']));
    expect(registry.defaultDarkThemeName).toBe('galaxy');
    expect(registry.defaultLightThemeName).toBe('modern-blue');
  });

  it('resolves explicit and auto preview theme selections', () => {
    const galaxySelection = resolvePreviewThemeSelection('galaxy', registry);
    const modernBlueSelection = resolvePreviewThemeSelection('modern-blue', registry);
    const autoSelection = resolvePreviewThemeSelection('', registry);

    expect(galaxySelection.themeName).toBe('galaxy');
    expect(galaxySelection.themeClassName).toBe('presentation-theme-galaxy');
    expect(galaxySelection.lightMermaidTheme).toBe('dark');
    expect(galaxySelection.darkMermaidTheme).toBe('dark');
    expect(galaxySelection.lightMermaidTransparentBackground).toBe(true);
    expect(galaxySelection.darkMermaidTransparentBackground).toBe(true);
    expect(modernBlueSelection.themeName).toBe('modern-blue');
    expect(modernBlueSelection.lightMermaidTheme).toBe('default');
    expect(modernBlueSelection.darkMermaidTheme).toBe('default');
    expect(autoSelection.themeName).toBe('auto');
    expect(autoSelection.lightMermaidTheme).toBe('default');
    expect(autoSelection.darkMermaidTheme).toBe('dark');
    expect(autoSelection.lightMermaidTransparentBackground).toBe(false);
    expect(autoSelection.darkMermaidTransparentBackground).toBe(true);

    const blackSelection = resolvePreviewThemeSelection('black', registry);
    expect(blackSelection.themeName).toBe('black');
    expect(blackSelection.themeClassName).toBe('presentation-theme-black');
  });

  it('builds theme CSS selectors for explicit themes and auto mode defaults', () => {
    const stylesheet = buildPreviewThemeStylesheet(registry);

    expect(stylesheet).toContain('.presentation-preview.presentation-theme-galaxy');
    expect(stylesheet).toContain('.presentation-preview.presentation-theme-modern-blue');
    expect(stylesheet).toContain('body.vscode-dark .presentation-preview.presentation-theme-auto');
    expect(stylesheet).toContain('body:not(.vscode-dark):not(.vscode-high-contrast) .presentation-preview.presentation-theme-auto');
    expect(stylesheet).toContain('--presentation-link-color: #93c5fd;');
  });

  it('builds only the requested presentation theme artifact', () => {
    const selected = buildPreviewThemeCssArtifact(registry, 'modern-blue');
    expect(selected.css).toContain('[data-md-preview-root].presentation-preview.presentation-theme-modern-blue');
    expect(selected.css).not.toContain('presentation-theme-galaxy');
    expect(selected).toEqual(buildPreviewThemeCssArtifact(registry, 'modern-blue'));
  });

  it('clears light-only tokens when auto switches to the dark theme', () => {
    const css = buildPreviewThemeCssArtifact(registry, 'auto').css;
    const darkRules = css.slice(css.indexOf("[data-md-host-scheme='dark']"));
    expect(darkRules).toContain('--presentation-table-cell-color: initial;');
    expect(darkRules).toContain('--presentation-body-color: #e5e7eb;');
  });

  it('loads multiple theme directories and lets later directories override earlier ones', () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mfo-preview-themes-'));
    const customThemePath = path.join(tempDirectory, 'galaxy.json');

    fs.writeFileSync(customThemePath, JSON.stringify({
      name: 'galaxy',
      label: 'Galaxy Override',
      defaultForModes: ['dark'],
      mermaidTheme: 'forest',
      mermaidTransparentBackground: true,
      tokens: {
        '--presentation-link-color': '#ff6600',
      },
    }), 'utf8');

    const mergedRegistry = loadPreviewThemeRegistryFromDirectories([
      path.resolve(__dirname, '..', 'assets', 'themes'),
      tempDirectory,
    ]);

    expect(mergedRegistry.themes.get('galaxy')?.label).toBe('Galaxy Override');
    expect(mergedRegistry.themes.get('galaxy')?.mermaidTheme).toBe('forest');
    expect(mergedRegistry.themes.get('galaxy')?.mermaidTransparentBackground).toBe(true);
    expect(mergedRegistry.themes.get('galaxy')?.tokens['--presentation-link-color']).toBe('#ff6600');
  });

  it('exposes a grouped presentation token contract', () => {
    const contract = getPreviewThemeTokenContract();

    expect(contract.palette).toContain('--presentation-link-color');
    expect(contract.surfaces).toContain('--presentation-surface-bg');
    expect(contract.media).toContain('--presentation-media-frame-bg');
    expect(contract.code).toContain('--presentation-code-keyword-color');
    expect(contract.hover).toContain('--presentation-hover-border');
    expect(contract.tables).toContain('--presentation-table-header-bg');
    expect(contract.blockquotes).toContain('--presentation-blockquote-border');
  });

  it('loads Midnight Delivery as an explicit dark theme without changing auto defaults', () => {
    const theme = registry.themes.get('midnight-delivery')!;
    const selected = resolvePreviewThemeSelection('midnight-delivery', registry);
    const css = buildPreviewThemeCssArtifact(registry, selected.themeName).css;
    expect(registry.warnings.filter(warning => warning.includes('midnight-delivery'))).toEqual([]);
    expect(theme.tokens['--presentation-surface-bg']).toBe('#0A1240');
    expect(theme.tokens['--presentation-component-warning']).toBe('#F6AD3C');
    expect(theme.tokens['--presentation-heading-font']).toContain('Inter');
    expect(theme.layouts?.brief).toEqual({ variant: 'header-body', slots: { label: 'above-title', subtitle: 'below-title' } });
    expect(selected.lightMermaidTheme).toBe('dark');
    expect(selected.darkMermaidTheme).toBe('dark');
    expect(css).toContain('presentation-theme-midnight-delivery');
    expect(css).toContain('color-scheme: dark;');
    expect(css).toContain('--presentation-component-danger: #F0566B;');
    expect(registry.defaultDarkThemeName).toBe('galaxy');
    expect(registry.defaultLightThemeName).toBe('modern-blue');
  });

  it('rejects invalid component colors and unsafe font stacks', () => {
    const validated = loadPreviewThemeRegistryFromData([{
      name: 'custom',
      tokens: {
        '--presentation-component-success': 'url(https://example.invalid/color)',
        '--presentation-component-warning': '#12',
        '--presentation-heading-font': "Inter; background: red",
        '--presentation-body-font': 'Inter, Arial, sans-serif',
      },
    }]);
    const tokens = validated.themes.get('custom')!.tokens;
    expect(tokens['--presentation-body-font']).toBe('Inter, Arial, sans-serif');
    expect(tokens['--presentation-heading-font']).toBeUndefined();
    expect(tokens['--presentation-component-success']).toBeUndefined();
    expect(tokens['--presentation-component-warning']).toBeUndefined();
    expect(validated.warnings).toHaveLength(3);
  });

  it('filters unsupported presentation tokens and returns warnings', () => {
    const registryWithWarnings = loadPreviewThemeRegistryFromData([
      {
        name: 'custom-presentation',
        defaultForModes: ['light'],
        tokens: {
          '--presentation-link-color': '#1144aa',
          '--presentation-unsupported-token': '#ffffff',
        },
      },
    ]);

    expect(registryWithWarnings.warnings).toHaveLength(1);
    expect(registryWithWarnings.warnings[0]).toContain('unsupported token');
    expect(registryWithWarnings.warnings[0]).toContain('--presentation-unsupported-token');

    const stylesheet = buildPreviewThemeStylesheet(registryWithWarnings);
    expect(stylesheet).toContain('--presentation-link-color: #1144aa;');
    expect(stylesheet).not.toContain('--presentation-unsupported-token');
  });
});
