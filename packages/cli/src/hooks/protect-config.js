#!/usr/bin/env node
// protect-config.js — PreToolUse:Write/Edit hook
// Blocks modifications to linter/formatter config files.
// Security hook: blocks on parse errors (exit 2) rather than failing open.
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

function block(reason) {
  process.stderr.write(`BLOCKED: ${reason}\n`);
  process.exit(2);
}

function main() {
  let raw;
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    block('Could not read stdin — blocking for safety (security hook).');
    return;
  }

  if (!raw.trim()) {
    block('Empty stdin — blocking for safety (security hook).');
    return;
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    block('Could not parse stdin JSON — blocking for safety (security hook).');
    return;
  }

  try {
    const filePath = input?.tool_input?.file_path;

    if (typeof filePath !== 'string' || !filePath) {
      block('Missing file_path in tool input — blocking for safety (security hook).');
      return;
    }

    if (isProtected(filePath)) {
      block(
        `Modification to protected config file: ${basename(filePath)}. Linter/formatter configs must not be weakened.`
      );
      return;
    }

    process.exit(0);
  } catch {
    block('Unexpected error — blocking for safety (security hook).');
  }
}

main();
