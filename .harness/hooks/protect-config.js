#!/usr/bin/env node
// protect-config.js — PreToolUse:Write/Edit hook
// Blocks modifications to linter/formatter config files.
// Fail policy is split by failure mode:
//   - Absent/partial stdin (unreadable / empty / unparseable JSON): fail-OPEN (exit 0),
//     logged to stderr. These are the environmental/partial-stdin glitches issue #619
//     documents; blocking them would self-DoS legitimate writes.
//   - Well-formed request whose edit target is unresolvable (missing/non-string file_path,
//     or an unexpected processing error): fail-CLOSED (exit 2) — refuse rather than allow a
//     potentially unprotected config edit.
// Exit codes: 0 = allow, 2 = block

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import process from 'node:process';

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
];

function isProtected(filePath) {
  const base = basename(filePath);
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(base));
}

function main() {
  let raw;
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    process.stderr.write('[protect-config] Could not read stdin — allowing (fail-open)\n');
    process.exit(0);
  }

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

    if (isProtected(filePath)) {
      process.stderr.write(
        `BLOCKED: Modification to protected config file: ${basename(filePath)}. Linter/formatter configs must not be weakened.\n`
      );
      process.exit(2);
    }

    process.exit(0);
  } catch {
    process.stderr.write(
      'BLOCKED: protect-config hit an unexpected error verifying the edit target — blocking (fail-closed).\n'
    );
    process.exit(2);
  }
}

main();
