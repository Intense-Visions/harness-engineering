// packages/cli/scripts/copy-assets.mjs — Cross-platform replacement for `cp -r`
// Copies ../../templates and ../../agents into dist/

import { cp, rm, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const assets = [
  { src: resolve(root, '../../templates'), dest: resolve(root, 'dist/templates') },
  { src: resolve(root, '../../agents'), dest: resolve(root, 'dist/agents') },
];

await mkdir(resolve(root, 'dist'), { recursive: true });

/** Skip node_modules directories */
const filter = (src) => basename(src) !== 'node_modules';

for (const { src, dest } of assets) {
  // Clean destination first to avoid stale content and src/dest conflicts
  // when symlinks are dereferenced
  await rm(dest, { recursive: true, force: true });
  // dereference:true follows symlinks and copies actual content.
  // agents/skills/gemini-cli/ contains relative symlinks to ../claude-code/
  // which cause ERR_FS_CP_EINVAL with dereference:false.
  await cp(src, dest, { recursive: true, filter, dereference: true });
}
