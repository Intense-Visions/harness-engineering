#!/usr/bin/env node
// autonomy-guard.js — PreToolUse:Bash|Write|Edit|MultiEdit hook (trusted autonomy, D16)
//
// Narrows (does not close) the same-OS-user residual of the trusted-autonomy threat model:
//   1. Blocks Bash invocations of `harness autonomy set` that RAISE autonomy, or whose
//      arguments are not literally a lowering (a quoted or `$VAR` level is not provably
//      `supervised`, so it is blocked). Lowerings (`supervised`, `--audit on`) stay allowed.
//   2. Blocks Bash / Write / Edit targeting the user-level autonomy state:
//      ~/.harness/config.json, ~/.harness/session-overrides/, ~/.harness/autonomy-audit.log.
//
//   3. Blocks a `harness` invocation with a runtime-built argument (`$`, backtick, `$(`) when
//      that argument could select `autonomy set`: the subcommand word itself is runtime-built
//      (or not a plain word), or it is `autonomy` followed by anything but a literal `log` /
//      `show`. A literal non-raising subcommand (`harness validate --path "$PWD"`,
//      `harness autonomy log --session $s`) is allowed. Also blocks any `cd` / variable
//      assignment aimed at ~/.harness — indirection the literal matcher cannot follow.
//   4. Blocks agent writes to the append-only decision log
//      `.harness/sessions/<slug>/auto-decisions.jsonl` (Write / Edit / MultiEdit, relative or
//      absolute, resolved against the payload cwd; and Bash that redirects into it, names it
//      in a non-read-only command, assigns it to a variable, or hands it to a shell). Reads
//      stay allowed (the Read tool; `cat` / `tail` / `jq` / `grep` …), and the sanctioned
//      writer, the record_auto_decision MCP tool, never passes through this hook. In Bash any
//      file named auto-decisions.jsonl is treated as the log (a `cd` first defeats a path match).
//
// A raise must come from the human in their own terminal (interactive confirm) or from
// the user config they edit themselves. This hook is a tripwire, not a sandbox: a
// determined process running as the same user can still reach these files. Known residual
// evasions it does not attempt to catch: another interpreter (`python -c`, `node -e`),
// decoded payloads piped to a shell (`base64 -d | sh`), script files written then executed,
// aliases / shell functions, globbed or `..`-laundered paths, and symlinks created first.
// For the decision log (4) it also misses directory-level operations that never name the file:
// `cp -R` into a session dir, `rm -rf` / `mv` of a session dir, `ln -sfn` over one, `rsync`,
// `tar -C` extraction into one, and `git clean`. Unreadable-line reporting and the end-of-run
// summary make crude tampering visible; they do not catch a rewrite that stays well-formed.
//
// Exit codes: 0 = allow, 2 = block.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { readHookStdin } from './read-hook-stdin.js';

const PROTECTED_RELATIVE = ['config.json', 'session-overrides', 'autonomy-audit.log'];
// Any spelling of these in a Bash command (after quote/separator normalization) is blocked.
const PROTECTED_MENTION = /\.harness\/(?:session-overrides|config\.json|autonomy-audit\.log)/i;
const SHELL_TOKEN = /^(?:sh|bash|zsh|dash|ksh|fish|eval|source)$/;
const QUOTED = '__Q__';
// Placeholder for quoted text the shell expands at runtime (contains `$` or a backtick).
const QUOTED_DYNAMIC = '__Q$__';
const MAX_DEPTH = 4;
// Tools that cannot modify a file: never blocked (the hook matcher excludes them; this keeps a
// mis-registered matcher from turning the guard into a read barrier).
const READ_ONLY_TOOLS = new Set(['Read', 'NotebookRead', 'Glob', 'Grep', 'LS']);
// Normalized (lower-cased, forward-slash) absolute path of a session decision log.
const DECISION_LOG_PATH = /\/\.harness\/sessions\/[^/]+\/auto-decisions\.jsonl$/;
const DECISION_LOG_MENTION = /auto-decisions\.jsonl/i;
// A redirect whose target is the log: >, >>, 1>>, >|, &>, &>>, and <> (opens read-write).
const DECISION_LOG_REDIRECT = /(?:\d*>>?|>\||&>>?|<>)\s*[^\s;&|<>]*auto-decisions\.jsonl/i;
// Commands that only read their file arguments (no in-place / output-file option).
const READ_ONLY_COMMANDS = new Set([
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'wc',
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'jq',
  'stat',
  'ls',
  'file',
  'diff',
  'cmp',
  'sha256sum',
  'shasum',
  'md5',
  'md5sum',
  'hexdump',
  'od',
  'tac',
  'nl',
  'realpath',
  'readlink',
  'du',
  'test',
  '[',
]);

