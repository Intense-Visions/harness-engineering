#!/usr/bin/env node
// cost-tracker.js — Stop:* hook
// Appends token usage to .harness/metrics/costs.jsonl.
// Exit codes: 0 = allow (always, log-only hook)

import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

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
    };

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
