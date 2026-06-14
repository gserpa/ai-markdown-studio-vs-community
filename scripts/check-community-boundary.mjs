import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const yauzl = require('yauzl');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proTokens = [
  'vscode-extension-pro', '/convert/', '/export/pdf/', '/export/pptx/',
  'markdownAiStudio.exportDocx', 'markdownAiStudio.exportPdf', 'markdownAiStudio.exportPptx',
  'markdownAiStudio.convertToMarkdown', 'languageModelTools',
  'sharp', '@resvg/resvg-js', 'puppeteer-core', 'pptxgenjs', 'pptx-automizer', 'pdf-parse',
];
const proRuntimeTokens = [
  'markdownAiStudio.exportDocx', 'markdownAiStudio.exportPdf', 'markdownAiStudio.exportPptx',
  'markdownAiStudio.convertToMarkdown', 'languageModelTools',
  'require("sharp")', "require('sharp')", '@resvg/resvg-js', 'puppeteer-core', 'pptxgenjs', 'pptx-automizer', 'pdf-parse',
];
const proDependencyPaths = ['sharp', '@resvg/resvg-js', 'puppeteer-core', 'pptxgenjs', 'pptx-automizer', 'pdf-parse'];
const maxCommunityCompressedBytes = 58 * 1024 * 1024;
const failures = [];

checkManifest();
checkSourceTree();

const vsixFlag = process.argv.indexOf('--vsix');
if (vsixFlag >= 0) {
  await checkVsix(path.resolve(process.argv[vsixFlag + 1]));
}

if (failures.length > 0) {
  console.error('Community boundary check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Community boundary check passed.');

function checkManifest() {
  const manifest = readFileSync(path.join(repoRoot, 'apps/ai-markdown-studio-vs-community/package.json'), 'utf8');
  for (const token of proTokens) {
    if (containsForbiddenToken(manifest, token)) failures.push(`Community manifest contains Pro token: ${token}`);
  }
}

function checkSourceTree() {
  const roots = ['apps/ai-markdown-studio-vs-community/src', 'packages'];
  for (const root of roots) {
    for (const file of walk(path.join(repoRoot, root))) {
      const relative = path.relative(repoRoot, file).replaceAll('\\', '/');
      const content = readFileSync(file, 'utf8');
      for (const token of proTokens) {
        if (containsForbiddenToken(relative, token) || containsForbiddenToken(content, token)) failures.push(`${relative} contains Pro token: ${token}`);
      }
    }
  }
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'dist' || entry.name === 'node_modules' ? [] : walk(target);
    return /\.(?:ts|json|md)$/u.test(entry.name) ? [target] : [];
  });
}

function checkVsix(filePath) {
  if (statSync(filePath).size > maxCommunityCompressedBytes) {
    failures.push(`Community VSIX exceeds the 10% growth limit of ${maxCommunityCompressedBytes} bytes.`);
  }
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error('Could not open VSIX.'));
      zip.on('entry', (entry) => {
        const name = entry.fileName;
        if (!name.includes('/node_modules/') && (/\/(?:src|test|tests)\//u.test(name) || /\.(?:ts|map)$/u.test(name))) {
          failures.push(`Forbidden first-party source/test entry in VSIX: ${name}`);
        }
        for (const dependency of proDependencyPaths) {
          if (name.includes(`/node_modules/${dependency}/`)) failures.push(`VSIX contains Pro dependency: ${dependency}`);
        }
        if ((!name.startsWith('extension/out/') && name !== 'extension/package.json') || !/\.(?:js|json)$/u.test(name) || entry.uncompressedSize > 5 * 1024 * 1024) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return reject(streamError ?? new Error(`Could not read ${name}`));
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            const content = Buffer.concat(chunks).toString('utf8');
            for (const token of proRuntimeTokens) {
              if (containsForbiddenToken(content, token)) {
                failures.push(`VSIX runtime file ${name} contains Pro token: ${token}`);
              }
            }
            zip.readEntry();
          });
          stream.on('error', reject);
        });
      });
      zip.on('end', resolve);
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

function containsForbiddenToken(content, token) {
  if (!content.includes(token)) {
    return false;
  }

  if (token.startsWith('markdownAiStudio.')) {
    const escaped = escapeRegExp(token);
    return new RegExp(`${escaped}(?![A-Za-z0-9])`, 'u').test(content);
  }

  return true;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
