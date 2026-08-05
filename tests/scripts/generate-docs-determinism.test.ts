/**
 * Cross-platform determinism lock for scripts/generate-docs.mjs (issue #1081).
 *
 * REGRESSION GUARDED: `generate-docs` produced platform-dependent byte output,
 * causing spurious "Reference docs are stale" CI failures — a PR regenerated on
 * one OS would "fail fresh" on another OS's runner. Two independent mechanisms:
 *
 *   1. `String.prototype.localeCompare` — locale/ICU-dependent. The same list of
 *      skill / MCP-tool / CLI-command names can order differently across
 *      operating systems (and across Node builds with different bundled ICU),
 *      and it can even rank two *distinct* names as equal (variable-weighted
 *      punctuation), leaving the tie to be broken by `fs.readdir` order.
 *   2. Unsorted `fs.readdirSync` — filesystem/platform enumeration order is not
 *      guaranteed, so any iteration that emits in readdir order is nondeterministic.
 *
 * The fix replaced every ordering decision with a locale-independent Unicode
 * code-point comparison (`byCodePoint`) and sorted every `readdirSync` result.
 * These asserts lock both halves so the nondeterminism cannot creep back via a
 * careless edit. This is a source-level lock rather than a behavioral run because
 * the script executes `main()` at import time against the built CLI dist and a
 * spawned tsx child process, which cannot be exercised hermetically in unit tests.
 *
 * The byte-level determinism itself is proven end-to-end by the
 * `Verify generated docs are fresh` CI step running on every platform.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, '..', '..');
const SUT_PATH = join(REPO_ROOT, 'scripts', 'generate-docs.mjs');
const SOURCE = readFileSync(SUT_PATH, 'utf-8');

/**
 * Strip block + line comments so the invariant scans only executable code.
 * (The fix's rationale comment deliberately names `localeCompare`, and we must
 * not let documentation trip the "no locale-dependent sort" assertion.)
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const CODE = stripComments(SOURCE);

describe('generate-docs determinism (#1081)', () => {
  it('exposes a locale-independent code-point comparator', () => {
    expect(CODE).toMatch(/function byCodePoint\s*\(/);
  });

  it('never orders output with locale-dependent localeCompare', () => {
    // localeCompare is ICU/locale-dependent and must not gate any emitted order.
    expect(CODE).not.toMatch(/localeCompare/);
  });

  it('sorts every readdirSync result before iterating (no readdir-order emission)', () => {
    // Each readdirSync call in executable code must be immediately `.sort(...)`ed.
    const readdirCalls = CODE.match(/readdirSync\([^)]*\)(\s*\.[A-Za-z]+\([^)]*\))?/g) ?? [];
    expect(readdirCalls.length).toBeGreaterThan(0);
    for (const call of readdirCalls) {
      expect(call, `unsorted readdirSync must be sorted: ${call}`).toMatch(/\.sort\(/);
    }
  });

  it('routes every sort comparator through byCodePoint', () => {
    // Guards against a future edit reintroducing an ad-hoc comparator.
    const sortComparators = CODE.match(/\.sort\(\s*\([^)]*\)\s*=>[^;]*?\)/g) ?? [];
    expect(sortComparators.length).toBeGreaterThan(0);
    for (const cmp of sortComparators) {
      expect(cmp, `sort comparator must use byCodePoint: ${cmp}`).toMatch(/byCodePoint/);
    }
  });
});
