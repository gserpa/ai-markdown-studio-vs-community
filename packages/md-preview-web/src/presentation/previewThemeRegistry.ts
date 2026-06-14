import * as fs from 'node:fs';
import * as path from 'node:path';

export type PreviewThemeMode = 'dark' | 'light';

export type PreviewThemeDefinition = {
  name: string;
  label?: string;
  extends?: string;
  aliases: string[];
  defaultForModes: PreviewThemeMode[];
  mermaidTheme?: string;
  mermaidTransparentBackground?: boolean;
  tokens: Record<string, string>;
};

export type ResolvedPreviewTheme = {
  name: string;
  label: string;
  aliases: string[];
  mermaidTheme: string;
  mermaidTransparentBackground: boolean;
  tokens: Record<string, string>;
};

export type PreviewThemeRegistry = {
  themes: Map<string, ResolvedPreviewTheme>;
  aliases: Map<string, string>;
  defaultDarkThemeName: string;
  defaultLightThemeName: string;
  warnings: string[];
};

export type PreviewThemeSelection = {
  themeName: string;
  themeClassName: string;
  lightMermaidTheme: string;
  darkMermaidTheme: string;
  lightMermaidTransparentBackground: boolean;
  darkMermaidTransparentBackground: boolean;
};

const FALLBACK_DARK_THEME_NAME = 'galaxy';
const FALLBACK_LIGHT_THEME_NAME = 'modern-blue';

type RawPreviewThemeDefinition = {
  name?: unknown;
  label?: unknown;
  extends?: unknown;
  aliases?: unknown;
  defaultForModes?: unknown;
  mermaidTheme?: unknown;
  mermaidTransparentBackground?: unknown;
  tokens?: unknown;
};

const PRESENTATION_THEME_DIRECTORY_NAME = 'presentation';

const PREVIEW_THEME_TOKEN_GROUPS = {
  palette: [
    '--presentation-accent',
    '--presentation-accent-soft',
    '--presentation-contrast',
    '--presentation-body-color',
    '--presentation-muted-color',
    '--presentation-emphasis-color',
    '--presentation-link-color',
    '--presentation-title-color',
  ],
  surfaces: [
    '--presentation-body-bg',
    '--presentation-body-border',
    '--presentation-panel-bg',
    '--presentation-panel-bg-soft',
    '--presentation-panel-border',
    '--presentation-pill-bg',
    '--presentation-pill-border',
    '--presentation-pill-color',
    '--presentation-standard-content-bg',
    '--presentation-standard-header-bg',
    '--presentation-surface-bg',
    '--presentation-surface-border',
    '--presentation-surface-shadow',
  ],
  media: [
    '--presentation-media-bg',
    '--presentation-media-frame-bg',
    '--presentation-cover-caption-bg',
    '--presentation-cover-caption-border',
    '--presentation-divider-overlay-bg',
  ],
  code: [
    '--presentation-inline-code-bg',
    '--presentation-inline-code-border',
    '--presentation-inline-code-color',
    '--presentation-code-bg',
    '--presentation-code-border',
    '--presentation-code-text-color',
    '--presentation-code-hover-accent',
    '--presentation-code-hover-bg',
    '--presentation-code-hover-border',
    '--presentation-code-comment-color',
    '--presentation-code-keyword-color',
    '--presentation-code-number-color',
    '--presentation-code-string-color',
    '--presentation-code-title-color',
    '--presentation-code-type-color',
    '--presentation-code-meta-color',
  ],
  hover: [
    '--presentation-hover-accent',
    '--presentation-hover-bg',
    '--presentation-hover-bg-soft',
    '--presentation-hover-border',
  ],
  tables: [
    '--presentation-table-bg',
    '--presentation-table-border',
    '--presentation-table-header-bg',
    '--presentation-table-header-color',
    '--presentation-table-cell-bg',
    '--presentation-table-cell-color',
    '--presentation-table-row-alt-bg',
  ],
  blockquotes: [
    '--presentation-blockquote-bg',
    '--presentation-blockquote-border',
  ],
} as const;

const PREVIEW_THEME_ALLOWED_TOKENS = new Set<string>(
  Object.values(PREVIEW_THEME_TOKEN_GROUPS).flatMap((groupTokens) => groupTokens),
);

