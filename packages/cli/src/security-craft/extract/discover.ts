/**
 * Source-file discovery — walks packages/STAR/src/ recursively (where
 * STAR is each package directory), returns TS/JS source files only.
 * Excludes test files (v1 scope; v1.x adds dedicated test-security
 * rubrics) and generated / build / coverage dirs.
 *
 * Source: docs/changes/craft-pipeline/security-craft/proposal.md
 *   (Technical Design → Module layout, Scope → source-file walk).
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
  'tests', // v1 excludes test files; v1.x adds dedicated test-security rubrics
  'test',
  '__tests__',
]);

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i;

export function discoverSourceFiles(
  projectRoot: string,
  packagesFilter?: ReadonlyArray<string>
): string[] {
  const packagesDir = path.join(projectRoot, 'packages');
  if (!fs.existsSync(packagesDir)) return [];
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
