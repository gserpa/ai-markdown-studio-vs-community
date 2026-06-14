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
const defaultVsixPath = path.join(repoRoot, `${extensionManifest.name}-${extensionManifest.version}.vsix`);
const vsixPath = path.resolve(process.argv[2] ?? defaultVsixPath);

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

if (violations.length === 0 && sizeViolations.length === 0) {
  console.log(
    `VSIX check passed: ${formatBytes(report.compressedBytes)} on disk, ${formatBytes(report.uncompressedBytes)} unpacked, ${report.entries.length} entries.`,
  );
  process.exit(0);
}

console.error(`VSIX check failed for ${path.relative(repoRoot, vsixPath) || vsixPath}`);

for (const violation of sizeViolations) {
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
        if (!entry.fileName.endsWith('/')) {
          entryInfos.push({
            fileName: entry.fileName,
            compressedSize: entry.compressedSize,
            uncompressedSize: entry.uncompressedSize,
          });
        }

        zipFile.readEntry();
      });

      zipFile.on('end', () => {
        zipFile.close();
        entryInfos.sort((left, right) => right.uncompressedSize - left.uncompressedSize);
        resolve({
          compressedBytes: statSync(filePath).size,
          entries: entryInfos,
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

function formatBytes(byteCount) {
  const mebibytes = byteCount / (1024 * 1024);
  return `${mebibytes.toFixed(2)} MiB`;
}