export function getPreviewThemeTokenContract(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(PREVIEW_THEME_TOKEN_GROUPS)
      .map(([groupName, groupTokens]) => [groupName, [...groupTokens]]),
  );
}

export function loadPreviewThemeRegistry(themeDirectoryPath: string): PreviewThemeRegistry {
  const result = readPreviewThemeDefinitions(themeDirectoryPath);
  const registry = buildPreviewThemeRegistry(result.definitions);
  return {
    ...registry,
    warnings: [...registry.warnings, ...result.warnings],
  };
}

export function loadPreviewThemeRegistryFromDirectories(themeDirectoryPaths: string[]): PreviewThemeRegistry {
  const definitions: PreviewThemeDefinition[] = [];
  const warnings: string[] = [];

  for (const themeDirectoryPath of themeDirectoryPaths) {
    const result = readPreviewThemeDefinitions(themeDirectoryPath);
    definitions.push(...result.definitions);
    warnings.push(...result.warnings);
  }

  const registry = buildPreviewThemeRegistry(definitions);
  return {
    ...registry,
    warnings: [...registry.warnings, ...warnings],
  };
}

export function loadPreviewThemeRegistryFromData(rawDefinitions: RawPreviewThemeDefinition[]): PreviewThemeRegistry {
  const definitions: PreviewThemeDefinition[] = [];
  const warnings: string[] = [];
  for (const raw of rawDefinitions) {
    const normalized = normalizePreviewThemeDefinition(raw);
    warnings.push(...normalized.warnings);
    const definition = normalized.definition;
    if (definition) {
      definitions.push(definition);
    }
  }

  const registry = buildPreviewThemeRegistry(definitions);
  return {
    ...registry,
    warnings: [...registry.warnings, ...warnings],
  };
}

function buildPreviewThemeRegistry(definitions: PreviewThemeDefinition[]): PreviewThemeRegistry {
  const rawDefinitions = new Map<string, PreviewThemeDefinition>();

  for (const definition of definitions) {
    rawDefinitions.set(definition.name, definition);
  }

  const resolvedThemes = new Map<string, ResolvedPreviewTheme>();
  const visited = new Set<string>();

  const resolveTheme = (themeName: string): ResolvedPreviewTheme | undefined => {
    const cached = resolvedThemes.get(themeName);
    if (cached) {
      return cached;
    }

    const definition = rawDefinitions.get(themeName);
    if (!definition || visited.has(themeName)) {
      return undefined;
    }

    visited.add(themeName);
    const baseTheme = definition.extends ? resolveTheme(definition.extends) : undefined;
    visited.delete(themeName);

    const resolvedTheme: ResolvedPreviewTheme = {
      name: definition.name,
      label: definition.label ?? humanizeThemeName(definition.name),
      aliases: uniqueStrings(definition.aliases),
      mermaidTheme: definition.mermaidTheme ?? baseTheme?.mermaidTheme ?? 'default',
      mermaidTransparentBackground: definition.mermaidTransparentBackground ?? baseTheme?.mermaidTransparentBackground ?? false,
      tokens: {
        ...(baseTheme?.tokens ?? {}),
        ...definition.tokens,
      },
    };

    resolvedThemes.set(themeName, resolvedTheme);
    return resolvedTheme;
  };

  for (const themeName of rawDefinitions.keys()) {
    resolveTheme(themeName);
  }

  const aliases = new Map<string, string>();
  for (const theme of resolvedThemes.values()) {
    for (const alias of theme.aliases) {
      if (!aliases.has(alias)) {
        aliases.set(alias, theme.name);
      }
    }
  }

  return {
    themes: resolvedThemes,
    aliases,
    defaultDarkThemeName: selectDefaultThemeName(definitions, resolvedThemes, 'dark', FALLBACK_DARK_THEME_NAME),
    defaultLightThemeName: selectDefaultThemeName(definitions, resolvedThemes, 'light', FALLBACK_LIGHT_THEME_NAME),
    warnings: [],
  };
}

