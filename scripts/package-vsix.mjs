import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptFilePath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptFilePath);
const repoRoot = path.resolve(scriptDirectory, '..');
const extensionAppRoot = path.join(repoRoot, 'apps', 'ai-markdown-studio-vs-community');
const stageDirectory = path.join(repoRoot, '.vsix-stage');
const extensionManifest = JSON.parse(readFileSync(path.join(extensionAppRoot, 'package.json'), 'utf8'));
const vsixFilePath = path.join(repoRoot, `${extensionManifest.name}-${extensionManifest.version}.vsix`);

rmSync(vsixFilePath, { force: true });
rmSync(stageDirectory, { recursive: true, force: true });

try {
  mkdirSync(stageDirectory, { recursive: true });
  verifyBuildOutputs();
  verifyInstalledRuntimeDependencies();

  copyRepoEntry('LICENSE');
  copyRepoEntry('THIRD_PARTY_NOTICES.md');
  copyRepoEntry('assets');
  copyRepoEntryTo('apps/ai-markdown-studio-vs-community/package.json', 'package.json');
  copyRepoEntryTo('apps/ai-markdown-studio-vs-community/media', 'media');
  copyRepoEntryTo('apps/ai-markdown-studio-vs-community/out', 'out');
  copyRepoEntryTo('apps/ai-markdown-studio-vs-community/.vscodeignore', '.vscodeignore');
  copyRepoEntryTo('apps/ai-markdown-studio-vs-community/README.md', 'README.md');
  copyRepoEntryTo('apps/ai-markdown-studio-vs-community/CHANGELOG.md', 'CHANGELOG.md');
  copyRepoEntryTo('apps/ai-markdown-studio-vs-community/SUPPORT.md', 'SUPPORT.md');
  copyRepoEntryTo('apps/ai-markdown-studio-vs-community/docs', 'docs');

  copyExternalNodeModules();
  copyWorkspacePackage('packages/ai-core', path.join('node_modules', '@mfo', 'ai-core'));
  copyWorkspacePackage('packages/md-core', path.join('node_modules', '@mfo', 'core'));
  copyWorkspacePackage('packages/md-preview-web', path.join('node_modules', '@mfo', 'preview-web'));

  pruneStageNodeModulesToRuntimeDependencies();

  const vsceCliPath = path.join(repoRoot, 'node_modules', '@vscode', 'vsce', 'vsce');
  const result = spawnSync(process.execPath, [vsceCliPath, 'package', '--out', vsixFilePath], {
    cwd: stageDirectory,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    throw new Error(`VSIX packaging failed with exit code ${process.exitCode}.`);
  }

  verifyVsixPackage(vsixFilePath);
  verifyBoundary(vsixFilePath);
} finally {
  rmSync(stageDirectory, { recursive: true, force: true });
}

function verifyInstalledRuntimeDependencies() {
  const missingDependencies = Object.keys(extensionManifest.dependencies ?? {})
    .filter((dependencyName) => !dependencyName.startsWith('@mfo/'))
    .filter((dependencyName) => !existsSync(path.join(repoRoot, 'node_modules', dependencyName, 'package.json')));

  if (missingDependencies.length > 0) {
    throw new Error(
      `Cannot package VSIX because runtime dependencies are missing from node_modules: ${missingDependencies.join(', ')}. Run npm install before packaging.`,
    );
  }
}

function copyRepoEntry(relativePath) {
  cpSync(path.join(repoRoot, relativePath), path.join(stageDirectory, relativePath), {
    recursive: true,
    dereference: true,
  });
}

function copyRepoEntryTo(sourceRelativePath, targetRelativePath) {
  cpSync(path.join(repoRoot, sourceRelativePath), path.join(stageDirectory, targetRelativePath), {
    recursive: true,
    dereference: true,
  });
}

function copyExternalNodeModules() {
  const sourceDirectory = path.join(repoRoot, 'node_modules');
  const targetDirectory = path.join(stageDirectory, 'node_modules');

  cpSync(sourceDirectory, targetDirectory, {
    recursive: true,
    dereference: true,
    filter: (sourcePath) => {
      const relativePath = path.relative(sourceDirectory, sourcePath);
      if (!relativePath) {
        return true;
      }

      const normalizedPath = relativePath.split(path.sep).join('/');
      return normalizedPath !== '@mfo' && !normalizedPath.startsWith('@mfo/');
    },
  });
}

function copyWorkspacePackage(sourceRelativePath, targetRelativePath) {
  const sourceDirectory = path.join(repoRoot, sourceRelativePath);
  const targetDirectory = path.join(stageDirectory, targetRelativePath);
  mkdirSync(targetDirectory, { recursive: true });

  for (const entry of ['package.json', 'dist', 'assets']) {
    const sourceEntry = path.join(sourceDirectory, entry);
    if (!existsSync(sourceEntry)) {
      continue;
    }

    cpSync(sourceEntry, path.join(targetDirectory, entry), {
      recursive: true,
      dereference: true,
    });
  }
}

function pruneStageNodeModulesToRuntimeDependencies() {
  const npmExecPath = process.env.npm_execpath;
  const useNpmCli = !npmExecPath;
  const command = npmExecPath ? process.execPath : process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const commandArguments = npmExecPath
    ? [npmExecPath, 'prune', '--omit=dev', '--ignore-scripts']
    : process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm', 'prune', '--omit=dev', '--ignore-scripts']
      : ['prune', '--omit=dev', '--ignore-scripts'];

  const result = spawnSync(command, commandArguments, {
    cwd: stageDirectory,
    stdio: 'inherit',
    windowsHide: useNpmCli && process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`npm prune failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

function verifyBuildOutputs() {
  const requiredEntries = [
    path.join(repoRoot, 'apps', 'ai-markdown-studio-vs-community', 'out', 'extension.js'),
    path.join(repoRoot, 'packages', 'ai-core', 'dist', 'index.js'),
    path.join(repoRoot, 'packages', 'md-core', 'dist', 'index.js'),
    path.join(repoRoot, 'packages', 'md-preview-web', 'dist', 'index.js'),
  ];

  const missingEntries = requiredEntries.filter((entryPath) => !existsSync(entryPath));
  if (missingEntries.length > 0) {
    throw new Error(
      `Cannot package VSIX because build outputs are missing: ${missingEntries.join(', ')}. Run npm run compile first.`,
    );
  }
}

function verifyVsixPackage(filePath) {
  const checkScriptPath = path.join(repoRoot, 'scripts', 'check-vsix.mjs');
  const result = spawnSync(process.execPath, [checkScriptPath, filePath], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    throw new Error(`VSIX validation failed with exit code ${process.exitCode}.`);
  }
}

function verifyBoundary(filePath) {
  const checkScriptPath = path.join(repoRoot, 'scripts', 'check-community-boundary.mjs');
  const result = spawnSync(process.execPath, [checkScriptPath, '--vsix', filePath], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Boundary validation failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

