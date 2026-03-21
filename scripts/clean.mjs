// scripts/clean.mjs — Cross-platform replacement for `rm -rf <path>`
// Usage: node scripts/clean.mjs <path> [<path2> ...]

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const paths = process.argv.slice(2);

if (paths.length === 0) {
  console.error('Usage: node scripts/clean.mjs <path> [<path2> ...]');
  process.exit(1);
}

for (const p of paths) {
  await rm(resolve(p), { recursive: true, force: true });
}
