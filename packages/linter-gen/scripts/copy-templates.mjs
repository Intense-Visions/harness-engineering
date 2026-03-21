// packages/linter-gen/scripts/copy-templates.mjs — Cross-platform replacement for `cp -r`
// Copies src/templates into dist/templates after tsc build

import { cp, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const src = resolve(root, 'src/templates');
const dest = resolve(root, 'dist/templates');

await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
