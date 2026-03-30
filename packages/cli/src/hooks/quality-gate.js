#!/usr/bin/env node
// quality-gate.js — PostToolUse:Edit/Write hook
// Runs project formatter/linter after edits and warns on violations.
// Never blocks (always exits 0). Warnings go to stderr.
// Exit codes: 0 = allow (always)

import { readFileSync, accessSync } from 'node:fs';
import { join } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';

// Detection order: first match wins
const DETECTORS = [
  {
    configs: ['biome.json', 'biome.jsonc'],
    command: 'npx biome check',
    name: 'Biome',
  },
  {
    configs: [
      '.prettierrc',
      '.prettierrc.json',
      '.prettierrc.yml',
      '.prettierrc.yaml',
      '.prettierrc.js',
      '.prettierrc.cjs',
      '.prettierrc.mjs',
      'prettier.config.js',
      'prettier.config.cjs',
      'prettier.config.mjs',
    ],
    command: 'npx prettier --check',
    name: 'Prettier',
  },
  {
    configs: ['.ruff.toml', 'ruff.toml'],
    command: 'ruff check',
    name: 'Ruff',
  },
];

function detectFormatter(cwd) {
  for (const detector of DETECTORS) {
    for (const config of detector.configs) {
      try {
        accessSync(join(cwd, config));
        return detector;
      } catch {
        // Config not found, try next
      }
    }
  }
  return null;
}

function main() {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    process.exit(0);
  }

  if (!raw.trim()) {
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  try {
    const filePath = input?.tool_input?.file_path ?? '';
    const cwd = process.cwd();

    // Special case: .go files use gofmt
    if (typeof filePath === 'string' && filePath.endsWith('.go')) {
      try {
        const result = execFileSync('gofmt', ['-l', filePath], {
          encoding: 'utf-8',
          cwd,
          timeout: 10000,
        });
        if (result.trim()) {
          process.stderr.write(
            `[quality-gate] gofmt found formatting issues in: ${result.trim()}\n`
          );
        }
      } catch {
        // gofmt not available or failed — warn and continue
        process.stderr.write('[quality-gate] gofmt check failed (tool may not be installed)\n');
      }
      process.exit(0);
    }

    const detector = detectFormatter(cwd);
    if (!detector) {
      // No formatter detected — nothing to check
      process.exit(0);
    }

    try {
      execSync(detector.command, {
        encoding: 'utf-8',
        cwd,
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      process.stderr.write(`[quality-gate] ${detector.name} check passed\n`);
    } catch (err) {
      // Formatter found violations or failed to run — warn only
      const output = err.stdout || err.stderr || '';
      process.stderr.write(
        `[quality-gate] ${detector.name} check reported issues:\n${output.slice(0, 500)}\n`
      );
    }

    process.exit(0);
  } catch {
    // Unexpected error — fail open
    process.exit(0);
  }
}

main();
