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

// Split a command into simple commands (segments) of shell words, the way the
// shell would: quotes are removed (`"-n"` and `'--no-verify'` reach git as
// flags) but quoted text stays inside ONE word, so a commit message like
// `-m "use -n here"` is a single value and never a flag. Each word records
// whether any part of it was quoted, so a quoted word that follows a
// value-taking option is read as that option's value.
//
// Segment separators: `;`, `&&`, `||`, `|`, `|&`, a background `&` (but not
// the `&` of a redirection such as `2>&1`, `&>file` or `&>>file`), newlines,
// subshell parens and backticks. A redirection is NOT a separator: in
// `git commit &>/dev/null -n` the `-n` is still an argument to git.
function tokenizeCommand(cmd) {
  const segments = [];
  let words = [];
  let value = '';
  let inWord = false;
  let quoted = false;
  const endWord = () => {
    if (inWord) words.push({ value, quoted });
    value = '';
    inWord = false;
    quoted = false;
  };
  const endSegment = () => {
    endWord();
    if (words.length) segments.push(words);
    words = [];
  };

  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === "'") {
      const close = cmd.indexOf("'", i + 1);
      const end = close === -1 ? cmd.length : close;
      value += cmd.slice(i + 1, end);
      i = end;
      inWord = quoted = true;
    } else if (c === '"') {
      i += 1;
      while (i < cmd.length && cmd[i] !== '"') {
        if (cmd[i] === '\\' && i + 1 < cmd.length && '"\\$`\n'.includes(cmd[i + 1])) {
          if (cmd[i + 1] !== '\n') value += cmd[i + 1];
          i += 2;
          continue;
        }
        value += cmd[i];
        i += 1;
      }
      inWord = quoted = true;
    } else if (c === '\\') {
      const next = cmd[i + 1];
      if (next === '\n' || (next === '\r' && cmd[i + 2] === '\n')) {
        i += next === '\r' ? 2 : 1; // line continuation
        continue;
      }
      // Keep the backslash before word characters so `\git` and Windows
      // paths (`C:\Git\cmd\git.exe`) still name git; an escaped separator or
      // quote is literal text.
      if (next !== undefined && /[\w.\\]/.test(next)) value += c;
      if (next !== undefined) value += next;
      i += 1;
      inWord = true;
    } else if (c === '#' && !inWord) {
      while (i + 1 < cmd.length && cmd[i + 1] !== '\n') i += 1; // comment
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
    } else if (c === '\n' || c === ';' || c === '(' || c === ')' || c === '`' || c === '|') {
      endSegment();
      if (c === '|' && (cmd[i + 1] === '|' || cmd[i + 1] === '&')) i += 1;
    } else if (c === '&') {
      const prev = cmd[i - 1];
      if (prev === '<' || prev === '>' || cmd[i + 1] === '>') {
        value += c; // part of a redirection
        inWord = true;
      } else {
        endSegment();
        if (cmd[i + 1] === '&') i += 1;
      }
    } else {
      value += c;
      inWord = true;
    }
  }
  endSegment();
  return segments;
}

// The text git receives for a word, with any remaining escapes removed.
function argText(word) {
  return word.value.replace(/\\/g, '');
}

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
    const tok = argText(args[i]);
    if (tok === '--') return false; // everything after is a pathspec
    if (!isShortOptionCluster(tok)) continue;
    const cluster = tok.slice(1);
    for (let j = 0; j < cluster.length; j++) {
      const opt = cluster[j];
      if (opt === 'n') return true;
      if (COMMIT_SHORT_OPTS_WITH_ATTACHED_VALUE.has(opt)) break;
      if (COMMIT_SHORT_OPTS_WITH_VALUE.has(opt)) {
        // The value is the cluster remainder, else the next argument. Never
        // let an UNQUOTED option-looking argument be swallowed as a value:
        // blocking a literal `-m -n` is the conservative reading. A quoted
        // next argument (`-m "-n is gone"`) is plainly the value.
        if (j === cluster.length - 1) {
          const next = args[i + 1];
          if (next !== undefined) {
            const text = argText(next);
            if (next.quoted || (text !== '--' && !isShortOptionCluster(text))) i += 1;
          }
        }
        break;
      }
    }
  }
  return false;
}

// git reads config from the environment too: GIT_CONFIG_COUNT with
// GIT_CONFIG_KEY_<n>/GIT_CONFIG_VALUE_<n>, and the older GIT_CONFIG_PARAMETERS.
// Either can point core.hooksPath somewhere empty.
function isHooksPathEnvAssignment(text) {
  return (
    /^GIT_CONFIG_KEY_\d+=core\.hookspath$/i.test(text) ||
    /^GIT_CONFIG_PARAMETERS=.*core\.hookspath/i.test(text)
  );
}

// Words that may precede an environment assignment in assignment position:
// `export A=b`, `env A=b git ...`, `declare -x A=b`.
const ENV_SETTING_WORDS = new Set(['export', 'env', 'declare', 'typeset', 'local', 'readonly']);

function segmentSetsHooksPathEnv(words) {
  for (const word of words) {
    const text = argText(word);
    if (isHooksPathEnvAssignment(text)) return true;
    const leading =
      /^[A-Za-z_]\w*=/.test(text) || ENV_SETTING_WORDS.has(text) || text.startsWith('-');
    if (!leading) return false; // past the assignment prefix: the command itself
  }
  return false;
}

function containsHookBypass(command) {
  const stripped = stripStringsAndComments(command);
  // harness-ignore SEC-AGT-006: definitional — this IS the detection regex for the bypass flag
  if (/(?:^|\s)--no-verify(?=\s|$)/.test(stripped)) return true;

  // Heredoc bodies are data, never argv.
  const withoutHeredocs = command.replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\s*\1\b/g, ' ');
  const segments = tokenizeCommand(withoutHeredocs);
  let envRelocatesHooks = false;
  let runsHookingGit = false;

  for (const words of segments) {
    if (segmentSetsHooksPathEnv(words)) envRelocatesHooks = true;
    const tokens = words.map(argText);
    for (let g = 0; g < words.length; g++) {
      if (!isGitCommandToken(words[g].value)) continue;
      const sub = findGitSubcommand(tokens, g);
      if (sub === -1) continue;
      const args = words.slice(sub + 1);
      const argTexts = tokens.slice(sub + 1);
      const dashDash = argTexts.indexOf('--');
      const options = dashDash === -1 ? argTexts : argTexts.slice(0, dashDash);
      if (options.some(isNoVerifyAbbreviation)) return true;
      if (HOOK_RUNNING_SUBCOMMANDS.has(tokens[sub])) {
        runsHookingGit = true;
        if (globalOptsRelocateHooks(tokens.slice(g + 1, sub))) return true;
      }
      if (tokens[sub] === 'commit' && commitArgsBypassHooks(args)) return true;
    }
  }
  return envRelocatesHooks && runsHookingGit;
}

main();
