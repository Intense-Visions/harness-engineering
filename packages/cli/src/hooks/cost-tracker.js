#!/usr/bin/env node
// cost-tracker.js — Stop:* hook
// Appends token usage to .harness/metrics/costs.jsonl.
// Exit codes: 0 = allow (always, log-only hook)

import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

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
    process.stderr.write('[cost-tracker] Could not parse stdin — skipping\n');
    process.exit(0);
  }

  try {
    const cwd = process.cwd();
    const metricsDir = join(cwd, '.harness', 'metrics');

    mkdirSync(metricsDir, { recursive: true });

    const entry = {
      timestamp: new Date().toISOString(),
      session_id: input.session_id ?? null,
      token_usage: input.token_usage ?? null,
      model: input.model ?? null,
    };

    // Pass through cache token fields in snake_case (matching token_usage/session_id convention)
    if (input.cache_creation_tokens != null) {
      entry.cache_creation_tokens = input.cache_creation_tokens;
    } else if (input.cacheCreationTokens != null) {
      entry.cache_creation_tokens = input.cacheCreationTokens;
    }
    if (input.cache_read_tokens != null) {
      entry.cache_read_tokens = input.cache_read_tokens;
    } else if (input.cacheReadTokens != null) {
      entry.cache_read_tokens = input.cacheReadTokens;
    }

    const costsFile = join(metricsDir, 'costs.jsonl');
    appendFileSync(costsFile, JSON.stringify(entry) + '\n');

    process.stderr.write(`[cost-tracker] Logged cost entry for session ${entry.session_id}\n`);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[cost-tracker] Failed to log costs: ${err.message}\n`);
    process.exit(0);
  }
}

main();
