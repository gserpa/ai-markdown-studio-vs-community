import * as fs from 'node:fs';
import * as path from 'node:path';

export type DocumentThemeMode = 'dark' | 'light';

export type DocumentThemeDefinition = {
  name: string;
  label?: string;
  extends?: string;
  aliases: string[];
  defaultForModes: DocumentThemeMode[];
  mermaidTheme?: string;
  mermaidTransparentBackground?: boolean;
  tokens: Record<string, string>;
};

export type ResolvedDocumentTheme = {
  name: string;
  label: string;
  aliases: string[];
  defaultForModes: DocumentThemeMode[];
  mermaidTheme: string;
  mermaidTransparentBackground: boolean;
  tokens: Record<string, string>;
};

export type DocumentThemeRegistry = {
  themes: Map<string, ResolvedDocumentTheme>;
  aliases: Map<string, string>;
  defaultDarkThemeName: string;
  defaultLightThemeName: string;
  warnings: string[];
};

export type DocumentThemeSelection = {
  themeName: string;
  themeClassName: string;
  themeMode: DocumentThemeMode | 'auto';
  lightMermaidTheme: string;
  darkMermaidTheme: string;
  lightMermaidTransparentBackground: boolean;
  darkMermaidTransparentBackground: boolean;
};

const FALLBACK_DARK_THEME_NAME = 'dark';
const FALLBACK_LIGHT_THEME_NAME = 'light';

type RawDocumentThemeDefinition = {
  name?: unknown;
  label?: unknown;
  extends?: unknown;
  aliases?: unknown;
  defaultForModes?: unknown;
  mermaidTheme?: unknown;
  mermaidTransparentBackground?: unknown;
  tokens?: unknown;
};

const DOCUMENT_THEME_TOKEN_GROUPS = {
  page: [
    '--md-preview-body-font',
    '--md-preview-code-font',
    '--md-preview-base-font-size',
    '--md-preview-line-height',
    '--md-preview-body-color',
    '--md-preview-border-color',
    '--md-preview-muted-color',
    '--md-preview-link-color',
    '--md-preview-link-hover-color',
  ],
  content: [
    '--md-preview-content-bg',
    '--md-preview-content-border',
    '--md-preview-content-shadow',
    '--md-preview-content-radius',
    '--md-preview-content-padding-block',
    '--md-preview-content-padding-inline',
  ],
  headings: [
    '--md-preview-heading-font',
    '--md-preview-heading-color',
    '--md-preview-heading-surface-color',
    '--md-preview-heading-surface-color-h1',
    '--md-preview-heading-surface-color-h2',
    '--md-preview-heading-divider-color',
    '--md-preview-heading-divider-color-h1',
    '--md-preview-heading-divider-color-h2',
    '--md-preview-heading-radius',
    '--md-preview-heading-radius-h1',
    '--md-preview-heading-radius-h2',
    '--md-preview-heading-padding-block',
    '--md-preview-heading-padding-block-h1',
    '--md-preview-heading-padding-block-h2',
    '--md-preview-heading-padding-inline',
    '--md-preview-heading-padding-inline-h1',
    '--md-preview-heading-padding-inline-h2',
    '--md-preview-heading-shadow',
    '--md-preview-heading-shadow-h1',
    '--md-preview-heading-shadow-h2',
    '--md-preview-heading-offset-inline-h1',
    '--md-preview-heading-offset-inline-h2',
    '--md-preview-heading-bg-h1',
    '--md-preview-heading-bg-h2',
    '--md-preview-heading-bg-h3',
    '--md-preview-heading-bg-h4',
    '--md-preview-heading-bg-h5',
    '--md-preview-heading-bg-h6',
    '--md-preview-subheading-divider-width',
    '--md-preview-subheading-divider-width-h3',
    '--md-preview-subheading-divider-width-h4',
    '--md-preview-subheading-divider-width-h5',
    '--md-preview-subheading-divider-width-h6',
    '--md-preview-subheading-divider-color',
    '--md-preview-subheading-divider-color-h3',
    '--md-preview-subheading-divider-color-h4',
    '--md-preview-subheading-divider-color-h5',
    '--md-preview-subheading-divider-color-h6',
  ],
  blockquotes: [
    '--md-preview-blockquote-border',
    '--md-preview-blockquote-color',
    '--md-preview-blockquote-bg',
    '--md-preview-blockquote-nested-bg',
  ],
  tables: [
    '--md-preview-table-border',
    '--md-preview-table-bg',
    '--md-preview-table-shadow',
    '--md-preview-table-cell-border',
    '--md-preview-table-header-color',
    '--md-preview-table-header-bg',
    '--md-preview-table-cell-color',
    '--md-preview-table-row-bg',
    '--md-preview-table-row-alt-bg',
    '--md-preview-table-row-hover-bg',
    '--md-preview-table-strong-color',
  ],
  code: [
    '--md-preview-code-bg',
    '--md-preview-code-color',
    '--md-preview-code-comment-color',
    '--md-preview-code-keyword-color',
    '--md-preview-code-number-color',
    '--md-preview-code-string-color',
    '--md-preview-code-title-color',
    '--md-preview-code-type-color',
    '--md-preview-code-attribute-color',
    '--md-preview-code-meta-color',
    '--md-preview-code-symbol-color',
    '--md-preview-code-addition-color',
    '--md-preview-code-addition-bg',
    '--md-preview-code-deletion-color',
    '--md-preview-code-deletion-bg',
  ],
  hover: [
    '--md-preview-hover-accent',
    '--md-preview-hover-bg',
    '--md-preview-hover-bg-soft',
    '--md-preview-hover-border',
  ],
  lightbox: [
    '--md-preview-lightbox-backdrop-bg',
    '--md-preview-lightbox-border',
    '--md-preview-lightbox-bg',
    '--md-preview-lightbox-shadow',
    '--md-preview-lightbox-button-border',
    '--md-preview-lightbox-button-color',
    '--md-preview-lightbox-button-bg',
    '--md-preview-lightbox-button-hover-bg',
    '--md-preview-lightbox-zoom-color',
    '--md-preview-lightbox-viewport-bg',
  ],
} as const;

