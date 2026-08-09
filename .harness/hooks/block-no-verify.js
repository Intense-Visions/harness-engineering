#!/usr/bin/env node
// block-no-verify.js — PreToolUse:Bash hook
// harness-ignore SEC-AGT-006: definitional — this hook exists to BLOCK the bypass flag it names
// Blocks git commands that use --no-verify to skip hooks.
// Exit codes: 0 = allow, 2 = block

import process from 'node:process';

import { readHookStdin } from './read-hook-stdin.js';

function main() {
  const stdin = readHookStdin();
  if (!stdin.ok) {
    // Fail CLOSED. A guard that cannot read the command it is guarding must not
    // vouch for it — exiting 0 here is what let --no-verify through whenever the
    // stdin pipe hiccuped, while CI still went green.
    process.stderr.write(
      `BLOCKED: could not read hook input (${stdin.error.code ?? stdin.error.message}); ` +
        'refusing to allow the command unverified.\n'
    );
    process.exit(2);
  }

  const raw = stdin.data;

  // A successful read of nothing is a real "no payload" invocation, not a
  // blind hook — that stays fail-open.
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
        // harness-ignore SEC-AGT-006: definitional — user-facing message names the flag this hook blocks
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
  // harness-ignore SEC-AGT-006: definitional — this IS the detection regex for the bypass flag
  if (/(?:^|\s)--no-verify(?=\s|$)/.test(stripped)) return true;
  if (/\bgit\s+(?:[\w-]+\s+)*?commit\b[^\n]*?(?:^|\s)-n(?=\s|$)/.test(stripped)) return true;
  return false;
}

main();
