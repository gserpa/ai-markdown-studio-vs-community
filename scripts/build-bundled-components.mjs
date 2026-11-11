import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Build the static component catalog and its workspace dependencies in dependency order.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagesRoot = path.join(root, 'packages');
const workspace = new Map();
for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const folder = path.join(packagesRoot, entry.name);
  try {
    const manifest = JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8'));
    if (manifest.name) workspace.set(manifest.name, { folder, manifest });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run the component build through npm so its CLI path is available.');
const built = new Set(), visiting = new Set();
function build(name) {
  if (built.has(name)) return;
  if (visiting.has(name)) throw new Error(`Circular component package dependency: ${name}`);
  const entry = workspace.get(name);
  if (!entry) throw new Error(`Missing component workspace package: ${name}`);
  visiting.add(name);
  for (const dependency of Object.keys(entry.manifest.dependencies ?? {})) {
    if (workspace.has(dependency)) build(dependency);
  }
  visiting.delete(name);
  if (entry.manifest.scripts?.build) {
    const result = spawnSync(process.execPath, [npm, 'run', 'build', '--workspace', name], { cwd: root, stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Build failed for ${name}.`);
  }
  built.add(name);
}
build('@mfo/bundled-components');
