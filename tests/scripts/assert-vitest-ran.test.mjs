/**
 * Tests for the D4 reachability assertion (issue #2353).
 *
 * The `e2e-nightly` step in `.github/workflows/main-health.yml` failed on every
 * scheduled run because vitest's colored summary defeated a raw `grep`. These
 * fixtures use the exact bytes from run 42660494703, ESC characters included.
 *
 * Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXIT, stripAnsi, assessVitestLog } from '../../scripts/assert-vitest-ran.mjs';

const ESC = '\x1b';
const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../scripts/assert-vitest-ran.mjs'
);

// Verbatim summary from the failing run (ESC restored from `gh run view --log`).
const COLORED_PASS = [
  `${ESC}[1m${ESC}[30m${ESC}[46m RUN ${ESC}[49m${ESC}[39m${ESC}[22m ${ESC}[36mv4.1.12 ${ESC}[39m`,
  ` ${ESC}[32m✓${ESC}[39m tests/integration/cleanup-duplication-exit-code.e2e.test.ts ${ESC}[2m(${ESC}[22m${ESC}[2m11 tests${ESC}[22m${ESC}[2m)${ESC}[22m`,
  '',
  `${ESC}[2m Test Files ${ESC}[22m ${ESC}[1m${ESC}[32m1 passed${ESC}[39m${ESC}[22m${ESC}[90m (1)${ESC}[39m`,
  `${ESC}[2m      Tests ${ESC}[22m ${ESC}[1m${ESC}[32m11 passed${ESC}[39m${ESC}[22m${ESC}[90m (11)${ESC}[39m`,
  `${ESC}[2m   Duration ${ESC}[22m 14.00s`,
].join('\n');

const PLAIN_PASS = ' Test Files  1 passed (1)\n      Tests  11 passed (11)\n';
const COLORED_SKIPPED = `${ESC}[2m      Tests ${ESC}[22m ${ESC}[1m${ESC}[32m10 passed${ESC}[39m${ESC}[22m${ESC}[2m | ${ESC}[22m${ESC}[33m1 skipped${ESC}[39m${ESC}[90m (11)${ESC}[39m\n`;
const ALL_SKIPPED = ' Test Files  1 skipped (1)\n      Tests  11 skipped (11)\n';
const NO_SUMMARY = ` ${ESC}[31mError: Cannot find module 'dist/bin/harness.js'${ESC}[39m\n`;
const ZERO_PASSED = '      Tests  0 passed (0)\n';

test('positive control: the old raw grep pattern cannot match the colored summary', () => {
  // This is the defect. If vitest ever stops coloring, this control flips and
  // the test should be revisited rather than deleted.
  assert.equal(/Tests +[0-9]+ passed/.test(COLORED_PASS), false);
  assert.equal(/Tests +[0-9]+ passed/.test(stripAnsi(COLORED_PASS)), true);
});

test('a colored, all-passing log is accepted', () => {
  assert.deepEqual(assessVitestLog(COLORED_PASS).ran, true);
  assert.equal(assessVitestLog(COLORED_PASS).passed, 11);
});

test('a plain, all-passing log is accepted', () => {
  assert.equal(assessVitestLog(PLAIN_PASS).ran, true);
});

test('a colored log reporting a skipped test is rejected', () => {
  const v = assessVitestLog(COLORED_SKIPPED);
  assert.equal(v.ran, false);
  assert.match(v.reason, /SKIPPED/);
});

test('an all-skipped log (gate never opened) is rejected', () => {
  assert.equal(assessVitestLog(ALL_SKIPPED).ran, false);
});

test('a log with no summary line is rejected', () => {
  const v = assessVitestLog(NO_SUMMARY);
  assert.equal(v.ran, false);
  assert.equal(v.passed, null);
});

test('zero passed tests is rejected', () => {
  assert.equal(assessVitestLog(ZERO_PASSED).ran, false);
});

test('"Test Files N passed" alone is not mistaken for the Tests summary', () => {
  assert.equal(assessVitestLog(' Test Files  1 passed (1)\n').ran, false);
});

test('CLI exit codes: RAN on colored pass, NOT_RAN on skip / missing, USAGE on no arg', () => {
  const dir = mkdtempSync(join(tmpdir(), 'assert-vitest-ran-'));
  const run = (content) => {
    const file = join(dir, `log-${Math.random().toString(36).slice(2)}.log`);
    writeFileSync(file, content);
    return spawnSync(process.execPath, [SCRIPT, file, 'D4'], { encoding: 'utf8' }).status;
  };
  assert.equal(run(COLORED_PASS), EXIT.RAN);
  assert.equal(run(COLORED_SKIPPED), EXIT.NOT_RAN);
  assert.equal(run(NO_SUMMARY), EXIT.NOT_RAN);
  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status, EXIT.USAGE);
  assert.equal(
    spawnSync(process.execPath, [SCRIPT, join(dir, 'missing.log')], { encoding: 'utf8' }).status,
    EXIT.USAGE
  );
});
