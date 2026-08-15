import { copyFileSync } from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..');
const coreRequire = createRequire(path.join(repoRoot, 'packages', 'md-core', 'package.json'));
const rootRequire = createRequire(path.join(repoRoot, 'package.json'));
const esbuild = coreRequire('esbuild');
const outputDirectory = path.join(repoRoot, 'apps', 'ai-markdown-studio-vs-community', 'out');

await esbuild.build({
  absWorkingDir: repoRoot,
  entryPoints: ['apps/ai-markdown-studio-vs-community/src/extension.ts'],
  bundle: true,
  external: ['vscode', './xhr-sync-worker.js'],
  format: 'cjs',
  outfile: path.join(outputDirectory, 'extension.js'),
  platform: 'node',
  target: 'node20',
});

copyFileSync(
  rootRequire.resolve('jsdom/lib/jsdom/living/xhr/xhr-sync-worker.js'),
  path.join(outputDirectory, 'xhr-sync-worker.js'),
);