function main() {
  const stdin = readHookStdin();
  if (!stdin.ok) {
    // Fail CLOSED: a guard that cannot read the command it guards must not vouch for it.
    process.stderr.write(
      `BLOCKED: autonomy-guard could not read hook input (${stdin.error.code ?? stdin.error.message}); ` +
        'refusing to allow the tool call unverified.\n'
    );
    process.exit(2);
  }
  if (!stdin.data.trim()) process.exit(0);

  let input;
  try {
    input = JSON.parse(stdin.data);
  } catch {
    process.exit(0); // malformed payload — fail open, consistent with block-no-verify
  }

  try {
    if (READ_ONLY_TOOLS.has(input?.tool_name)) process.exit(0);
    const toolInput = input?.tool_input ?? {};
    const cwd = typeof input?.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
    let reason = null;
    if (typeof toolInput.command === 'string') {
      reason = bashViolation(toolInput.command);
    } else {
      const target = toolInput.file_path ?? toolInput.notebook_path;
      if (typeof target === 'string' && target) reason = pathViolation(target, cwd);
    }
    if (reason) {
      process.stderr.write(`BLOCKED: ${reason}\n`);
      process.exit(2);
    }
    process.exit(0);
  } catch {
    process.exit(0); // unexpected error — fail open, consistent with block-no-verify
  }
}

// --- Write / Edit -------------------------------------------------------------------------

function homeDir() {
  return os.homedir();
}

function expandTilde(p) {
  if (p === '~') return homeDir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(homeDir(), p.slice(2));
  return p;
}

/** realpath of the deepest existing ancestor, with the non-existent tail re-appended. */
function realpathLoose(p) {
  let head = p;
  const tail = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(head), ...tail.reverse());
    } catch {
      const parent = path.dirname(head);
      if (parent === head) return p;
      tail.push(path.basename(head));
      head = parent;
    }
  }
}

function norm(p) {
  return p.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
}

function isProtectedPath(abs) {
  const roots = new Set([
    path.join(homeDir(), '.harness'),
    realpathLoose(path.join(homeDir(), '.harness')),
  ]);
  const candidates = [norm(abs), norm(realpathLoose(abs))];
  for (const root of roots) {
    for (const rel of PROTECTED_RELATIVE) {
      const target = norm(path.join(root, rel));
      for (const c of candidates) {
        if (c === target || c.startsWith(`${target}/`)) return true;
      }
    }
  }
  return false;
}

function isDecisionLogPath(abs) {
  return [norm(abs), norm(realpathLoose(abs))].some((c) => DECISION_LOG_PATH.test(c));
}

const DECISION_LOG_MESSAGE =
  'is the append-only auto-decision log (auto-decisions.jsonl). Agents may not write, ' +
  'truncate or replace it; record decisions through the record_auto_decision MCP tool, and ' +
  'read it with the Read tool or `harness autonomy log`.';

function pathViolation(target, cwd) {
  const abs = path.resolve(cwd, expandTilde(target));
  if (isDecisionLogPath(abs)) return `${target} ${DECISION_LOG_MESSAGE}`;
  if (!isProtectedPath(abs)) return null;
  return (
    `${target} is user-level autonomy state (~/.harness/config.json, session-overrides/, ` +
    'autonomy-audit.log). Agents may not modify it (D16). To lower autonomy use ' +
    "`harness autonomy set supervised` or manage_state set-autonomy; a raise is the human's to make."
  );
}

