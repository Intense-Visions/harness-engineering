#!/usr/bin/env node
// strict-quality-gate.js — PostToolUse:Edit/Write hook (strict profile only)
// Runs the project formatter/linter after edits and BLOCKS on real violations.
// Exit codes:
//   0 = allow (clean, or a deterministic infra-error → fail open)
//   2 = block (genuine format/lint violations, or no verdict could be obtained
//       because the formatter timed out or hook stdin could not be read;
//       stderr is fed back to Claude)
//
// A PostToolUse hook that exits 2 surfaces its stderr to Claude as a must-fix:
// the edit already landed, so the model is told to correct the violation.
//
// Fail-open contract: when the formatter is absent or its output is unparseable
// (infra-error, reason 'not-installed' | 'failed'), this hook writes a loud
// warning and exits 0 — a missing formatter must not wall off every edit.
//
// Fail-closed exceptions (#2337): a formatter TIMEOUT and an unreadable stdin
// both mean the gate has no verdict, and both depend on machine load rather than
// on the project. Failing open there let a genuine violation through under load
// while the gate reported a pass, so the strict gate blocks instead.

import process from 'node:process';
import { runFormatCheck, parseHookInput } from './format-check.js';
import { readHookStdin } from './read-hook-stdin.js';

function main() {
  const stdin = readHookStdin();
  if (!stdin.ok) {
    // The read FAILED (e.g. EAGAIN past the retry deadline): the gate is blind
    // to the edit it is checking and must not vouch for it (#993 / #2337).
    process.stderr.write(
      `[strict-quality-gate] BLOCKED — could not read hook input ` +
        `(${stdin.error.code ?? stdin.error.message}); the edit was not checked.\n`
    );
    process.exit(2);
  }

  const input = parseHookInput(stdin.data);
  if (!input) {
    // Legitimately empty or non-JSON payload — nothing to check.
    process.exit(0);
  }

  try {
    const result = runFormatCheck(input, process.cwd());

    if (result.status === 'violations') {
      process.stderr.write(
        `[strict-quality-gate] BLOCKED — ${result.message}\n` +
          `Fix the formatting/lint violations above before continuing.\n`
      );
      process.exit(2);
    }

    if (result.status === 'infra-error' && result.reason === 'timeout') {
      process.stderr.write(
        `[strict-quality-gate] BLOCKED — ${result.message}; the edit was not verified.\n` +
          `Re-run the formatter on the edited file and fix any violations it reports.\n`
      );
      process.exit(2);
    }

    if (result.status === 'infra-error') {
      process.stderr.write(`[strict-quality-gate] WARNING (failing open) — ${result.message}\n`);
      process.exit(0);
    }

    // clean
    process.exit(0);
  } catch {
    // Unexpected error — fail open.
    process.exit(0);
  }
}

main();
