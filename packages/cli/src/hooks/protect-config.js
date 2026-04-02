#!/usr/bin/env node
// protect-config.js — PreToolUse:Write/Edit hook
// Blocks modifications to linter/formatter config files.
// Fail-open: parse errors and unexpected exceptions log to stderr and exit 0.
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
      process.stderr.write('[protect-config] Missing file_path in tool input — allowing (fail-open)\n');
      process.exit(0);
    }

    if (isProtected(filePath)) {
      process.stderr.write(
        `BLOCKED: Modification to protected config file: ${basename(filePath)}. Linter/formatter configs must not be weakened.\n`
      );
      process.exit(2);
    }

    process.exit(0);
  } catch {
    process.stderr.write('[protect-config] Unexpected error — allowing (fail-open)\n');
    process.exit(0);
  }
}

main();
