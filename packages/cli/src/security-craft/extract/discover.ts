/**
 * Source-file discovery — walks packages/STAR/src/ recursively (where
 * STAR is each package directory), falling back to src/ then app/ when there
 * is no packages/ dir, and returns TS/JS source files only.
 * Excludes test files (v1 scope; v1.x adds dedicated test-security
 * rubrics) and generated / build / coverage dirs.
 *
 * Source: docs/changes/craft-pipeline/security-craft/proposal.md
 *   (Technical Design → Module layout, Scope → source-file walk).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSourceRoots } from '../../shared/craft/extract/source-roots.js';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.harness',
  '.next',
  '.turbo',
  '__snapshots__',
  '__mocks__',
  'tests', // v1 excludes test files; v1.x adds dedicated test-security rubrics
  'test',
  '__tests__',
]);

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i;

export function discoverSourceFiles(
  projectRoot: string,
  packagesFilter?: ReadonlyArray<string>
): string[] {
  // Roots are shared with code-craft (see resolveSourceRoots). Before #2234
  // this returned [] outright without a `packages/` dir, so every
  // single-package repo scanned zero files and read as clean.
  const out: string[] = [];
  for (const root of resolveSourceRoots(projectRoot, packagesFilter)) walk(root, out);
  return out;
}

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (TEST_FILE_PATTERN.test(entry.name)) continue;
    const ext = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    out.push(full);
  }
}
