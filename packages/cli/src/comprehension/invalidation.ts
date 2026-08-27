/**
 * Comprehension invalidation: map a git-diff surface to the set of module
 * directories to recompile (incremental cost, SC3), and enumerate every module
 * directory for an `--all` backfill.
 */

import { DEFAULT_SOURCE_EXTENSIONS } from '@harness-engineering/core';

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
