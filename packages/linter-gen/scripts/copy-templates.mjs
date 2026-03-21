// packages/linter-gen/scripts/copy-templates.mjs — Cross-platform replacement for `cp -r`
// Copies src/templates into dist/templates after tsc build

import { cp, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const src = resolve(root, 'src/templates');
const dest = resolve(root, 'dist/templates');

// Clean destination first to avoid stale files from prior builds
await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
