// scripts/clean.mjs — Cross-platform replacement for `rm -rf <path>`
// Usage: node scripts/clean.mjs <path> [<path2> ...]

import { rm } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const paths = process.argv.slice(2);

if (paths.length === 0) {
  console.error('Usage: node scripts/clean.mjs <path> [<path2> ...]');
  process.exit(1);
}

for (const p of paths) {
  const resolved = resolve(p);
  // Guard: refuse to delete outside project root
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(PROJECT_ROOT + sep)) {
    console.error(`Refusing to delete outside project root: ${resolved}`);
    process.exit(1);
  }
  await rm(resolved, { recursive: true, force: true });
}
