import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const targetRoot = path.resolve(process.argv[2] ?? path.join(scriptDirectory, '..'));
const requireFromTarget = createRequire(path.join(targetRoot, 'package.json'));
requireFromTarget.resolve('punycode/');
const packageRoot = path.resolve(path.dirname(requireFromTarget.resolve('html-to-docx')), '..');
const packageManifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));

if (packageManifest.version !== '1.8.0') {
  throw new Error(`Unsupported html-to-docx version for the punycode patch: ${packageManifest.version}.`);
}

patchFile('html-to-docx.umd.js', [
  ['require("punycode")', 'require("punycode/")'],
]);
patchFile('html-to-docx.esm.js', [
  ['from"punycode";', 'from"punycode/";'],
]);

function patchFile(fileName, replacements) {
  const filePath = path.join(packageRoot, 'dist', fileName);
  let source = readFileSync(filePath, 'utf8');
  for (const [original, replacement] of replacements) {
    source = source.replaceAll(original, replacement);
  }
  if (!source.includes('punycode/')) {
    throw new Error(`Expected the patched punycode package import in ${filePath}.`);
  }
  writeFileSync(filePath, source, 'utf8');
}
