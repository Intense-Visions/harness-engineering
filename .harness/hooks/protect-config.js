#!/usr/bin/env node
// protect-config.js — PreToolUse:Write/Edit hook
// Blocks modifications to linter/formatter config files, unless a human has
// recorded a decision for that file in the override ledger (see below).
// Fail policy is split by failure mode:
//   - Stdin present but empty, or not parseable as JSON: fail-OPEN (exit 0), logged
//     to stderr. These are the partial-stdin glitches issue #619 documents;
//     blocking them would self-DoS legitimate writes.
//   - Stdin unreadable (the read itself failed, e.g. EAGAIN past the retry deadline):
//     fail-CLOSED (exit 2). A guard that cannot see the edit must not vouch for it (#993).
//   - Well-formed request whose edit target is unresolvable (missing/non-string file_path,
//     or an unexpected processing error): fail-CLOSED (exit 2) — refuse rather than allow a
//     potentially unprotected config edit.
//
// Override ledger (.harness/config-overrides.json at the repo root):
//   { "overrides": [ { "file": "eslint.config.mjs", "reason": "...",
//       "decision": "<issue/PR/ADR url or id>", "approvedBy": "<who>",
//       "expires": "YYYY-MM-DD" } ] }
//   A protected-file edit is allowed only when an entry names that file by its
//   repo-relative path, every field is a non-empty string, and `expires` is today
//   or later (UTC). Expired, partial or malformed entries count as absent: the
//   edit stays blocked and the message says why. An allowed edit writes a
//   one-line stderr notice naming the entry. The ledger is itself protected, so
//   the allow path can never unlock it: only a human or a reviewed PR adds entries.
//
//   Why repo-relative path and not basename: one `eslint.config.mjs` entry must not
//   unlock every same-named config in a monorepo. The repo root is the nearest
//   ancestor of the edit target that contains `.git`, so a worktree reads its own
//   branch's ledger.
// Exit codes: 0 = allow, 2 = block

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';

import { readHookStdin } from './read-hook-stdin.js';

const LEDGER_RELATIVE_PATH = '.harness/config-overrides.json';
const LEDGER_FIELDS = ['file', 'reason', 'decision', 'approvedBy', 'expires'];

// Protected config file patterns
const PROTECTED_PATTERNS = [
  /^\.eslintrc/,
  /^eslint\.config\./,
  /^\.prettierrc/,
  /^prettier\.config\./,
  /^biome\.json$/,
  /^biome\.jsonc$/,
  /^\.ruff\.toml$/,
  /^ruff\.toml$/,
  /^\.stylelintrc/,
  /^\.markdownlint/,
  /^deno\.json$/,
  // The override ledger. Protecting it keeps the allow path from unlocking itself.
  /^config-overrides\.json$/,
];

function isProtected(filePath) {
  const base = basename(filePath);
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(base));
}

function isLedgerFile(filePath) {
  return basename(filePath) === basename(LEDGER_RELATIVE_PATH);
}

