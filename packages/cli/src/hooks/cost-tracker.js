#!/usr/bin/env node
// cost-tracker.js — Stop:* hook
// Appends token usage to .harness/metrics/costs.jsonl.
// Exit codes: 0 = allow (always, log-only hook)

import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { readHookStdin } from './read-hook-stdin.js';

function main() {
  // readHookStdin retries the EAGAIN that fd 0 throws under compound load (v8
  // coverage on the pre-push gate): the writer races ahead of the read, and a
  // raw readFileSync(0) would mistake that backpressure for empty stdin and
  // drop the cost entry (#620). Log-only hook, so a genuine read failure is
  // treated the same as empty stdin (fail-open, exit 0).
  const stdin = readHookStdin();
  const raw = stdin.ok ? stdin.data : '';

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

    // Pass through cache token fields (prefer camelCase input, fall back to snake_case)
    if (input.cacheCreationTokens != null) {
      entry.cacheCreationTokens = input.cacheCreationTokens;
    } else if (input.cache_creation_tokens != null) {
      entry.cacheCreationTokens = input.cache_creation_tokens;
    }
    if (input.cacheReadTokens != null) {
      entry.cacheReadTokens = input.cacheReadTokens;
    } else if (input.cache_read_tokens != null) {
      entry.cacheReadTokens = input.cache_read_tokens;
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