const DOCUMENT_THEME_ALLOWED_TOKENS = new Set<string>(
  Object.values(DOCUMENT_THEME_TOKEN_GROUPS).flatMap((groupTokens) => groupTokens),
);

export function getDocumentThemeTokenContract(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(DOCUMENT_THEME_TOKEN_GROUPS)
      .map(([groupName, groupTokens]) => [groupName, [...groupTokens]]),
  );
}

export function loadDocumentThemeRegistryFromDirectories(themeDirectoryPaths: string[]): DocumentThemeRegistry {
  const definitions: DocumentThemeDefinition[] = [];
  const warnings: string[] = [];

  for (const themeDirectoryPath of themeDirectoryPaths) {
    const result = readDocumentThemeDefinitions(themeDirectoryPath);
    definitions.push(...result.definitions);
    warnings.push(...result.warnings);
  }

  const registry = buildDocumentThemeRegistry(definitions);
  return {
    ...registry,
    warnings: [...registry.warnings, ...warnings],
  };
}

export function loadDocumentThemeRegistryFromData(rawDefinitions: RawDocumentThemeDefinition[]): DocumentThemeRegistry {
  const definitions: DocumentThemeDefinition[] = [];
  const warnings: string[] = [];
  for (const raw of rawDefinitions) {
    const normalized = normalizeDocumentThemeDefinition(raw);
    warnings.push(...normalized.warnings);
    const definition = normalized.definition;
    if (definition) {
      definitions.push(definition);
    }
  }

  const registry = buildDocumentThemeRegistry(definitions);
  return {
    ...registry,
    warnings: [...registry.warnings, ...warnings],
  };
}