export function buildPreviewThemeStylesheet(registry: PreviewThemeRegistry): string {
  const sections: string[] = [];

  for (const theme of [...registry.themes.values()].sort((left, right) => left.name.localeCompare(right.name))) {
    sections.push([
      `.presentation-preview.presentation-theme-${toCssClassToken(theme.name)} {`,
      serializeThemeTokens(theme.tokens),
      '}',
    ].join('\n'));
  }

  const darkAutoTheme = registry.themes.get(registry.defaultDarkThemeName);
  if (darkAutoTheme) {
    sections.push([
      'body.vscode-dark .presentation-preview.presentation-theme-auto,',
      'body.vscode-high-contrast .presentation-preview.presentation-theme-auto {',
      serializeThemeTokens(darkAutoTheme.tokens),
      '}',
    ].join('\n'));
  }

  const lightAutoTheme = registry.themes.get(registry.defaultLightThemeName);
  if (lightAutoTheme) {
    sections.push([
      'body:not(.vscode-dark):not(.vscode-high-contrast) .presentation-preview.presentation-theme-auto {',
      serializeThemeTokens(lightAutoTheme.tokens),
      '}',
    ].join('\n'));
  }

  return sections.join('\n\n');
}

export function resolvePreviewThemeSelection(themeName: string, registry: PreviewThemeRegistry): PreviewThemeSelection {
  const normalized = normalizeThemeName(themeName);
  if (!normalized || normalized === 'default' || normalized === 'auto') {
    return createAutoThemeSelection(registry);
  }

  const canonicalThemeName = registry.themes.has(normalized)
    ? normalized
    : registry.aliases.get(normalized);
  const theme = canonicalThemeName
    ? registry.themes.get(canonicalThemeName)
    : undefined;

  if (!theme) {
    return createAutoThemeSelection(registry);
  }

  return {
    themeName: theme.name,
    themeClassName: `presentation-theme-${toCssClassToken(theme.name)}`,
    lightMermaidTheme: theme.mermaidTheme,
    darkMermaidTheme: theme.mermaidTheme,
    lightMermaidTransparentBackground: theme.mermaidTransparentBackground,
    darkMermaidTransparentBackground: theme.mermaidTransparentBackground,
  };
}

function createAutoThemeSelection(registry: PreviewThemeRegistry): PreviewThemeSelection {
  const darkTheme = registry.themes.get(registry.defaultDarkThemeName);
  const lightTheme = registry.themes.get(registry.defaultLightThemeName);

  return {
    themeName: 'auto',
    themeClassName: 'presentation-theme-auto',
    lightMermaidTheme: lightTheme?.mermaidTheme ?? 'default',
    darkMermaidTheme: darkTheme?.mermaidTheme ?? 'dark',
    lightMermaidTransparentBackground: lightTheme?.mermaidTransparentBackground ?? false,
    darkMermaidTransparentBackground: darkTheme?.mermaidTransparentBackground ?? false,
  };
}

