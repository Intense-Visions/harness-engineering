#!/usr/bin/env node
// block-no-verify.js — PreToolUse:Bash hook
// Blocks git commands that use --no-verify to skip hooks.
// Exit codes: 0 = allow, 2 = block

import { readFileSync } from 'node:fs';
import process from 'node:process';

function readStdinSync() {
  return readFileSync(process.platform === 'win32' ? 0 : '/dev/stdin', 'utf-8');
}

function main() {
  let raw = '';
  try {
    raw = readStdinSync();
  } catch {
    // No stdin or read error — fail open
    process.exit(0);
  }

  if (!raw.trim()) {
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    // Malformed JSON — fail open
    process.exit(0);
  }

  try {
    const command = input?.tool_input?.command ?? '';
    if (typeof command !== 'string') {
      process.exit(0);
    }

    if (/--no-verify/.test(command) || /\bgit\b.*\bcommit\b.*\s-n\b/.test(command)) {
      process.stderr.write(
        'BLOCKED: --no-verify flag detected. Hooks must not be bypassed.\n'
      );
      process.exit(2);
    }

    process.exit(0);
  } catch {
    // Unexpected error — fail open
    process.exit(0);
  }
}

main();
