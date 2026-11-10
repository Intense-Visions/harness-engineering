#!/usr/bin/env node
/**
 * Assert that a captured vitest log proves the suite RAN: at least one test
 * passed and nothing was skipped.
 *
 * Used by the `e2e-nightly` job in `.github/workflows/main-health.yml` to prove
 * the binary-gated D4 exit-code suite is reachable (the gate opened and the
 * tests executed) rather than skipped-by-default forever.
 *
 * Why this is a script and not an inline `grep` (issue #2353): the step used
 * to run `grep -qE "Tests +[0-9]+ passed"` over the raw log. On GitHub runners
 * vitest colorizes its summary, so the bytes are
 *
 *   ESC[2m      Tests ESC[22m ESC[1mESC[32m11 passed ESC[39m ...
 *
 * and the escape sequences between `Tests` and `11` meant the pattern could
 * never match. The step failed on every scheduled run even though all 11 tests
 * passed — and because it failed either way, it could no longer tell "ran and
 * passed" from "never ran". Stripping ANSI before matching makes the assertion
 * independent of whatever color support vitest detects.
 *
 * Exit codes:
 *   0  RAN       — summary line found with >= 1 passed test, nothing skipped.
 *   1  NOT_RAN   — summary missing, zero passed, or skipped tests reported.
 *   2  USAGE     — no log path given, or the log could not be read.
 *
 * Usage:
 *   node scripts/assert-vitest-ran.mjs <path-to-vitest-log> [label]
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXIT = Object.freeze({ RAN: 0, NOT_RAN: 1, USAGE: 2 });

// CSI sequences (colors, cursor movement) and OSC sequences (hyperlinks).
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

/** Remove ANSI escape sequences so assertions match the text a human reads. */
export function stripAnsi(text) {
  return text.replace(ANSI_PATTERN, '');
}

/**
 * Decide whether a vitest log proves the suite ran.
 * @param {string} rawLog captured stdout+stderr of `vitest run`, colored or not
 * @returns {{ ran: boolean, passed: number | null, reason: string }}
 */
export function assessVitestLog(rawLog) {
  const log = stripAnsi(rawLog);
  // The per-test summary line, e.g. "      Tests  11 passed (11)" or
  // "      Tests  10 passed | 1 skipped (11)". Anchored to the line start so
  // "Test Files  1 passed" is not mistaken for it.
  const summary = log.match(/^\s*Tests\s+(\d+)\s+passed\b/m);
  if (!summary) {
    return {
      ran: false,
      passed: null,
      reason:
        'no "Tests N passed" summary line in the vitest output — the suite did not run to completion',
    };
  }
  const passed = Number(summary[1]);
  if (passed < 1) {
    return { ran: false, passed, reason: 'vitest reported 0 passed tests' };
  }
  // Preserves the step's original semantics: ANY mention of "skipped" fails,
  // because a skipped gated test means the binary gate did not open.
  if (/skipped/.test(log)) {
    return {
      ran: false,
      passed,
      reason: 'vitest reported SKIPPED tests — the binary gate did not open',
    };
  }
  return { ran: true, passed, reason: `${passed} test(s) passed, none skipped` };
}

function main(argv) {
  const [logPath, label = 'suite'] = argv;
  if (!logPath) {
    console.error('usage: node scripts/assert-vitest-ran.mjs <path-to-vitest-log> [label]');
    return EXIT.USAGE;
  }
  let raw;
  try {
    raw = readFileSync(logPath, 'utf8');
  } catch (err) {
    console.error(`${label}: cannot read vitest log ${logPath}: ${err.message}`);
    return EXIT.USAGE;
  }
  const verdict = assessVitestLog(raw);
  if (!verdict.ran) {
    console.error(`${label}: ${verdict.reason}`);
    return EXIT.NOT_RAN;
  }
  console.log(`${label}: ${verdict.reason}`);
  return EXIT.RAN;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = main(process.argv.slice(2));
}
