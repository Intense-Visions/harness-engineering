/**
 * Comprehension invalidation: map a git-diff surface to the set of module
 * directories to recompile (incremental cost, SC3), and enumerate every module
 * directory for an `--all` backfill.
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { DEFAULT_SOURCE_EXTENSIONS } from '@harness-engineering/core';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage']);

/**
 * Map changed files → their owning module DIRECTORIES (the compile unit, D3).
 * Cost ∝ diff size (SC3): the result is exactly the set of directories of the
 * supported, non-root changed files — never the repo. Posix-normalized, sorted,
 * de-duplicated. Root-level files (no owning directory) and unsupported
 * extensions are dropped.
 */
export function filesToModules(
  files: readonly string[],
  extensions: readonly string[] = DEFAULT_SOURCE_EXTENSIONS
): string[] {
  const exts = new Set(extensions);
  const mods = new Set<string>();
  for (const raw of files) {
    const rel = raw.replaceAll('\\', '/');
    const dot = rel.lastIndexOf('.');
    if (dot === -1 || !exts.has(rel.slice(dot))) continue;
    const slash = rel.lastIndexOf('/');
    if (slash === -1) continue; // root-level file has no module directory
    mods.add(rel.slice(0, slash));
  }
  return [...mods].sort();
}

/**
 * Enumerate every module directory under `projectRoot` for an `--all` backfill:
 * any directory whose DIRECT entries include ≥1 supported-extension source file
 * (non-recursive membership per D3). Skips `node_modules`/`dist`/`build`/
 * `coverage` and dot-directories. Returns posix-normalized, sorted, repo-relative
 * paths. An absent root yields `[]` (no throw).
 */
export async function enumerateModules(
  projectRoot: string,
  extensions: readonly string[] = DEFAULT_SOURCE_EXTENSIONS
): Promise<string[]> {
  const exts = new Set(extensions);
  const mods = new Set<string>();

  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return; // absent/unreadable dir ⇒ contributes no modules
    }
    const hasDirectSource = entries.some((e) => e.isFile() && exts.has(path.extname(e.name)));
    if (hasDirectSource) {
      const rel = path.relative(projectRoot, dir).replaceAll('\\', '/');
      if (rel) mods.add(rel);
    }
    for (const e of entries) {
      if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) {
        await walk(path.join(dir, e.name));
      }
    }
  }

  await walk(projectRoot);
  return [...mods].sort();
}
