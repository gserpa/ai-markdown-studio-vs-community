import { readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const yauzl = require('yauzl');

const scriptFilePath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptFilePath);
const repoRoot = path.resolve(scriptDirectory, '..');
const extensionManifest = JSON.parse(readFileSync(path.join(repoRoot, 'apps', 'ai-markdown-studio-vs-community', 'package.json'), 'utf8'));
const extensionReadmePath = path.join(repoRoot, 'apps', 'ai-markdown-studio-vs-community', 'README.md');
const rootReadmePath = path.join(repoRoot, 'README.md');
const repositoryUrl = normalizeRepositoryUrl(extensionManifest.repository?.url ?? '');
const rawRepositoryUrl = toRawRepositoryUrl(repositoryUrl);
const extensionReadmeRepositoryDirectory = path.posix.dirname(
  path.relative(repoRoot, extensionReadmePath).split(path.sep).join('/'),
);
const defaultVsixPath = path.join(repoRoot, `${extensionManifest.name}-${extensionManifest.version}.vsix`);
const vsixPath = path.resolve(process.argv[2] ?? defaultVsixPath);
const expectedExtensionReadme = normalizeText(readFileSync(extensionReadmePath, 'utf8'));
const rootReadme = normalizeText(readFileSync(rootReadmePath, 'utf8'));
const packagedReadmePath = 'extension/readme.md';

const maxCompressedBytes = 58 * 1024 * 1024;
const maxUncompressedBytes = 140 * 1024 * 1024;

const forbiddenEntryRules = [
  {
    description: 'demo directories inside node_modules',
    test: (fileName) => fileName.includes('/node_modules/') && /\/demo(?:s)?\//u.test(fileName),
  },
  {
    description: 'test-example directories inside node_modules',
    test: (fileName) => fileName.includes('/node_modules/') && /\/tests-examples\//u.test(fileName),
  },
  {
    description: 'example, demo, or benchmark folders inside node_modules',
    test: (fileName) => fileName.includes('/node_modules/') && /\/(?:examples?|fixtures?|benchmark(?:s)?|test(?:s)?|__tests__|__mocks__)\//u.test(fileName),
  },
  {
    description: 'standalone demo/example files inside node_modules',
    test: (fileName) => fileName.includes('/node_modules/') && /\/(?:demo|example)[^/]*\.(?:html|js|gif|png|svg|mjs|cjs)$/iu.test(fileName),
  },
  {
    description: 'source maps or type declarations inside node_modules',
    test: (fileName) => fileName.includes('/node_modules/') && /\.(?:map|d\.(?:ts|mts|cts))$/iu.test(fileName),
  },
];

const report = await readVsix(vsixPath);
const violations = findViolations(report.entries);
const sizeViolations = findSizeViolations(report);
const readmeViolations = findReadmeViolations(report.files);

if (violations.length === 0 && sizeViolations.length === 0 && readmeViolations.length === 0) {
  console.log(
    `VSIX check passed: ${formatBytes(report.compressedBytes)} on disk, ${formatBytes(report.uncompressedBytes)} unpacked, ${report.entries.length} entries.`,
  );
  process.exit(0);
}

console.error(`VSIX check failed for ${path.relative(repoRoot, vsixPath) || vsixPath}`);

for (const violation of sizeViolations) {
  console.error(`- ${violation}`);
}

for (const violation of readmeViolations) {
  console.error(`- ${violation}`);
}

for (const violation of violations) {
  console.error(`- ${violation.description}: ${violation.fileName}`);
}

console.error('Largest entries:');
for (const entry of report.entries.slice(0, 20)) {
  console.error(`- ${entry.fileName} (${formatBytes(entry.uncompressedSize)} unpacked)`);
}

process.exit(1);

