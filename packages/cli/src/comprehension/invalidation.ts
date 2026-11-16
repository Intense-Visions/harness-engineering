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
 * The ONE directory-eligibility rule shared by `enumerateModules` (`--all`) and
 * `filesToModules` (`--changed`, the pre-commit hook): a directory named in
 * `SKIP_DIRS` or starting with `.` is never walked, so nothing beneath it is a
 * module. #2578 — `--changed` used to skip this rule, so the hook compiled units
 * (e.g. a git-ignored `docs/.vitepress/cache/...`) that `--all` would never
 * enumerate and nothing could refresh.
 */
function isWalkableDirName(name: string): boolean {
  return !SKIP_DIRS.has(name) && !name.startsWith('.');
}

/**
 * True iff the repo-relative, posix module directory `rel` could be produced by
 * `enumerateModules` — every path segment is walkable. Membership (≥1 direct
 * source file) is a separate, filesystem-dependent condition.
 */
export function isEnumerableModulePath(rel: string): boolean {
  return rel !== '' && rel.split('/').every(isWalkableDirName);
}

/**
 * Map changed files → their owning module DIRECTORIES (the compile unit, D3).
 * Cost ∝ diff size (SC3): the result is exactly the set of directories of the
 * supported, non-root changed files — never the repo. Posix-normalized, sorted,
 * de-duplicated. Root-level files (no owning directory), unsupported extensions,
 * and files under a directory `enumerateModules` never walks (dot-directories,
 * `node_modules`/`dist`/`build`/`coverage`) are dropped — so the result is always
 * a subset of what `--all` would enumerate.
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
    const mod = rel.slice(0, slash);
    if (!isEnumerableModulePath(mod)) continue; // same rule as enumerateModules (#2578)
    mods.add(mod);
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
      if (e.isDirectory() && isWalkableDirName(e.name)) {
        await walk(path.join(dir, e.name));
      }
    }
  }

  await walk(projectRoot);
  return [...mods].sort();
}
