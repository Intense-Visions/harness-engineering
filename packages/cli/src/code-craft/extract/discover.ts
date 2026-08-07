/**
 * Source-file discovery — walks packages/<pkg>/src/ recursively and returns
 * TS/JS source files only. Excludes test files (v1 scope; test-quality is
 * test-craft's territory) and generated / build / coverage dirs.
 *
 * A near-verbatim mirror of security-craft's discovery — code-craft and
 * security-craft critique the same corpus (authored source), differing only
 * in which AST constructs earn a critique.
 *
 * Source: docs/changes/code-craft/proposal.md (Technical Design → discovery).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

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
  'tests', // v1 excludes test files — test quality is test-craft's territory
  'test',
  '__tests__',
  'fixtures', // test fixtures are not authored production source (twins already exclude this)
]);

/**
 * Fallback source roots (relative to the project root) tried, in order, when a
 * project has no `packages/` directory. Without this a single-package repo —
 * the common shape outside a monorepo — reports zero source files, which reads
 * as a silent clean pass. `src` is the near-universal convention; `app` covers
 * frameworks (Next.js App Router, some Node services) that root code there.
 */
const FALLBACK_SOURCE_ROOTS: ReadonlyArray<string> = ['src', 'app'];

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i;

export function discoverSourceFiles(
  projectRoot: string,
  packagesFilter?: ReadonlyArray<string>
): string[] {
  const packagesDir = path.join(projectRoot, 'packages');
  if (!fs.existsSync(packagesDir)) {
    // Not a `packages/` monorepo — fall back to conventional single-package
    // roots so these projects aren't silently reported as empty.
    return discoverFallbackRoots(projectRoot);
  }
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(packagesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (packagesFilter !== undefined && !packagesFilter.includes(entry.name)) continue;
    const srcDir = path.join(packagesDir, entry.name, 'src');
    if (!fs.existsSync(srcDir)) continue;
    walk(srcDir, out);
  }
  return out;
}

/**
 * Discover source under conventional single-package roots (`src`, then `app`)
 * when the project has no `packages/` directory. Walks the first root that
 * exists as a directory; falls back to the next only when the prior is absent.
 */
function discoverFallbackRoots(projectRoot: string): string[] {
  const out: string[] = [];
  for (const root of FALLBACK_SOURCE_ROOTS) {
    const dir = path.join(projectRoot, root);
    if (!fs.existsSync(dir)) continue;
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    walk(dir, out);
  }
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
