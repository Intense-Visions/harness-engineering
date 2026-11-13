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
// A raise must come from the human in their own terminal (interactive confirm) or from
// the user config they edit themselves. This hook is a tripwire, not a sandbox: a
// determined process running as the same user can still reach these files.
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
const MAX_DEPTH = 4;

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

function pathViolation(target, cwd) {
  const abs = path.resolve(cwd, expandTilde(target));
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

/** Separate a command into code (quotes → placeholder) plus the literal texts it carries. */
function split(cmd) {
  const heredocs = [];
  let s = cmd.replace(HEREDOC, (_m, _tag, body) => {
    heredocs.push(body);
    return ` ${QUOTED} `;
  });
  const singles = [];
  const doubles = [];
  s = s.replace(/'([^']*)'/g, (_m, body) => {
    singles.push(body);
    return ` ${QUOTED} `;
  });
  s = s.replace(/"((?:[^"\\]|\\.)*)"/g, (_m, body) => {
    doubles.push(body);
    return ` ${QUOTED} `;
  });
  s = s.replace(/(^|[\s;&|`(])#[^\n]*/g, '$1'); // comments
  return { code: s.replace(/\\\r?\n/g, ' '), heredocs, singles, doubles };
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

function bashViolation(cmd) {
  if (raisesAutonomy(cmd)) {
    return (
      '`harness autonomy set` with a raising (or non-literal) level/audit. Raising autonomy ' +
      '(trusted, or --audit off) is for the human to run in their own terminal (D16). ' +
      'Lowering is allowed: `harness autonomy set supervised` / `--audit on`.'
    );
  }
  if (mentionsProtectedState(cmd)) {
    return (
      'this command touches user-level autonomy state (~/.harness/config.json, ' +
      'session-overrides/, autonomy-audit.log). Agents may not modify it (D16); to inspect it ' +
      'use the Read tool or `harness autonomy show`.'
    );
  }
  return null;
}

main();