function readPreviewThemeDefinitions(themeDirectoryPath: string): {
  definitions: PreviewThemeDefinition[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const resolvedThemeDirectory = resolvePreviewThemeDirectory(themeDirectoryPath);
  if (!resolvedThemeDirectory) {
    return {
      definitions: [],
      warnings,
    };
  }

  let entries: fs.Dirent[] = [];

  try {
    entries = fs.readdirSync(resolvedThemeDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return {
      definitions: [],
      warnings,
    };
  }

  const definitions: PreviewThemeDefinition[] = [];

  for (const entry of entries) {
    const filePath = path.join(resolvedThemeDirectory, entry.name);

    try {
      const rawText = fs.readFileSync(filePath, 'utf8');
      const rawDefinition = JSON.parse(rawText) as RawPreviewThemeDefinition;
      const normalized = normalizePreviewThemeDefinition(rawDefinition);
      warnings.push(...normalized.warnings);
      const definition = normalized.definition;
      if (definition) {
        definitions.push(definition);
      }
    } catch {
      // Ignore malformed theme files so preview rendering can continue with other themes.
    }
  }

  return {
    definitions,
    warnings,
  };
}

function resolvePreviewThemeDirectory(themeDirectoryPath: string): string | undefined {
  if (!themeDirectoryPath || !fs.existsSync(themeDirectoryPath)) {
    return undefined;
  }

  if (hasJsonThemeFiles(themeDirectoryPath)) {
    return themeDirectoryPath;
  }

  const nestedPresentationDirectory = path.join(themeDirectoryPath, PRESENTATION_THEME_DIRECTORY_NAME);
  if (hasJsonThemeFiles(nestedPresentationDirectory)) {
    return nestedPresentationDirectory;
  }

  return undefined;
}

function hasJsonThemeFiles(themeDirectoryPath: string): boolean {
  if (!themeDirectoryPath || !fs.existsSync(themeDirectoryPath)) {
    return false;
  }

  try {
    return fs.readdirSync(themeDirectoryPath, { withFileTypes: true })
      .some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'));
  } catch {
    return false;
  }
}

function normalizePreviewThemeDefinition(rawDefinition: RawPreviewThemeDefinition): {
  definition: PreviewThemeDefinition | undefined;
  warnings: string[];
} {
  const warnings: string[] = [];
  const name = normalizeThemeName(rawDefinition.name);
  if (!name) {
    return {
      definition: undefined,
      warnings,
    };
  }

  const normalizedTokens = normalizeThemeTokens(rawDefinition.tokens, name);
  warnings.push(...normalizedTokens.warnings);

  return {
    definition: {
      name,
      label: typeof rawDefinition.label === 'string' && rawDefinition.label.trim().length > 0
        ? rawDefinition.label.trim()
        : undefined,
      extends: normalizeThemeName(rawDefinition.extends),
      aliases: normalizeStringArray(rawDefinition.aliases),
      defaultForModes: normalizeThemeModes(rawDefinition.defaultForModes),
      mermaidTheme: typeof rawDefinition.mermaidTheme === 'string' && rawDefinition.mermaidTheme.trim().length > 0
        ? rawDefinition.mermaidTheme.trim()
        : undefined,
      mermaidTransparentBackground: typeof rawDefinition.mermaidTransparentBackground === 'boolean'
        ? rawDefinition.mermaidTransparentBackground
        : undefined,
      tokens: normalizedTokens.tokens,
    },
    warnings,
  };
}

function normalizeThemeTokens(value: unknown, themeName: string): {
  tokens: Record<string, string>;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      tokens: {},
      warnings,
    };
  }

  const tokens: Record<string, string> = {};

  for (const [tokenName, tokenValue] of Object.entries(value)) {
    if (!tokenName.startsWith('--presentation-')) {
      continue;
    }

    if (!PREVIEW_THEME_ALLOWED_TOKENS.has(tokenName)) {
      warnings.push(`Presentation theme "${themeName}" uses unsupported token "${tokenName}". It will be ignored.`);
      continue;
    }

    if (typeof tokenValue !== 'string' || tokenValue.trim().length === 0) {
      continue;
    }

    tokens[tokenName] = tokenValue.trim();
  }

  return {
    tokens,
    warnings,
  };
}

function normalizeThemeModes(value: unknown): PreviewThemeMode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const modes = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is PreviewThemeMode => entry === 'dark' || entry === 'light');

  return uniqueStrings(modes) as PreviewThemeMode[];
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => normalizeThemeName(entry))
    .filter((entry): entry is string => Boolean(entry)));
}

function selectDefaultThemeName(
  definitions: PreviewThemeDefinition[],
  resolvedThemes: Map<string, ResolvedPreviewTheme>,
  mode: PreviewThemeMode,
  fallbackThemeName: string,
): string {
  let selectedThemeName = '';

  for (const definition of definitions) {
    if (definition.defaultForModes.includes(mode) && resolvedThemes.has(definition.name)) {
      selectedThemeName = definition.name;
    }
  }

  if (selectedThemeName) {
    return selectedThemeName;
  }

  if (resolvedThemes.has(fallbackThemeName)) {
    return fallbackThemeName;
  }

  return resolvedThemes.values().next().value?.name ?? fallbackThemeName;
}

function serializeThemeTokens(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
    .map(([tokenName, tokenValue]) => `  ${tokenName}: ${tokenValue};`)
    .join('\n');
}

function normalizeThemeName(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : '';
}

function toCssClassToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '') || 'auto';
}

function humanizeThemeName(name: string): string {
  return name
    .split(/[-_\s]+/u)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
