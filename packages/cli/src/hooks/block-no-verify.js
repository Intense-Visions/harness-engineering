#!/usr/bin/env node
// block-no-verify.js — PreToolUse:Bash hook
// Blocks git commands that use --no-verify to skip hooks.
// Exit codes: 0 = allow, 2 = block

import { readFileSync } from 'node:fs';
import process from 'node:process';

function main() {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf-8');
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

    if (containsHookBypass(command)) {
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

// Strip heredoc bodies, quoted strings, and shell comments so flag detection
// runs against argv tokens only — not text the user is just talking about.
function stripStringsAndComments(cmd) {
  let s = cmd;
  s = s.replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\s*\1\b/g, ' ');
  s = s.replace(/'[^']*'/g, ' ');
  s = s.replace(/"(?:[^"\\]|\\.)*"/g, ' ');
  s = s.replace(/(^|[\s;&|`(])#[^\n]*/g, '$1');
  return s;
}

function containsHookBypass(command) {
  const stripped = stripStringsAndComments(command);
  if (/(?:^|\s)--no-verify(?=\s|$)/.test(stripped)) return true;
  if (/\bgit\s+(?:[\w-]+\s+)*?commit\b[^\n]*?(?:^|\s)-n(?=\s|$)/.test(stripped)) return true;
  return false;
}

main();
