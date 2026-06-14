import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptFilePath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptFilePath);
const repoRoot = path.resolve(scriptDirectory, '..');

const rootPackageJsonPath = path.join(repoRoot, 'package.json');
const packageJsonPath = path.join(repoRoot, 'apps', 'ai-markdown-studio-vs-community', 'package.json');
const commandMetadataPath = path.join(repoRoot, 'apps', 'ai-markdown-studio-vs-community', 'config', 'command-metadata.json');
const generatedCommandEntriesPath = path.join(repoRoot, 'apps', 'ai-markdown-studio-vs-community', 'src', 'commands', 'generatedCommandEntries.ts');
const bundledDocumentThemeDirectory = path.join(repoRoot, 'packages', 'md-preview-web', 'assets', 'themes', 'document');

const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const commandMetadata = readCommandMetadata();
const documentThemes = readThemeMetadata(bundledDocumentThemeDirectory);

syncPackageJson(rootPackageJson, packageJson, commandMetadata, documentThemes);
syncGeneratedCommandEntries(commandMetadata);

function readCommandMetadata() {
  const raw = JSON.parse(readFileSync(commandMetadataPath, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error('apps/ai-markdown-studio-vs-community/config/command-metadata.json must contain an array.');
  }

  return raw.map((entry) => normalizeCommandMetadata(entry));
}

function normalizeCommandMetadata(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Each command metadata entry must be an object.');
  }

  const { command, title, category, icon, quickPickTitle } = entry;
  if (typeof command !== 'string' || command.trim().length === 0) {
    throw new Error('Command metadata entry is missing a valid command id.');
  }

  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error(`Command ${command} is missing a valid title.`);
  }

  if (typeof category !== 'string' || category.trim().length === 0) {
    throw new Error(`Command ${command} is missing a valid category.`);
  }

  if (quickPickTitle !== undefined && (typeof quickPickTitle !== 'string' || quickPickTitle.trim().length === 0)) {
    throw new Error(`Command ${command} has an invalid quickPickTitle.`);
  }

  if (icon !== undefined && !isValidIcon(icon)) {
    throw new Error(`Command ${command} has an invalid icon definition.`);
  }

  return {
    command,
    title,
    category,
    icon,
    quickPickTitle,
  };
}

function isValidIcon(icon) {
  if (typeof icon === 'string') {
    return true;
  }

  if (!icon || typeof icon !== 'object') {
    return false;
  }

  return typeof icon.light === 'string' && typeof icon.dark === 'string';
}

function readThemeMetadata(themeDirectoryPath) {
  return readdirSync(themeDirectoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => JSON.parse(readFileSync(path.join(themeDirectoryPath, entry.name), 'utf8')))
    .map((definition) => normalizeThemeMetadata(definition))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function normalizeThemeMetadata(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new Error('Theme definition must be an object.');
  }

  const name = typeof definition.name === 'string' ? definition.name.trim() : '';
  if (!name) {
    throw new Error('Theme definition is missing a valid name.');
  }

  const label = typeof definition.label === 'string' && definition.label.trim().length > 0
    ? definition.label.trim()
    : humanizeName(name);

  const defaultForModes = Array.isArray(definition.defaultForModes)
    ? definition.defaultForModes.filter((value) => value === 'dark' || value === 'light')
    : [];

  return {
    name,
    label,
    defaultForModes,
  };
}

function syncPackageJson(rootManifest, currentPackageJson, commands, documentThemes) {
  if (typeof rootManifest.version !== 'string' || rootManifest.version.trim().length === 0) {
    throw new Error('Root package.json is missing a valid version.');
  }

  currentPackageJson.version = rootManifest.version;

  currentPackageJson.contributes.commands = commands.map((entry) => {
    const contribution = {
      command: entry.command,
      title: entry.title,
      category: entry.category,
    };

    if (entry.icon !== undefined) {
      contribution.icon = entry.icon;
    }

    return contribution;
  });

  const documentPreviewThemeSetting = currentPackageJson.contributes.configuration
    .flatMap((section) => Object.entries(section.properties ?? {}))
    .find(([key]) => key === 'markdownAiStudio.documentPreviewTheme')?.[1];

  if (!documentPreviewThemeSetting) {
    throw new Error('Could not find markdownAiStudio.documentPreviewTheme in package.json.');
  }

  documentPreviewThemeSetting.enum = ['auto', ...documentThemes.map((theme) => theme.name)];
  documentPreviewThemeSetting.enumDescriptions = [
    'Follows VS Code\'s dark or light theme automatically.',
    ...documentThemes.map((theme) => describeTheme(theme)),
  ];

  writeIfChanged(packageJsonPath, `${JSON.stringify(currentPackageJson, null, 2)}\n`);
}

function describeTheme(theme) {
  const modes = new Set(theme.defaultForModes);
  if (modes.has('dark') && !modes.has('light')) {
    return `${theme.label} — bundled dark document theme.`;
  }

  if (modes.has('light') && !modes.has('dark')) {
    return `${theme.label} — bundled light document theme.`;
  }

  return `${theme.label} — bundled document theme.`;
}

function syncGeneratedCommandEntries(commands) {
  const quickPickCommands = commands
    .filter((entry) => typeof entry.quickPickTitle === 'string')
    .map((entry) => ({
      command: entry.command,
      title: entry.quickPickTitle,
    }));

  const content = `// Generated by scripts/sync-manifest-config.mjs from apps/ai-markdown-studio-vs-community/config/command-metadata.json.\n\nexport const commandEntries = ${formatArrayOfObjects(quickPickCommands)} as const;\n`;
  writeIfChanged(generatedCommandEntriesPath, content);
}

function formatArrayOfObjects(entries) {
  return `[
${entries.map((entry) => `  { command: ${JSON.stringify(entry.command)}, title: ${JSON.stringify(entry.title)} },`).join('\n')}
]`;
}

function humanizeName(name) {
  return name
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function writeIfChanged(filePath, nextContent) {
  const currentContent = readFileSync(filePath, 'utf8');
  if (currentContent === nextContent) {
    return;
  }

  writeFileSync(filePath, nextContent, 'utf8');
}