// --- Bash -------------------------------------------------------------------------------

const HEREDOC = /<<-?\s*['"]?(\w+)['"]?[^\n]*\n([\s\S]*?)\n\s*\1\b/g;
const SEGMENT_SEPARATOR = /&&|\|\||\|&?|;|(?<![<>])&(?!>)|\n|[()`]/;

/**
 * A quoted word with no whitespace, `$` or backtick is the same word to the shell
 * (`"autonomy"` === `autonomy`, `auto''nomy` === `autonomy`), so it is restored into the code
 * stream verbatim (no padding — adjacent text concatenates). Anything else is literal text
 * and becomes a placeholder.
 */
const RESTORABLE = /^[^\s$`]*$/;
const RESTORE_MARK = (i) => `\uE000${i}\uE000`;
const RESTORE_REF = /\uE000(\d+)\uE000/g;

/** Separate a command into code (quotes → placeholder) plus the literal texts it carries. */
function split(cmd) {
  const heredocs = [];
  let s = cmd.replace(HEREDOC, (_m, _tag, body) => {
    heredocs.push(body);
    return ` ${QUOTED} `;
  });
  const singles = [];
  const doubles = [];
  const restored = [];
  const keep = (text) => {
    restored.push(text);
    return RESTORE_MARK(restored.length - 1);
  };
  s = s.replace(/'([^']*)'/g, (_m, body) => {
    singles.push(body);
    return RESTORABLE.test(body) ? keep(body) : ` ${QUOTED} `;
  });
  s = s.replace(/"((?:[^"\\]|\\.)*)"/g, (_m, body) => {
    doubles.push(body);
    // Inside double quotes a backslash only escapes $ ` " \ — elsewhere it is literal.
    if (RESTORABLE.test(body)) return keep(body.replace(/\\([$`"\\])/g, '$1'));
    return /[$`]/.test(body) ? ` ${QUOTED_DYNAMIC} ` : ` ${QUOTED} `;
  });
  s = s.replace(/(^|[\s;&|`(])#[^\n]*/g, '$1'); // comments
  // Unquoted, `\y` is just `y`: strip backslashes before word characters (after joining
  // line continuations) BEFORE restoring quoted words, whose backslashes are literal.
  const code = s
    .replace(/\\\r?\n/g, ' ')
    .replace(/\\(?=\w)/g, '')
    .replace(RESTORE_REF, (_m, i) => restored[Number(i)]);
  return { code, heredocs, singles, doubles };
}

function tokens(segment) {
  return segment.trim().split(/\s+/).filter(Boolean);
}

function hasShellToken(code) {
  return code
    .split(SEGMENT_SEPARATOR)
    .some((seg) => tokens(seg).some((t) => SHELL_TOKEN.test(t.split(/[\\/]/).pop())));
}

/** True unless the `autonomy set` arguments are literally a lowering. */
function setArgsRaise(args) {
  let level;
  let audit;
  let extraPositional = false;
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === '--audit') {
      audit = args[++i] ?? QUOTED;
    } else if (t.startsWith('--audit=')) {
      audit = t.slice('--audit='.length);
    } else if (t === '--session' || t === '--for') {
      i++;
    } else if (t.startsWith('-')) {
      continue;
    } else if (level === undefined) {
      level = t;
    } else {
      extraPositional = true;
    }
  }
  const levelOk = level === undefined || level === 'supervised';
  const auditOk = audit === undefined || audit === 'on';
  return extraPositional || !levelOk || !auditOk;
}

function codeRaises(code) {
  for (const segment of code.split(SEGMENT_SEPARATOR)) {
    const toks = tokens(segment);
    for (let i = 0; i + 1 < toks.length; i++) {
      if (toks[i] === 'autonomy' && toks[i + 1] === 'set' && setArgsRaise(toks.slice(i + 2))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Literal text (quoted strings, heredoc bodies) is only code when something executes it:
 * an argument to a shell / eval, or a command substitution inside double quotes. Treating
 * all text as code would block a commit message that merely mentions the command.
 */
function raisesAutonomy(cmd, depth = 0) {
  if (depth > MAX_DEPTH) return true;
  const { code, heredocs, singles, doubles } = split(cmd);
  if (codeRaises(code)) return true;
  const shell = hasShellToken(code);
  const executed = [
    ...(shell ? [...singles, ...doubles, ...heredocs] : []),
    ...doubles.filter((d) => d.includes('$(') || d.includes('`')),
  ];
  return executed.some((text) => raisesAutonomy(text, depth + 1));
}

// --- N1: indirection the literal matcher cannot follow -------------------------------------

/** Like SEGMENT_SEPARATOR, but keeps `$(…)` and backticks inside the segment they feed. */
const COMMAND_SEPARATOR = /&&|\|\||\|&?|;|(?<![<>])&(?!>)|\n/;
// A token that invokes harness, possibly opening a substitution: harness, npx harness, $(harness,
// node …/harness.js, ./node_modules/.bin/harness.
const HARNESS_BIN = /^[$(`]*(?:[^\s(`]*\/)?harness(?:\.js)?$/;
const RUNTIME_BUILT = /[$`]/;
// A subcommand word the shell passes through unchanged (no expansion, no quoted placeholder).
const LITERAL_WORD = /^[A-Za-z][\w:-]*$/;
// `autonomy` subcommands that only read, so runtime-built arguments cannot raise through them.
const AUTONOMY_READ_ONLY = new Set(['log', 'show']);
const HOME_HARNESS = /(?:~|\$HOME|\$\{HOME\})\/+\.harness(?![\w.-])/;
const CD_TOKEN = /(?:^|[\s;&|(`])cd(?=\s|$)/;
const ASSIGNMENT = /(?:^|[\s;&|(`])[A-Za-z_]\w*\+?=/;

/**
 * Index of the first non-option token at or after `i`. A runtime-built option is not skipped:
 * an unquoted expansion word-splits (`-$X` can become `-q autonomy set trusted`).
 */
function firstWordAt(toks, i) {
  let j = i;
  while (j < toks.length && toks[j].startsWith('-') && !RUNTIME_BUILT.test(toks[j])) j++;
  return j;
}

/** True when the subcommand chosen by the args starting at `start` could be `autonomy set`. */
function couldSelectAutonomySet(toks, start) {
  const i = firstWordAt(toks, start);
  if (!LITERAL_WORD.test(toks[i] ?? '')) return true;
  if (toks[i] !== 'autonomy') return false;
  return !AUTONOMY_READ_ONLY.has(toks[firstWordAt(toks, i + 1)]);
}

/** True when some harness invocation in `segment` has a runtime-built argument that could raise. */
function segmentHasUnsafeDynamicHarness(segment) {
  const toks = tokens(segment);
  return toks.some(
    (t, i) =>
      HARNESS_BIN.test(t) &&
      toks.slice(i + 1).some((a) => RUNTIME_BUILT.test(a)) &&
      couldSelectAutonomySet(toks, i + 1)
  );
}

/**
 * True when a `harness` invocation takes an argument built at runtime ($VAR, $(…), `…`) that
 * could select `autonomy set` (see couldSelectAutonomySet).
 */
function dynamicHarnessArgs(cmd, depth = 0) {
  if (depth > MAX_DEPTH) return true;
  const { code, heredocs, singles, doubles } = split(cmd);
  if (code.split(COMMAND_SEPARATOR).some(segmentHasUnsafeDynamicHarness)) return true;
  const executed = [
    ...(hasShellToken(code) ? [...singles, ...doubles, ...heredocs] : []),
    ...doubles.filter((d) => d.includes('$(') || d.includes('`')),
  ];
  return executed.some((text) => dynamicHarnessArgs(text, depth + 1));
}

/** True when the command `cd`s into, or assigns a variable from, ~/.harness. */
function aimsAtHomeHarness(cmd) {
  const { code } = split(cmd);
  const text = hasShellToken(code) ? cmd : cmd.replace(HEREDOC, ' ');
  if (!HOME_HARNESS.test(text.replace(/['"]/g, ''))) return false;
  return CD_TOKEN.test(code) || ASSIGNMENT.test(code);
}

function mentionsProtectedState(cmd) {
  // Heredoc bodies fed to non-shells are data (e.g. a commit message); everything else counts,
  // including quoted redirect targets such as > "$HOME/.harness/config.json".
  const { code, heredocs } = split(cmd);
  const shell = hasShellToken(code);
  const text = shell ? cmd : cmd.replace(HEREDOC, ' ');
  const flat = text
    .replace(/['"\\]/g, (c) => (c === '\\' ? '/' : ''))
    .replace(/\/(?:\.\/)+/g, '/')
    .replace(/\/{2,}/g, '/');
  if (PROTECTED_MENTION.test(flat)) return true;
  return shell && heredocs.some((h) => PROTECTED_MENTION.test(h));
}

/**
 * True when a Bash command could modify a file named auto-decisions.jsonl. Fail-closed by
 * allowlist: every command segment that names the log must start with a read-only command,
 * nothing may redirect into it, and a shell / eval that executes text naming it is blocked.
 */
function writesDecisionLog(cmd) {
  const { code } = split(cmd);
  const shell = hasShellToken(code);
  // Heredoc bodies fed to non-shells are data (e.g. a commit message).
  const text = shell ? cmd : cmd.replace(HEREDOC, ' ');
  const flat = text.replace(/['"\\]/g, '');
  if (!DECISION_LOG_MENTION.test(flat)) return false;
  if (shell || DECISION_LOG_REDIRECT.test(flat)) return true;
  return flat.split(SEGMENT_SEPARATOR).some((seg) => {
    if (!DECISION_LOG_MENTION.test(seg)) return false;
    const toks = tokens(seg);
    let i = 0;
    while (i < toks.length && /^[A-Za-z_]\w*\+?=/.test(toks[i])) i++; // env assignments
    if (i >= toks.length) return true; // a variable assigned the log path: indirection
    return !READ_ONLY_COMMANDS.has(toks[i].split('/').pop());
  });
}

function bashViolation(cmd) {
  if (raisesAutonomy(cmd)) {
    return (
      '`harness autonomy set` with a raising (or non-literal) level/audit. Raising autonomy ' +
      '(trusted, or --audit off) is for the human to run in their own terminal (D16). ' +
      'Lowering is allowed: `harness autonomy set supervised` / `--audit on`.'
    );
  }
  if (dynamicHarnessArgs(cmd)) {
    return (
      'a `harness` invocation with a runtime-built argument ($VAR, $(…), backticks) where the ' +
      'subcommand is not a literal non-raising one cannot be checked for an autonomy raise ' +
      '(D16). Spell the subcommand (and any `autonomy` arguments) out literally.'
    );
  }
  if (aimsAtHomeHarness(cmd)) {
    return (
      '`cd` or a variable assignment aimed at ~/.harness can reach user-level autonomy state ' +
      'indirectly (D16). Use absolute, literal paths outside session-overrides/ and config.json.'
    );
  }
  if (mentionsProtectedState(cmd)) {
    return (
      'this command touches user-level autonomy state (~/.harness/config.json, ' +
      'session-overrides/, autonomy-audit.log). Agents may not modify it (D16); to inspect it ' +
      'use the Read tool or `harness autonomy show`.'
    );
  }
  if (writesDecisionLog(cmd)) {
    return (
      'this command can modify .harness/sessions/<slug>/auto-decisions.jsonl, the append-only ' +
      'auto-decision log. Agents may not write it directly; record decisions through the ' +
      'record_auto_decision MCP tool. Reading is allowed (cat, tail, jq, grep, the Read tool, ' +
      '`harness autonomy log`).'
    );
  }
  return null;
}

main();