/** Nearest ancestor of `startDir` (inclusive) that contains `.git`, or null. */
function findRepoRoot(startDir) {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function toPosix(p) {
  return p.split('\\').join('/');
}

function normalizeEntryPath(p) {
  return toPosix(p).replace(/^(\.\/)+/, '');
}

/** Today as YYYY-MM-DD in UTC, so CI and laptops in any timezone agree. */
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Why an entry cannot be honoured, or null when it is valid today. */
function entryProblem(entry, today) {
  const missing = LEDGER_FIELDS.filter(
    (field) => typeof entry[field] !== 'string' || !entry[field].trim()
  );
  if (missing.length > 0) return `missing or empty field(s): ${missing.join(', ')}`;
  if (!isRealDate(entry.expires)) return `expires "${entry.expires}" is not a YYYY-MM-DD date`;
  if (entry.expires < today) return `expired on ${entry.expires}`;
  return null;
}

/**
 * Look up a ledger override for a protected file.
 * @returns {{ allowed: true, entry: object } | { allowed: false, reason: string }}
 */
function findOverride(absPath) {
  const root = findRepoRoot(dirname(absPath));
  if (!root) {
    return {
      allowed: false,
      reason: `no repo root (.git) above the file, so no ${LEDGER_RELATIVE_PATH}`,
    };
  }
  const ledgerPath = join(root, LEDGER_RELATIVE_PATH);
  if (!existsSync(ledgerPath)) {
    return { allowed: false, reason: `no ${LEDGER_RELATIVE_PATH} in this repo` };
  }

  let ledger;
  try {
    ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));
  } catch (err) {
    return {
      allowed: false,
      reason: `${LEDGER_RELATIVE_PATH} could not be read as JSON (${err.code ?? err.message}); ignored`,
    };
  }
  if (!ledger || typeof ledger !== 'object' || !Array.isArray(ledger.overrides)) {
    return {
      allowed: false,
      reason: `${LEDGER_RELATIVE_PATH} has no "overrides" array; ignored`,
    };
  }

  const relPath = toPosix(relative(root, absPath));
  const candidates = ledger.overrides.filter(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      typeof entry.file === 'string' &&
      normalizeEntryPath(entry.file) === relPath
  );
  if (candidates.length === 0) {
    return { allowed: false, reason: `${LEDGER_RELATIVE_PATH} has no entry for "${relPath}"` };
  }

  const today = todayUtc();
  const problems = [];
  for (const entry of candidates) {
    const problem = entryProblem(entry, today);
    if (!problem) return { allowed: true, entry, relPath };
    problems.push(problem);
  }
  return {
    allowed: false,
    reason: `the entry for "${relPath}" in ${LEDGER_RELATIVE_PATH} is ignored: ${problems.join('; ')}`,
  };
}

function main() {
  const stdin = readHookStdin();
  if (!stdin.ok) {
    // Fail CLOSED. On a pipe, fd 0 is non-blocking and a read issued before the
    // writer has filled it throws EAGAIN; treating that as "no input" and
    // exiting 0 let a config edit through unverified while the check still
    // reported success (#993, same seam as block-no-verify). A guard that
    // cannot read the edit it is guarding must not vouch for it.
    process.stderr.write(
      `BLOCKED: protect-config could not read hook input (${stdin.error.code ?? stdin.error.message}); ` +
        'refusing to allow a potentially unprotected config edit unverified.\n'
    );
    process.exit(2);
  }

  const raw = stdin.data;

  if (!raw.trim()) {
    process.stderr.write('[protect-config] Empty stdin — allowing (fail-open)\n');
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stderr.write('[protect-config] Could not parse stdin JSON — allowing (fail-open)\n');
    process.exit(0);
  }

  try {
    const filePath = input?.tool_input?.file_path;

    if (typeof filePath !== 'string' || !filePath) {
      process.stderr.write(
        'BLOCKED: protect-config could not verify the edit target (missing or unresolvable file_path) — refusing to allow a potentially unprotected config edit.\n'
      );
      process.exit(2);
    }

    if (!isProtected(filePath)) process.exit(0);

    if (isLedgerFile(filePath)) {
      process.stderr.write(
        `BLOCKED: Modification to the protected config override ledger: ${basename(filePath)}. ` +
          'Only a human (or a reviewed PR) may add or change override entries.\n'
      );
      process.exit(2);
    }

    const cwd = typeof input?.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
    const absPath = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath);
    const override = findOverride(absPath);

    if (override.allowed) {
      const { entry, relPath } = override;
      process.stderr.write(
        `[protect-config] Override allowed for ${relPath} by ${LEDGER_RELATIVE_PATH}: ` +
          `decision ${entry.decision}, approved by ${entry.approvedBy}, expires ${entry.expires} — ${entry.reason}\n`
      );
      process.exit(0);
    }

    process.stderr.write(
      `BLOCKED: Modification to protected config file: ${basename(filePath)}. Linter/formatter configs must not be weakened. ` +
        `To allow a reviewed change, a human adds an entry for this file to ${LEDGER_RELATIVE_PATH} ` +
        '(file, reason, decision, approvedBy, expires YYYY-MM-DD). ' +
        `Not allowed now: ${override.reason}.\n`
    );
    process.exit(2);
  } catch {
    process.stderr.write(
      'BLOCKED: protect-config hit an unexpected error verifying the edit target — blocking (fail-closed).\n'
    );
    process.exit(2);
  }
}

main();
