// packages/cli/scripts/copy-assets.mjs — Cross-platform replacement for `cp -r`
// Copies ../../templates, ../../agents, and src/hooks/*.js into dist/

import { cp, rm, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const assets = [
  { src: resolve(root, '../../templates'), dest: resolve(root, 'dist/templates') },
  { src: resolve(root, '../../agents'), dest: resolve(root, 'dist/agents') },
  { src: resolve(root, 'src/hooks'), dest: resolve(root, 'dist/hooks') },
];

await mkdir(resolve(root, 'dist'), { recursive: true });

/** Skip node_modules, agents/commands, and TypeScript source files in hooks */
const filter = (src) => {
  const name = basename(src);
  if (name === 'node_modules') return false;
  if (name === 'commands' && src.includes('agents')) return false;
  // Exclude .ts source files from hooks — only .js scripts should be copied
  if (src.endsWith('.ts') && !src.endsWith('.d.ts') && src.includes('hooks')) return false;
  return true;
};

for (const { src, dest } of assets) {
  // Clean destination first to avoid stale content and src/dest conflicts
  // when symlinks are dereferenced
  await rm(dest, { recursive: true, force: true });
  // dereference:true follows symlinks and copies actual content.
  // agents/skills/gemini-cli/ contains relative symlinks to ../claude-code/
  // which cause ERR_FS_CP_EINVAL with dereference:false.
  await cp(src, dest, { recursive: true, filter, dereference: true });
}
