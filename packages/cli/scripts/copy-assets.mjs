// packages/cli/scripts/copy-assets.mjs — Cross-platform replacement for `cp -r`
// Copies ../../templates and ../../agents into dist/

import { cp, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const assets = [
  { src: resolve(root, '../../templates'), dest: resolve(root, 'dist/templates') },
  { src: resolve(root, '../../agents'), dest: resolve(root, 'dist/agents') },
];

await mkdir(resolve(root, 'dist'), { recursive: true });

/** Skip node_modules directories that may contain symlinks */
const filter = (src) => basename(src) !== 'node_modules';

for (const { src, dest } of assets) {
  await cp(src, dest, { recursive: true, filter, dereference: false });
}
