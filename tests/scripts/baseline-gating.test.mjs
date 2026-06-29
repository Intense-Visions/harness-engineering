/**
 * Regression test for the refresh-baselines auto-merge race.
 *
 * Root cause (PR #671): the `--update` modes of coverage-ratchet and
 * benchmark-check rewrote their baseline files with raw measurements on every
 * run. Coverage percentages and benchmark mean/p99 timings jitter run-to-run, so
 * every push produced a diff of pure noise. When pushes landed close together,
 * the resulting refresh PRs edited the same lines from divergent bases and went
 * CONFLICTING — and GitHub auto-merge cannot resolve content conflicts, so the
 * losing PR sat open forever.
 *
 * The fix gates each `--update` write to *meaningful* movement so jitter-only
 * runs produce a byte-identical file (no diff -> no PR -> no race). These tests
 * assert that gate. Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeCoverageBaselines } from '../../scripts/coverage-ratchet.mjs';
import { mergeBenchmarkBaselines } from '../../scripts/benchmark-check.mjs';

test('coverage: sub-tolerance jitter keeps the committed file byte-identical', () => {
  const committed = {
    'packages/core': { lines: 91.61, branches: 76.8, functions: 92.98, statements: 89.23 },
  };
  // The exact jitter that conflicted in #671 (all moves < 0.5% V8 tolerance).
  const measured = {
    'packages/core': { lines: 91.78, branches: 76.93, functions: 93.24, statements: 89.41 },
  };

  const merged = mergeCoverageBaselines(committed, measured);

  // Byte-identical serialization is what makes `git diff --cached --quiet` true.
  assert.equal(JSON.stringify(merged), JSON.stringify(committed));
});

test('coverage: movement beyond tolerance is adopted', () => {
  const committed = { 'packages/core': { lines: 80, branches: 70, functions: 80, statements: 80 } };
  const measured = { 'packages/core': { lines: 85, branches: 70.2, functions: 80, statements: 80 } };

  const merged = mergeCoverageBaselines(committed, measured);

  assert.equal(merged['packages/core'].lines, 85); // real +5% gain locked in
  assert.equal(merged['packages/core'].branches, 70); // +0.2% noise kept stable
});

test('coverage: a brand-new package is added; a package missing this run is preserved', () => {
  const committed = { 'packages/core': { lines: 90, branches: 80, functions: 90, statements: 90 } };
  const measured = {
    'packages/core': { lines: 90.1, branches: 80, functions: 90, statements: 90 },
    'packages/new': { lines: 50, branches: 40, functions: 60, statements: 55 },
  };

  const merged = mergeCoverageBaselines(committed, measured);

  assert.deepEqual(merged['packages/core'], committed['packages/core']); // jitter ignored
  assert.deepEqual(merged['packages/new'], measured['packages/new']); // new pkg adopted

  // Missing-this-run package keeps its committed value rather than churning out.
  const mergedMissing = mergeCoverageBaselines(committed, {});
  assert.deepEqual(mergedMissing['packages/core'], committed['packages/core']);
});

test('benchmark: sub-threshold timing jitter keeps the committed file byte-identical', () => {
  const committed = {
    'core/validateConfig - valid config object': { mean: 0.001601108808008122, p99: 0.0032860000000027867 },
  };
  // The exact jitter that conflicted in #671 (mean move << 100% threshold).
  const measured = {
    'core/validateConfig - valid config object': { mean: 0.0018601312616490825, p99: 0.0030699999999797 },
  };

  const merged = mergeBenchmarkBaselines(committed, measured);

  // p99 alone must not trigger a rewrite either — the whole entry is preserved.
  assert.equal(JSON.stringify(merged), JSON.stringify(committed));
});

test('benchmark: a genuine regression beyond threshold is adopted', () => {
  const committed = { 'core/op': { mean: 1.0, p99: 1.2 } };
  const measured = { 'core/op': { mean: 3.0, p99: 3.5 } }; // 200% > 100% threshold

  const merged = mergeBenchmarkBaselines(committed, measured);

  assert.deepEqual(merged['core/op'], measured['core/op']);
});

test('benchmark: new and placeholder-zero baselines adopt fresh values', () => {
  const merged = mergeBenchmarkBaselines(
    { existing: { mean: 0, p99: 0 } },
    { existing: { mean: 0.5, p99: 0.6 }, fresh: { mean: 0.1, p99: 0.2 } },
  );

  assert.deepEqual(merged.existing, { mean: 0.5, p99: 0.6 }); // zero placeholder -> adopt
  assert.deepEqual(merged.fresh, { mean: 0.1, p99: 0.2 }); // new key -> adopt
});
