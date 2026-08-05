import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CAP for the pre-commit `--skip` list (roadmap #529).
 *
 * `.husky/pre-commit` defers six `harness ci check` categories out of the local
 * commit gate. Each deferral may be individually justified, but the cumulative,
 * silent growth of that list is the failure this test guards against: "every gap
 * was once a known issue, then background noise, then invisible."
 *
 * The skip list is a CLOSED, documented allowlist expressed in THREE places that
 * must agree:
 *   1. the `SKIP="a,b,c"` assignment actually passed to `ci check`,
 *   2. one per-category rationale `case` arm (the stderr warning shown at commit
 *      time), and
 *   3. the reviewed reference table in `.husky/pre-commit-skip-allowlist.md`.
 *
 * This test fails if those three ever diverge. So a skip can never grow silently:
 * adding one forces a visible, reviewed edit across the hook AND the allowlist doc
 * (with a real rationale), which a reviewer sees. That is the entire cap.
 */

function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('Could not locate monorepo root (pnpm-workspace.yaml not found)');
    }
    dir = parent;
  }
}

const repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
const HOOK_PATH = path.join(repoRoot, '.husky', 'pre-commit');
const ALLOWLIST_PATH = path.join(repoRoot, '.husky', 'pre-commit-skip-allowlist.md');

const hook = fs.readFileSync(HOOK_PATH, 'utf-8');
const allowlistDoc = fs.readFileSync(ALLOWLIST_PATH, 'utf-8');

/** The literal `SKIP="a,b,c"` assignment that is passed to `ci check`. */
function parseSkipAssignment(src: string): string[] {
  const m = /^\s*SKIP="([^"]*)"/m.exec(src);
  if (!m) throw new Error('Could not find a `SKIP="..."` assignment in .husky/pre-commit');
  return m[1]!
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The category labels of the per-category rationale `case "$cat" in ... esac` block. */
function parseCaseArmCategories(src: string): string[] {
  const start = src.indexOf('case "$cat" in');
  if (start === -1) throw new Error('Could not find the `case "$cat" in` rationale block');
  const end = src.indexOf('esac', start);
  if (end === -1) throw new Error('Could not find the closing `esac` of the rationale block');
  const block = src.slice(start, end);
  // Arm labels sit on their own line as `<category>)` — the `*` fallback arm is
  // intentionally excluded (it exists to name an UNDOCUMENTED category loudly).
  const arms: string[] = [];
  const armRe = /^[ \t]*([a-z][a-z-]+)\)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = armRe.exec(block)) !== null) arms.push(m[1]!);
  return arms;
}

/** Category names + their rationale cells from the allowlist reference table. */
function parseAllowlistRows(doc: string): { category: string; rationale: string }[] {
  const rows: { category: string; rationale: string }[] = [];
  // A table row whose first cell is a backtick-wrapped category:
  //   | `entropy` | ...where it runs... | ...why deferred... |
  const rowRe = /^\|\s*`([a-z][a-z-]+)`\s*\|([^|]*)\|([^|]*)\|/gm;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(doc)) !== null) {
    rows.push({ category: m[1]!, rationale: (m[2]! + m[3]!).trim() });
  }
  return rows;
}

const sorted = (xs: string[]): string[] => [...xs].sort();

describe('pre-commit --skip allowlist cap (#529)', () => {
  const skipCategories = parseSkipAssignment(hook);
  const caseArmCategories = parseCaseArmCategories(hook);
  const allowlistRows = parseAllowlistRows(allowlistDoc);
  const allowlistCategories = allowlistRows.map((r) => r.category);

  it('parses a non-empty skip list, case-arm set, and allowlist table', () => {
    // Guards the parsers themselves — a silent parse failure must never make the
    // divergence assertions vacuously pass.
    expect(skipCategories.length).toBeGreaterThan(0);
    expect(caseArmCategories.length).toBeGreaterThan(0);
    expect(allowlistCategories.length).toBeGreaterThan(0);
  });

  it('the SKIP set passed to `ci check` matches the per-category rationale arms', () => {
    // Every skipped category is named + rationalized at commit time; no arm names a
    // category that is not actually skipped.
    expect(sorted(caseArmCategories)).toEqual(sorted(skipCategories));
  });

  it('the SKIP set matches the documented allowlist table exactly', () => {
    // The cap: the hook's actual skip set and the reviewed reference cannot diverge.
    // A skip added to the hook without a documented, rationalized row fails here.
    expect(sorted(allowlistCategories)).toEqual(sorted(skipCategories));
  });

  it('every allowlisted category carries a non-empty rationale', () => {
    for (const row of allowlistRows) {
      expect(row.rationale.length, `rationale for '${row.category}' is empty`).toBeGreaterThan(0);
    }
  });

  it('the allowlist table has no duplicate categories', () => {
    expect(allowlistCategories.length).toBe(new Set(allowlistCategories).size);
  });

  it('the hook passes the single-source SKIP variable to `ci check` (no hand-copied list)', () => {
    // If the hook stopped deriving the skipped set from `$SKIP`, the warnings and
    // the audited list could drift; this keeps them one source.
    expect(hook).toMatch(/ci check --skip "\$SKIP"/);
  });
});
