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

// Shell command separators: `;`, `&&`, `||`, `|`, `|&`, a background `&`
// (but not the `&` of a redirection such as `2>&1`, `&>file` or `&>>file`),
// newlines, subshell parens and backticks. A flag in one segment never belongs
// to another. A redirection is NOT a separator: in `git commit &>/dev/null -n`
// the `-n` is still an argument to git.
const SEGMENT_SEPARATOR = /&&|\|\||\|&?|;|(?<![<>])&(?!>)|\n|[()`]/;

// git global options (before the subcommand) that take a separate value.
const GIT_GLOBAL_OPTS_WITH_VALUE = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--super-prefix',
  '--config-env',
  '--exec-path',
]);

// `git commit` short options that REQUIRE a value: the rest of the cluster is
// the value, or the next argument when the option ends the cluster
// (`-mn` is message "n", `-m x` is message "x").
const COMMIT_SHORT_OPTS_WITH_VALUE = new Set(['F', 'm', 'c', 'C', 't', 'U']);
// Short options whose value is OPTIONAL and only ever attached (`-uno`, `-Skey`).
const COMMIT_SHORT_OPTS_WITH_ATTACHED_VALUE = new Set(['S', 'u']);

// git subcommands that run client-side hooks — where relocating the hooks
// directory with `-c core.hooksPath=...` amounts to skipping them.
const HOOK_RUNNING_SUBCOMMANDS = new Set([
  'am',
  'checkout',
  'cherry-pick',
  'commit',
  'merge',
  'pull',
  'push',
  'rebase',
  'revert',
  'switch',
  'worktree',
]);

// True for the git executable however it is spelled: `git`, `\git` (alias
// bypass), `/usr/bin/git`, `git.exe`, `C:\Git\cmd\git.exe`.
function isGitCommandToken(token) {
  const base = token.replace(/^\\+/, '').split(/[\\/]/).pop().toLowerCase();
  return base === 'git' || base === 'git.exe';
}

// git accepts any unambiguous prefix of a long option, so `--no-verif` and
// `--no-v` are `--no-verify`. Treat every prefix from `--no-v` up as the flag.
function isNoVerifyAbbreviation(token) {
  // harness-ignore SEC-AGT-006: definitional — this IS the detection of the bypass flag
  return token.length >= '--no-v'.length && '--no-verify'.startsWith(token);
}

// True when the global options between `git` and its subcommand point
// core.hooksPath somewhere else (`-c core.hooksPath=...`, `--config-env ...`).
function globalOptsRelocateHooks(globalOpts) {
  for (let i = 0; i < globalOpts.length; i++) {
    const tok = globalOpts[i];
    let assignment;
    if (tok === '-c' || tok === '--config-env') assignment = globalOpts[i + 1];
    else if (tok.startsWith('--config-env=')) assignment = tok.slice('--config-env='.length);
    if (assignment && /^core\.hookspath=/i.test(assignment)) return true;
  }
  return false;
}

function isShortOptionCluster(token) {
  return /^-[A-Za-z]/.test(token);
}

// Index of the git subcommand following the `git` token at `gitIndex`, or -1.
function findGitSubcommand(tokens, gitIndex) {
  let i = gitIndex + 1;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (!tok.startsWith('-')) return i;
    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(tok)) i += 2;
    else i += 1;
  }
  return -1;
}

// True when a `git commit` argument list carries -n, alone or inside an
// aggregated short-option cluster (`-nm`, `-an`).
function commitArgsBypassHooks(args) {
  for (let i = 0; i < args.length; i++) {
    const tok = args[i];
    if (tok === '--') return false; // everything after is a pathspec
    if (!isShortOptionCluster(tok)) continue;
    const cluster = tok.slice(1);
    for (let j = 0; j < cluster.length; j++) {
      const opt = cluster[j];
      if (opt === 'n') return true;
      if (COMMIT_SHORT_OPTS_WITH_ATTACHED_VALUE.has(opt)) break;
      if (COMMIT_SHORT_OPTS_WITH_VALUE.has(opt)) {
        // The value is the cluster remainder, else the next argument. Never
        // let an option-looking argument be swallowed as a value: blocking a
        // literal `-m -n` is the conservative reading.
        if (j === cluster.length - 1) {
          const next = args[i + 1];
          if (next !== undefined && next !== '--' && !isShortOptionCluster(next)) i += 1;
        }
        break;
      }
    }
  }
  return false;
}

function containsHookBypass(command) {
  const stripped = stripStringsAndComments(command);
  // harness-ignore SEC-AGT-006: definitional — this IS the detection regex for the bypass flag
  if (/(?:^|\s)--no-verify(?=\s|$)/.test(stripped)) return true;

  const joined = stripped.replace(/\\\r?\n/g, ' '); // line continuations
  for (const segment of joined.split(SEGMENT_SEPARATOR)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    for (let g = 0; g < tokens.length; g++) {
      if (!isGitCommandToken(tokens[g])) continue;
      const sub = findGitSubcommand(tokens, g);
      if (sub === -1) continue;
      const args = tokens.slice(sub + 1);
      const dashDash = args.indexOf('--');
      const options = dashDash === -1 ? args : args.slice(0, dashDash);
      if (options.some(isNoVerifyAbbreviation)) return true;
      if (
        HOOK_RUNNING_SUBCOMMANDS.has(tokens[sub]) &&
        globalOptsRelocateHooks(tokens.slice(g + 1, sub))
      ) {
        return true;
      }
      if (tokens[sub] === 'commit' && commitArgsBypassHooks(args)) return true;
    }
  }
  return false;
}

main();
