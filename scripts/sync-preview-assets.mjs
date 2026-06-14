/**
 * sync-preview-assets.mjs
 *
 * Copies shared preview assets from the canonical source
 * (packages/md-preview-web/assets/) into each app's assets/preview/ folder.
 *
 * Targets:
 *   assets/preview/           — VS Code extension (served via WebView URI)
 *   apps/markdown-authoring-winui/assets/preview/ — WinUI desktop app
 *
 * Android is handled separately by the Gradle syncPreviewAssets task.
 *
 * Usage:
 *   node scripts/sync-preview-assets.mjs
 */

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const sourceDir = path.join(repoRoot, 'packages', 'md-preview-web', 'assets');

const targets = [path.join(repoRoot, 'assets', 'preview')];

for (const target of targets) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(sourceDir, target, { recursive: true, dereference: true });
  console.log(`  synced → ${path.relative(repoRoot, target)}`);
}

console.log('sync-preview-assets: done');
