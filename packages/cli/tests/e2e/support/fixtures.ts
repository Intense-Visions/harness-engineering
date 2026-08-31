// Shared E2E helper: load captured real-tool envelopes from the repo-root
// `fixtures/` convention (ADR 0111). Resolution is anchored to this file's own
// location, so it is independent of the per-package test cwd.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// packages/cli/tests/e2e/support -> repo root is five levels up.
const REPO_ROOT = path.resolve(HERE, '../../../../..');
const CLAUDE_CLI_DIR = path.join(REPO_ROOT, 'fixtures', 'claude-cli');

/** A captured `claude`-CLI stdout envelope (the fields the harness reads). */
export interface ClaudeEnvelope {
  type?: string;
  result?: string;
  structured_output?: unknown;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  [key: string]: unknown;
}

/**
 * Load `fixtures/claude-cli/<name>.json` as a parsed envelope. Seeded fixtures:
 * `structured-output` (happy path) and `chatty-narration` (the #1558 miss).
 */
export function loadClaudeEnvelope(name: string): ClaudeEnvelope {
  const file = path.join(CLAUDE_CLI_DIR, `${name}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as ClaudeEnvelope;
}
