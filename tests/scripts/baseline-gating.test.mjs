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
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  mergeCoverageBaselines,
  evaluateCoverage,
  pruneCoverageSummaries,
  toleranceFor,
} from '../../scripts/coverage-ratchet.mjs';
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
  const measured = {
    'packages/core': { lines: 85, branches: 70.2, functions: 80, statements: 80 },
  };

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

test('evaluateCoverage: without allowMissing, a baselined package with no coverage fails (regression guard)', () => {
  const baselines = { 'packages/core': { lines: 90, branches: 80, functions: 90, statements: 90 } };
  const coverageByPkg = { 'packages/core': null }; // no fresh coverage-summary.json
  const { failures, skipped } = evaluateCoverage(baselines, coverageByPkg, { allowMissing: false });
  assert.equal(failures, 1);
  assert.equal(skipped.length, 0);
});

test('evaluateCoverage: with allowMissing, a missing package is skipped, present ones still checked', () => {
  const baselines = {
    'packages/core': { lines: 90, branches: 80, functions: 90, statements: 90 },
    'packages/cli': { lines: 85, branches: 75, functions: 85, statements: 85 },
  };
  const coverageByPkg = {
    'packages/core': null, // skipped under allowMissing
    'packages/cli': { lines: 86, branches: 76, functions: 86, statements: 86 }, // meets baseline
  };
  const { failures, skipped } = evaluateCoverage(baselines, coverageByPkg, { allowMissing: true });
  assert.equal(failures, 0);
  assert.deepEqual(skipped, ['packages/core']);
});

test('evaluateCoverage: with allowMissing, a present package below baseline still fails', () => {
  const baselines = { 'packages/cli': { lines: 85, branches: 75, functions: 85, statements: 85 } };
  const coverageByPkg = {
    'packages/cli': { lines: 80, branches: 75, functions: 85, statements: 85 },
  };
  const { failures } = evaluateCoverage(baselines, coverageByPkg, { allowMissing: true });
  assert.equal(failures, 1); // -5% lines beyond 0.5% tolerance
});

// ---------------------------------------------------------------------------
// #939: pre-push coverage ratchet grades a STALE summary for an unaffected
// package. `turbo --affected` only regenerates coverage for changed packages,
// so an unaffected package keeps a coverage-summary.json from a previous run.
// `evaluateCoverage` can't tell fresh from stale and grades it as a phantom
// regression. pruneCoverageSummaries deletes those stale files BEFORE the
// affected run so "measured this run <=> file present" holds and --allow-missing
// skips them correctly. These tests fail if pruneCoverageSummaries is missing
// or doesn't delete on-disk summaries (revert the fix -> import/behaviour fails).
// ---------------------------------------------------------------------------

/** Read one package's coverage the way the ratchet does, returning null when absent. */
function readSummary(root, relPath) {
  try {
    const total = JSON.parse(readFileSync(join(root, relPath), 'utf8')).total;
    return {
      lines: total.lines.pct,
      branches: total.branches.pct,
      functions: total.functions.pct,
      statements: total.statements.pct,
    };
  } catch {
    return null;
  }
}

