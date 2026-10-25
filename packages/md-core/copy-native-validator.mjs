import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
for (const extension of ['cjs', 'd.cts']) {
  await copyFile(path.join(root, 'src/visualizations/vegaLiteNativeValidator.' + extension), path.join(root, 'dist/visualizations/vegaLiteNativeValidator.' + extension));
}