function readVsix(filePath) {
  return new Promise((resolve, reject) => {
    const entryInfos = [];
    const extractedFiles = new Map();

    yauzl.open(filePath, { lazyEntries: true }, (error, zipFile) => {
      if (error) {
        reject(error);
        return;
      }

      if (!zipFile) {
        reject(new Error(`Unable to open VSIX archive: ${filePath}`));
        return;
      }

      zipFile.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) {
          zipFile.readEntry();
          return;
        }

        entryInfos.push({
          fileName: entry.fileName,
          compressedSize: entry.compressedSize,
          uncompressedSize: entry.uncompressedSize,
        });

        if (entry.fileName.toLowerCase() !== packagedReadmePath) {
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamError, readStream) => {
          if (streamError) {
            zipFile.close();
            reject(streamError);
            return;
          }

          if (!readStream) {
            zipFile.close();
            reject(new Error(`Unable to read ${entry.fileName} from ${filePath}.`));
            return;
          }

          const chunks = [];
          readStream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          readStream.on('end', () => {
            extractedFiles.set(entry.fileName, Buffer.concat(chunks).toString('utf8'));
            zipFile.readEntry();
          });
          readStream.on('error', (streamReadError) => {
            zipFile.close();
            reject(streamReadError);
          });
        });
      });

      zipFile.on('end', () => {
        zipFile.close();
        entryInfos.sort((left, right) => right.uncompressedSize - left.uncompressedSize);
        resolve({
          compressedBytes: statSync(filePath).size,
          entries: entryInfos,
          files: extractedFiles,
          uncompressedBytes: entryInfos.reduce((total, entry) => total + entry.uncompressedSize, 0),
        });
      });

      zipFile.on('error', (zipError) => {
        zipFile.close();
        reject(zipError);
      });

      zipFile.readEntry();
    });
  });
}

function findViolations(entries) {
  const violations = [];

  for (const entry of entries) {
    for (const rule of forbiddenEntryRules) {
      if (rule.test(entry.fileName)) {
        violations.push({
          description: rule.description,
          fileName: entry.fileName,
        });
        break;
      }
    }
  }

  return violations;
}

function findSizeViolations(report) {
  const violations = [];

  if (report.compressedBytes > maxCompressedBytes) {
    violations.push(
      `Compressed VSIX size ${formatBytes(report.compressedBytes)} exceeds the limit of ${formatBytes(maxCompressedBytes)}.`,
    );
  }

  if (report.uncompressedBytes > maxUncompressedBytes) {
    violations.push(
      `Unpacked VSIX contents ${formatBytes(report.uncompressedBytes)} exceed the limit of ${formatBytes(maxUncompressedBytes)}.`,
    );
  }

  return violations;
}

function findReadmeViolations(files) {
  const violations = [];
  const packagedReadme = files.get(packagedReadmePath);

  if (!packagedReadme) {
    violations.push('Missing extension/readme.md in the VSIX package.');
    return violations;
  }

  const normalizedPackagedReadme = normalizeText(packagedReadme);
  if (normalizedPackagedReadme !== expectedExtensionReadme) {
    violations.push(
      'Packaged extension/readme.md does not match apps/ai-markdown-studio-vs-community/README.md.',
    );
  }

  if (normalizedPackagedReadme === rootReadme) {
    violations.push('Packaged extension/readme.md matches the repository root README.md instead of the app README.');
  }

  return violations;
}

function normalizeText(value) {
  return normalizeRelativePaths(normalizeRepositoryLinks(value.replace(/\r\n/g, '\n'))).trim();
}

function formatBytes(byteCount) {
  const mebibytes = byteCount / (1024 * 1024);
  return `${mebibytes.toFixed(2)} MiB`;
}

function normalizeRepositoryUrl(value) {
  return value.replace(/\.git$/u, '');
}

function normalizeRepositoryLinks(value) {
  if (!repositoryUrl) {
    return value;
  }

  return value
    .replace(new RegExp(`${escapeRegExp(repositoryUrl)}/(?:blob|raw)/HEAD/([^\\s)]+)`, 'gu'), (_match, repoPath) => normalizeReadmeTarget(repoPath))
    .replace(new RegExp(`${escapeRegExp(rawRepositoryUrl)}/HEAD/([^\\s)]+)`, 'gu'), (_match, repoPath) => normalizeReadmeTarget(repoPath));
}

function normalizeRelativePaths(value) {
  return value.replace(/\(\.\/((?:\.\.\/)+[^)]+)\)/gu, '($1)');
}

function normalizeReadmeTarget(repoPath) {
  const normalizedRepoPath = repoPath.replace(/\\/gu, '/').replace(/^\/+/u, '');
  const relativePath = path.posix.relative(extensionReadmeRepositoryDirectory, normalizedRepoPath);

  if (!relativePath || relativePath === '.') {
    return './';
  }

  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function toRawRepositoryUrl(value) {
  return value.replace('https://github.com/', 'https://raw.githubusercontent.com/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
