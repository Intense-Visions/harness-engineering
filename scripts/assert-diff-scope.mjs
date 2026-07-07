#!/usr/bin/env node
// CI guard: refuse to self-approve a PR whose diff reaches beyond an allowed set
// of paths. Reads changed paths on stdin (the output of `gh pr diff <url>
// --name-only`) and takes the allowed patterns as argv. Patterns ending in `/`
// are directory prefixes; others are exact paths.
//
// Usage: gh pr diff "$PR_URL" --name-only | node scripts/assert-diff-scope.mjs docs/roadmap.md docs/roadmap.d/
//
// Exit 0 → diff is in scope, safe to approve. Exit 1 → fail closed.
import { assertDiffScope } from './lib/diff-scope-guard.mjs';

// Accept patterns as separate args (bash word-splits) or one whitespace-joined
// string (zsh and others do not word-split unquoted expansions) — behave the
// same regardless of shell.
const allowed = process.argv
  .slice(2)
  .flatMap((a) => a.split(/\s+/))
  .filter(Boolean);
if (allowed.length === 0) {
  console.error('diff-scope guard: no allowed paths passed — refusing to approve.');
  process.exit(1);
}

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

const { ok, offending, changed } = assertDiffScope(input.split('\n'), allowed);

if (!ok) {
  if (changed.length === 0) {
    console.error('diff-scope guard: PR diff is empty — refusing to self-approve.');
  } else {
    console.error(
      'diff-scope guard: PR touches paths outside the allowed scope — refusing to self-approve.'
    );
    for (const f of offending) console.error(`  unexpected: ${f}`);
  }
  console.error(`  allowed: ${allowed.join(', ')}`);
  process.exit(1);
}

console.log(`diff-scope guard: OK — ${changed.length} in-scope path(s) only.`);