test('pruneCoverageSummaries: deletes on-disk stale summaries and is idempotent on absent ones', () => {
  const root = mkdtempSync(join(tmpdir(), 'ratchet-prune-'));
  try {
    const packages = {
      'packages/orchestrator': 'packages/orchestrator/coverage/coverage-summary.json',
      'packages/cli': 'packages/cli/coverage/coverage-summary.json',
    };
    // Only orchestrator has a leftover (stale) summary on disk.
    const stale = join(root, packages['packages/orchestrator']);
    mkdirSync(join(root, 'packages/orchestrator/coverage'), { recursive: true });
    writeFileSync(stale, JSON.stringify({ total: { lines: { pct: 83.5 } } }));
    assert.ok(existsSync(stale));

    const removed = pruneCoverageSummaries(packages, root);

    assert.deepEqual(removed, ['packages/orchestrator']); // only the present file
    assert.ok(!existsSync(stale)); // stale summary is gone -> reads as "missing this run"

    // Idempotent: a second prune (or a fresh clone with no coverage dirs) is a no-op.
    assert.deepEqual(pruneCoverageSummaries(packages, root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('#939 end-to-end: prune before an affected run stops a stale unaffected summary from being graded', () => {
  const root = mkdtempSync(join(tmpdir(), 'ratchet-e2e-'));
  try {
    const packages = {
      'packages/orchestrator': 'packages/orchestrator/coverage/coverage-summary.json',
      'packages/cli': 'packages/cli/coverage/coverage-summary.json',
    };
    const baselines = {
      'packages/orchestrator': { lines: 85.52, branches: 80, functions: 90, statements: 85 },
      'packages/cli': { lines: 85, branches: 75, functions: 85, statements: 85 },
    };

    // BEFORE this push: a STALE orchestrator summary sits on disk below baseline
    // (85.52% -> 83.5%). This push only affects packages/cli.
    mkdirSync(join(root, 'packages/orchestrator/coverage'), { recursive: true });
    writeFileSync(
      join(root, packages['packages/orchestrator']),
      JSON.stringify({
        total: {
          lines: { pct: 83.5 },
          branches: { pct: 80 },
          functions: { pct: 90 },
          statements: { pct: 85 },
        },
      })
    );

    // Without prune, the ratchet would grade the stale orchestrator file -> phantom fail.
    const staleGraded = evaluateCoverage(
      baselines,
      {
        'packages/orchestrator': readSummary(root, packages['packages/orchestrator']),
        'packages/cli': null,
      },
      { allowMissing: true }
    );
    assert.equal(staleGraded.failures, 1); // demonstrates the bug the fix removes

    // THE FIX: prune stale summaries, then the affected run regenerates only cli.
    pruneCoverageSummaries(packages, root);
    mkdirSync(join(root, 'packages/cli/coverage'), { recursive: true });
    writeFileSync(
      join(root, packages['packages/cli']),
      JSON.stringify({
        total: {
          lines: { pct: 86 },
          branches: { pct: 76 },
          functions: { pct: 86 },
          statements: { pct: 86 },
        },
      })
    );

    const coverageByPkg = {
      'packages/orchestrator': readSummary(root, packages['packages/orchestrator']), // null: pruned, unaffected
      'packages/cli': readSummary(root, packages['packages/cli']), // fresh, meets baseline
    };
    const { failures, skipped } = evaluateCoverage(baselines, coverageByPkg, {
      allowMissing: true,
    });

    assert.equal(failures, 0); // no phantom regression from the stale file
    assert.deepEqual(skipped, ['packages/orchestrator']); // unaffected -> skipped, not graded
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// #544: per-package variance tolerance. cli is graded at a tighter 0.1% while
// every other package keeps the default 0.5%. Both the gate (evaluateCoverage)
// and the --update merge (mergeCoverageBaselines) must honour the per-package
// tolerance. These tests fail if the tolerance regresses back to a single
// global constant.
// ---------------------------------------------------------------------------

test('toleranceFor: cli overrides to 0.1%, others fall back to the default', () => {
  assert.equal(toleranceFor('packages/cli'), 0.1);
  assert.equal(toleranceFor('packages/core'), 0.5);
  assert.equal(toleranceFor('packages/unknown'), 0.5);
});

test('evaluateCoverage: cli fails on a 0.2% branch drop that core would absorb', () => {
  const baselines = {
    'packages/cli': { lines: 80, branches: 80.5, functions: 84, statements: 79 },
    'packages/core': { lines: 95, branches: 81.5, functions: 96, statements: 92 },
  };
  // Both packages drop the same 0.2% on branches. cli (0.1% tol) fails; core
  // (0.5% tol) is within noise and passes.
  const coverageByPkg = {
    'packages/cli': { lines: 80, branches: 80.3, functions: 84, statements: 79 },
    'packages/core': { lines: 95, branches: 81.3, functions: 96, statements: 92 },
  };
  const { failures } = evaluateCoverage(baselines, coverageByPkg, { allowMissing: false });
  assert.equal(failures, 1); // only cli
});

test('evaluateCoverage: cli within its 0.1% tolerance still passes', () => {
  const baselines = {
    'packages/cli': { lines: 80, branches: 80.5, functions: 84, statements: 79 },
  };
  const coverageByPkg = {
    'packages/cli': { lines: 80, branches: 80.45, functions: 84, statements: 79 }, // -0.05% < 0.1%
  };
  const { failures } = evaluateCoverage(baselines, coverageByPkg, { allowMissing: false });
  assert.equal(failures, 0);
});

test('mergeCoverageBaselines: a 0.2% cli branch move is adopted (beyond its 0.1% tol), core keeps it', () => {
  const committed = {
    'packages/cli': { lines: 80, branches: 80.5, functions: 84, statements: 79 },
    'packages/core': { lines: 95, branches: 81.5, functions: 96, statements: 92 },
  };
  const measured = {
    'packages/cli': { lines: 80, branches: 80.7, functions: 84, statements: 79 }, // +0.2% > 0.1%
    'packages/core': { lines: 95, branches: 81.7, functions: 96, statements: 92 }, // +0.2% < 0.5%
  };

  const merged = mergeCoverageBaselines(committed, measured);

  assert.equal(merged['packages/cli'].branches, 80.7); // real move locked in at 0.1% tol
  assert.equal(merged['packages/core'].branches, 81.5); // jitter kept stable at 0.5% tol
});

test('mergeCoverageBaselines: an explicit tolerance argument overrides the per-package map', () => {
  const committed = {
    'packages/cli': { lines: 80, branches: 80.5, functions: 84, statements: 79 },
  };
  const measured = { 'packages/cli': { lines: 80, branches: 80.7, functions: 84, statements: 79 } };

  // With an explicit 0.5% tolerance, the +0.2% cli move is treated as noise.
  const merged = mergeCoverageBaselines(committed, measured, 0.5);
  assert.equal(merged['packages/cli'].branches, 80.5);
});

test('benchmark: sub-threshold timing jitter keeps the committed file byte-identical', () => {
  const committed = {
    'core/validateConfig - valid config object': {
      mean: 0.001601108808008122,
      p99: 0.0032860000000027867,
    },
  };
  // The exact jitter that conflicted in #671 (mean move << 100% threshold).
  const measured = {
    'core/validateConfig - valid config object': {
      mean: 0.0018601312616490825,
      p99: 0.0030699999999797,
    },
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
    { existing: { mean: 0.5, p99: 0.6 }, fresh: { mean: 0.1, p99: 0.2 } }
  );

  assert.deepEqual(merged.existing, { mean: 0.5, p99: 0.6 }); // zero placeholder -> adopt
  assert.deepEqual(merged.fresh, { mean: 0.1, p99: 0.2 }); // new key -> adopt
});

// ---------------------------------------------------------------------------
// Second race in the same job, same file: the AUTO-MERGE call itself.
//
// The jitter gate above stops refresh PRs from CONFLICTING. It does nothing for
// the merge race: this repo has no `required_status_checks` branch rule, so
// `gh pr merge --auto` has nothing to wait on once the PAT approval lands inline
// and attempts an IMMEDIATE merge. When main advances between `gh pr create` and
// that call, the mergePullRequest mutation is rejected with "Base branch was
// modified" and the step exits non-zero, reddening main (runs 34227768312,
// 34042737396, 34042651655). The fix is a bounded retry that re-derives on the
// new tip, then a clean close-and-abstain on exhaustion.
//
// The defect lives in the workflow YAML rather than in a script, so these assert
// over the workflow text — the same reason this file exists at all.

const refreshBaselinesStep = (() => {
  const yml = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const start = yml.indexOf('- name: Commit refreshed baselines');
  assert.ok(start !== -1, 'ci.yml must still carry the "Commit refreshed baselines" step');
  const end = yml.indexOf('\n        env:', start);
  assert.ok(end !== -1, 'the step must still end with its env: block');
  return yml.slice(start, end);
})();

test('refresh-baselines: the auto-merge call sits inside a bounded retry', () => {
  assert.match(
    refreshBaselinesStep,
    /for attempt in 1 2 3; do/,
    'the merge must be retried a bounded number of times, not attempted once'
  );
  assert.match(
    refreshBaselinesStep,
    /rebuild_branch_on_main/,
    'each retry must re-derive the branch on the new origin/main tip, not blindly repeat'
  );
});

test('refresh-baselines: retry exhaustion closes the superseded PR and exits clean', () => {
  // A stale baseline PR must never be left open: .harness/**/baselines.json uses a
  // `merge=ours` driver, so landing it later would REVERT main's newer baselines.
  assert.match(
    refreshBaselinesStep,
    /gh pr close "\$PR_URL" --delete-branch/,
    'exhaustion must close the superseded refresh PR, never leave it open to accumulate'
  );
  assert.match(
    refreshBaselinesStep,
    /::notice::/,
    'the abstain must be announced in the run log, not silent'
  );
  assert.match(
    refreshBaselinesStep,
    /\n\s*exit 0\n\s*}/,
    'the abstain path must exit 0 — a superseded refresh is not a failure'
  );
});

test('refresh-baselines: the merge is not neutralised and the #531 scope guard survives', () => {
  assert.doesNotMatch(
    refreshBaselinesStep,
    /gh pr merge[^\n]*\|\|\s*true/,
    'the merge must never be silenced with `|| true` — that hides a real failure'
  );
  assert.match(
    refreshBaselinesStep,
    /assert-baseline-only-diff\.mjs/,
    'the fail-closed self-approval scope guard (#531) must still run before every approval'
  );
});
