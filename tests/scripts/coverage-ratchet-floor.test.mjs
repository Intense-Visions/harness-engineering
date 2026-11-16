/**
 * Regression tests for #2307: `coverage-ratchet.mjs --allow-missing` had no
 * floor. When EVERY package was skipped (zero measured) it still printed
 * "all packages meet or exceed baselines" and exited 0 — an empty measurement
 * set was indistinguishable from a clean pass.
 *
 * The fix separates two cases the old code conflated:
 *
 *   - nothing was IN SCOPE (e.g. a docs-only push: `turbo --affected` selects
 *     no package with a coverage baseline) -> a clean, explicit skip, exit 0,
 *     so such pushes are never blocked;
 *   - packages WERE in scope (or scope is unknown) but none produced coverage
 *     data -> abstain with EXIT.ZERO_DENOMINATOR (3), never a pass.
 *
 * The scope comes from `turbo run test:coverage --affected --dry=json`, the
 * same selection the pre-push coverage run uses.
 * Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { EXIT, ratchetVerdict, inScopeFromTurboDryRun } from '../../scripts/coverage-ratchet.mjs';

const SCRIPT = resolve(import.meta.dirname, '../../scripts/coverage-ratchet.mjs');
const BASE = { lines: 90, branches: 80, functions: 90, statements: 90 };
const MEASURED = { lines: 91, branches: 81, functions: 91, statements: 91 };

test('EXIT codes follow the repo abstention convention (3 = zero denominator)', () => {
  assert.equal(EXIT.PASS, 0);
  assert.equal(EXIT.REGRESSION, 1);
  assert.equal(EXIT.ZERO_DENOMINATOR, 3);
});

test('(a) packages in scope, zero produced data -> abstain (exit 3), never a pass', () => {
  const v = ratchetVerdict({
    allowMissing: true,
    failures: 0,
    graded: [],
    skipped: ['packages/core', 'packages/cli'],
    inScope: ['packages/cli'],
  });
  assert.equal(v.exitCode, EXIT.ZERO_DENOMINATOR);
  assert.doesNotMatch(v.message, /meet or exceed/);
  assert.match(v.message, /no coverage data/i);
});

test('(a) scope unknown and zero graded -> abstain (the #2307 floor)', () => {
  const v = ratchetVerdict({
    allowMissing: true,
    failures: 0,
    graded: [],
    skipped: ['packages/core', 'packages/cli'],
    inScope: null,
  });
  assert.equal(v.exitCode, EXIT.ZERO_DENOMINATOR);
  assert.doesNotMatch(v.message, /meet or exceed/);
});

test('(b) nothing in scope (docs-only push) -> clean skip, exit 0, says so explicitly', () => {
  const v = ratchetVerdict({
    allowMissing: true,
    failures: 0,
    graded: [],
    skipped: ['packages/core', 'packages/cli'],
    inScope: [],
  });
  assert.equal(v.exitCode, EXIT.PASS);
  assert.match(v.message, /nothing in scope/i);
  assert.doesNotMatch(v.message, /meet or exceed/);
});

test('(c) normal measured pass is unchanged and reports the graded/skipped split', () => {
  const v = ratchetVerdict({
    allowMissing: true,
    failures: 0,
    graded: ['packages/cli'],
    skipped: ['packages/core'],
    inScope: ['packages/cli'],
  });
  assert.equal(v.exitCode, EXIT.PASS);
  assert.match(v.message, /meet or exceed baselines/);
  assert.match(v.message, /graded 1, skipped 1/);
});

test('regressions still exit 1 regardless of scope', () => {
  const v = ratchetVerdict({
    allowMissing: true,
    failures: 2,
    graded: ['packages/cli'],
    skipped: [],
    inScope: ['packages/cli'],
  });
  assert.equal(v.exitCode, EXIT.REGRESSION);
});

test('inScopeFromTurboDryRun: picks real test:coverage tasks of baselined packages only', () => {
  const dry = {
    tasks: [
      { taskId: '@h/cli#build', directory: 'packages/cli', command: 'tsup' },
      {
        taskId: '@h/cli#test:coverage',
        directory: 'packages/cli',
        command: 'vitest run --coverage',
      },
      // Windows separators are normalized.
      { taskId: '@h/core#test:coverage', directory: 'packages\\core', command: 'vitest run' },
      // No such script -> turbo runs nothing -> not in scope.
      {
        taskId: '@h/dash#test:coverage',
        directory: 'packages/dashboard',
        command: '<NONEXISTENT>',
      },
      // Measured but not baselined -> not graded by the ratchet -> not in scope.
      { taskId: '@h/stats#test:coverage', directory: 'packages/stats', command: 'vitest run' },
    ],
  };
  const packages = { 'packages/cli': 'x', 'packages/core': 'y', 'packages/dashboard': 'z' };
  assert.deepEqual(inScopeFromTurboDryRun(dry, packages), ['packages/cli', 'packages/core']);
  assert.deepEqual(inScopeFromTurboDryRun({ tasks: [] }, packages), []);
  // Unparseable / wrong shape -> unknown scope (null), so the floor still applies.
  assert.equal(inScopeFromTurboDryRun(null, packages), null);
  assert.equal(inScopeFromTurboDryRun({ nope: 1 }, packages), null);
});

// --- End-to-end through the CLI, hermetic: a copy of the script in a temp root
// (ROOT is the script's parent dir), with its own baselines and coverage files.

function makeRoot({ withCliCoverage = false } = {}) {
  // realpath: macOS tmpdir is a symlink, which would defeat the script's invokedDirectly guard.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ratchet-floor-')));
  mkdirSync(join(root, 'scripts'));
  copyFileSync(SCRIPT, join(root, 'scripts/coverage-ratchet.mjs'));
  writeFileSync(
    join(root, 'coverage-baselines.json'),
    JSON.stringify({ 'packages/cli': BASE, 'packages/core': BASE })
  );
  if (withCliCoverage) {
    mkdirSync(join(root, 'packages/cli/coverage'), { recursive: true });
    const total = Object.fromEntries(Object.entries(MEASURED).map(([k, pct]) => [k, { pct }]));
    writeFileSync(
      join(root, 'packages/cli/coverage/coverage-summary.json'),
      JSON.stringify({ total })
    );
  }
  return root;
}

function runRatchet(root, args) {
  return spawnSync(process.execPath, [join(root, 'scripts/coverage-ratchet.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

function writeScope(root, dirs) {
  const file = join(root, 'scope.json');
  writeFileSync(
    file,
    JSON.stringify({
      tasks: dirs.map((d) => ({ taskId: `x#test:coverage`, directory: d, command: 'vitest' })),
    })
  );
  return file;
}

test('CLI (a): --allow-missing with zero coverage data and no scope exits 3, not "meet or exceed"', () => {
  const root = makeRoot();
  try {
    const r = runRatchet(root, ['--allow-missing']);
    assert.equal(r.status, EXIT.ZERO_DENOMINATOR, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout + r.stderr, /meet or exceed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI (a): packages in scope but none produced data exits 3', () => {
  const root = makeRoot();
  try {
    const r = runRatchet(root, [
      '--allow-missing',
      '--scope-from',
      writeScope(root, ['packages/cli']),
    ]);
    assert.equal(r.status, EXIT.ZERO_DENOMINATOR, r.stdout + r.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI (b): nothing in scope (docs-only push) exits 0 with an explicit skip', () => {
  const root = makeRoot();
  try {
    const r = runRatchet(root, ['--allow-missing', '--scope-from', writeScope(root, [])]);
    assert.equal(r.status, EXIT.PASS, r.stdout + r.stderr);
    assert.match(r.stdout, /nothing in scope/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI (b): an unreadable scope file is "unknown", so the floor still applies', () => {
  const root = makeRoot();
  try {
    const r = runRatchet(root, ['--allow-missing', '--scope-from', join(root, 'missing.json')]);
    assert.equal(r.status, EXIT.ZERO_DENOMINATOR, r.stdout + r.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI (c): a normal measured pass is unchanged (exit 0, meet or exceed, graded/skipped split)', () => {
  const root = makeRoot({ withCliCoverage: true });
  try {
    const r = runRatchet(root, [
      '--allow-missing',
      '--scope-from',
      writeScope(root, ['packages/cli']),
    ]);
    assert.equal(r.status, EXIT.PASS, r.stdout + r.stderr);
    assert.match(r.stdout, /meet or exceed baselines/);
    assert.match(r.stdout, /graded 1, skipped 1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
