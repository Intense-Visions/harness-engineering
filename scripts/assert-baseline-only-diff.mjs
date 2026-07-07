#!/usr/bin/env node
// CI guard: refuse to self-approve a baseline-refresh PR whose diff reaches
// beyond the baseline allowlist. Reads changed paths on stdin (the output of
// `gh pr diff <url> --name-only`) and takes the allowlist as argv — the caller
// passes its own $BASELINE_FILES so the permitted set is defined in one place.
//
// Usage: gh pr diff "$PR_URL" --name-only | node scripts/assert-baseline-only-diff.mjs $BASELINE_FILES
//
// Exit 0 → diff is baseline-only, safe to approve. Exit 1 → fail closed.
import { assertBaselineOnly } from './lib/baseline-diff-guard.mjs';

// Accept the allowlist as either separate args (bash word-splits $BASELINE_FILES)
// or a single whitespace-joined string (zsh and other shells do not word-split
// unquoted expansions) — so the guard behaves identically regardless of shell.
const allowlist = process.argv
  .slice(2)
  .flatMap((a) => a.split(/\s+/))
  .filter(Boolean);
if (allowlist.length === 0) {
  console.error('baseline guard: no allowlist passed (expected $BASELINE_FILES as arguments) — refusing to approve.');
  process.exit(1);
}

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

const { ok, offending, changed } = assertBaselineOnly(input.split('\n'), allowlist);

if (!ok) {
  if (changed.length === 0) {
    console.error('baseline guard: PR diff is empty — refusing to self-approve.');
  } else {
    console.error('baseline guard: PR touches files outside the baseline allowlist — refusing to self-approve.');
    for (const f of offending) console.error(`  unexpected: ${f}`);
  }
  console.error(`  allowed: ${allowlist.join(', ')}`);
  process.exit(1);
}

console.log(`baseline guard: OK — ${changed.length} baseline file(s) only.`);
