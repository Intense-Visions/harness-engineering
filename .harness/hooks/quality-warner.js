#!/usr/bin/env node
// quality-warner.js — PostToolUse:Edit/Write hook (standard profile)
// Runs the project formatter/linter after edits and WARNS on violations.
// Never blocks (always exits 0). Warnings go to stderr.
// Exit codes: 0 = allow (always)
//
// This is the warn-tier sibling of strict-quality-gate.js. Both obtain their
// detection from format-check.js; only the exit-code policy differs.

import process from 'node:process';
import { runFormatCheck, parseHookInput } from './format-check.js';
import { readHookStdin } from './read-hook-stdin.js';

function main() {
  const stdin = readHookStdin();
  if (!stdin.ok) {
    // Warn-only, but say so: an unreadable stdin is not "no input" (#2337).
    process.stderr.write(
      `[quality-warner] could not read hook input (${stdin.error.code ?? stdin.error.message}); ` +
        `the edit was not checked.\n`
    );
    process.exit(0);
  }

  const input = parseHookInput(stdin.data);
  if (!input) {
    process.exit(0);
  }

  try {
    const result = runFormatCheck(input, process.cwd());
    // Warn-only: surface every outcome on stderr, never block.
    if (result.status !== 'clean' || result.name) {
      process.stderr.write(`[quality-warner] ${result.message}\n`);
    }
    process.exit(0);
  } catch {
    // Unexpected error — fail open.
    process.exit(0);
  }
}

main();
