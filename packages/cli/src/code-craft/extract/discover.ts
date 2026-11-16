/**
 * Source-file discovery — walks packages/<pkg>/src/ recursively (falling back to
 * src/ then app/ when there is no packages/ dir) and returns every extension in
 * EXTENSION_MAP, NOT the TS/JS subset: Phase 2a widened SOURCE_EXTENSIONS and
 * this sentence said "TS/JS source files only" for the whole of it. Excludes test
 * files (v1 scope; test-quality is test-craft's territory) and generated / build /
 * coverage dirs.
 *
 * A near-verbatim mirror of security-craft's discovery — code-craft and
 * security-craft critique the same corpus (authored source), differing only
 * in which AST constructs earn a critique.
 *
 * Source: docs/changes/code-craft/proposal.md (Technical Design → discovery).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EXTENSION_MAP } from '@harness-engineering/core';
import { resolveSourceRoots } from '../../shared/craft/extract/source-roots.js';

/**
 * Every extension harness can parse, not the TS/JS subset.
 *
 * Derived from EXTENSION_MAP rather than re-listed, because a second list is
 * how `.mjs` went missing from test discovery (#1347): the walker skipped a
 * file the extractor could read, and the summary still printed a confident
 * zero.
 *
 * Widened on the STANDALONE sweep as well as the diff-scoped path.
 * `collectFiles` returns `input.files` verbatim, so the review surface already
 * bypasses this filter; widening only there would leave `harness code-craft .`
 * printing `filesScanned: 0` on a Python repo while review reported findings on
 * the same code. Two surfaces disagreeing about one repository is the defect.
 */
const SOURCE_EXTENSIONS = new Set(Object.keys(EXTENSION_MAP));

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
 * Test-file naming conventions per language. Ships alongside the widened
 * SOURCE_EXTENSIONS: widening one without the other sweeps `test_cart.py` in
 * as production source and bills code-craft for test-craft's territory.
 */
const TEST_FILE_PATTERNS: readonly RegExp[] = [
  /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i, // TS/JS (unchanged)
  /^test_.*\.py$/i, //                                    pytest
  /^.*_test\.py$/i, //                                    pytest, trailing form
  /^.*_test\.go$/i, //                                    go test
  /^.*(Test|Tests|IT)\.java$/, //                         JUnit (case-sensitive by convention)
  /^.*_test\.rs$/i, //                                    rust, file-level convention
];

function isTestFileName(name: string): boolean {
  return TEST_FILE_PATTERNS.some((p) => p.test(name));
}

export function discoverSourceFiles(
  projectRoot: string,
  packagesFilter?: ReadonlyArray<string>
): string[] {
  // Roots are shared with security-craft (see resolveSourceRoots): a
  // `packages/` monorepo walks each `packages/<pkg>/src`, anything else falls
  // back to conventional single-package roots so it is not silently empty.
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
    if (isTestFileName(entry.name)) continue;
    const ext = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    out.push(full);
  }
}