function buildDocumentThemeRegistry(definitions: DocumentThemeDefinition[]): DocumentThemeRegistry {
  const rawDefinitions = new Map<string, DocumentThemeDefinition>();

  for (const definition of definitions) {
    rawDefinitions.set(definition.name, definition);
  }

  const resolvedThemes = new Map<string, ResolvedDocumentTheme>();
  const visited = new Set<string>();

  const resolveTheme = (themeName: string): ResolvedDocumentTheme | undefined => {
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

    const resolvedTheme: ResolvedDocumentTheme = {
      name: definition.name,
      label: definition.label ?? humanizeThemeName(definition.name),
      aliases: uniqueStrings(definition.aliases),
      defaultForModes: [...definition.defaultForModes],
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

export function buildDocumentThemeStylesheet(registry: DocumentThemeRegistry): string {
  const sections: string[] = [];

  for (const theme of [...registry.themes.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    sections.push([
      `body.document-theme-${toCssClassToken(theme.name)} {`,
      serializeThemeTokens(theme.tokens),
      '}',
    ].join('\n'));
  }

  const darkAutoTheme = registry.themes.get(registry.defaultDarkThemeName);
  if (darkAutoTheme) {
    sections.push([
      'body.vscode-dark.document-theme-auto,',
      'body.vscode-high-contrast.document-theme-auto {',
      serializeThemeTokens(darkAutoTheme.tokens),
      '}',
    ].join('\n'));
  }

  const lightAutoTheme = registry.themes.get(registry.defaultLightThemeName);
  if (lightAutoTheme) {
    sections.push([
      'body:not(.vscode-dark):not(.vscode-high-contrast).document-theme-auto {',
      serializeThemeTokens(lightAutoTheme.tokens),
      '}',
    ].join('\n'));
  }

  return sections.join('\n\n');
}

export function resolveDocumentThemeSelection(themeName: string, registry: DocumentThemeRegistry): DocumentThemeSelection {
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
    themeClassName: `document-theme-${toCssClassToken(theme.name)}`,
    themeMode: resolveExplicitDocumentThemeMode(theme),
    // For a pinned (non-auto) theme the CSS class forces a fixed background regardless of VS Code's
    // dark/light mode, so the mermaid theme must always match the theme — not the VS Code mode.
    lightMermaidTheme: theme.mermaidTheme,
    darkMermaidTheme: theme.mermaidTheme,
    lightMermaidTransparentBackground: theme.mermaidTransparentBackground,
    darkMermaidTransparentBackground: theme.mermaidTransparentBackground,
  };
}

function createAutoThemeSelection(registry: DocumentThemeRegistry): DocumentThemeSelection {
  const darkTheme = registry.themes.get(registry.defaultDarkThemeName);
  const lightTheme = registry.themes.get(registry.defaultLightThemeName);

  return {
    themeName: 'auto',
    themeClassName: 'document-theme-auto',
    themeMode: 'auto',
    lightMermaidTheme: lightTheme?.mermaidTheme ?? 'default',
    darkMermaidTheme: darkTheme?.mermaidTheme ?? 'dark',
    lightMermaidTransparentBackground: lightTheme?.mermaidTransparentBackground ?? false,
    darkMermaidTransparentBackground: darkTheme?.mermaidTransparentBackground ?? false,
  };
}

function resolveExplicitDocumentThemeMode(theme: ResolvedDocumentTheme): DocumentThemeMode {
  if (theme.defaultForModes.includes('dark') && !theme.defaultForModes.includes('light')) {
    return 'dark';
  }

  if (theme.defaultForModes.includes('light') && !theme.defaultForModes.includes('dark')) {
    return 'light';
  }

  return theme.mermaidTheme === 'dark' ? 'dark' : 'light';
}

function readDocumentThemeDefinitions(themeDirectoryPath: string): {
  definitions: DocumentThemeDefinition[];
  warnings: string[];
} {
  const warnings: string[] = [];

  if (!themeDirectoryPath || !fs.existsSync(themeDirectoryPath)) {
    return {
      definitions: [],
      warnings,
    };
  }

  let entries: fs.Dirent[] = [];

  try {
    entries = fs.readdirSync(themeDirectoryPath, { withFileTypes: true })
      .filter((entry: fs.Dirent) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
      .sort((a: fs.Dirent, b: fs.Dirent) => a.name.localeCompare(b.name));
  } catch {
    return {
      definitions: [],
      warnings,
    };
  }

  const definitions: DocumentThemeDefinition[] = [];

  for (const entry of entries) {
    const filePath = path.join(themeDirectoryPath, entry.name);

    try {
      const rawText = fs.readFileSync(filePath, 'utf8');
      const rawDefinition = JSON.parse(rawText) as RawDocumentThemeDefinition;
      const normalized = normalizeDocumentThemeDefinition(rawDefinition);
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

function normalizeDocumentThemeDefinition(rawDefinition: RawDocumentThemeDefinition): {
  definition: DocumentThemeDefinition | undefined;
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
    if (!tokenName.startsWith('--md-preview-')) {
      continue;
    }

    if (!DOCUMENT_THEME_ALLOWED_TOKENS.has(tokenName)) {
      warnings.push(`Document theme "${themeName}" uses unsupported token "${tokenName}". It will be ignored.`);
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

function serializeThemeTokens(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
}

function selectDefaultThemeName(
  definitions: DocumentThemeDefinition[],
  resolvedThemes: Map<string, ResolvedDocumentTheme>,
  mode: DocumentThemeMode,
  fallback: string,
): string {
  for (const definition of definitions) {
    if (definition.defaultForModes.includes(mode) && resolvedThemes.has(definition.name)) {
      return definition.name;
    }
  }

  return fallback;
}

function normalizeThemeName(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeThemeModes(value: unknown): DocumentThemeMode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is DocumentThemeMode => item === 'dark' || item === 'light');
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function toCssClassToken(name: string): string {
  return name.replace(/[^a-z0-9-]/g, '-');
}

function humanizeThemeName(name: string): string {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
