#!/usr/bin/env node
// pre-compact-state.js — PreCompact:* hook
// Saves harness session state before context compaction.
// Exit codes: 0 = allow (always, log-only hook)

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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
    process.stderr.write('[pre-compact-state] Could not parse stdin — skipping snapshot\n');
    process.exit(0);
  }

  try {
    const cwd = process.cwd();
    const snapshotsDir = join(cwd, '.harness', 'compact-snapshots');

    mkdirSync(snapshotsDir, { recursive: true });

    const timestamp = new Date().toISOString();
    const filename = `snapshot-${timestamp.replace(/[:.]/g, '-')}.json`;
    const snapshot = {
      timestamp,
      hookInput: input,
    };

    writeFileSync(join(snapshotsDir, filename), JSON.stringify(snapshot, null, 2) + '\n');

    process.stderr.write(`[pre-compact-state] Saved snapshot: ${filename}\n`);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[pre-compact-state] Failed to save snapshot: ${err.message}\n`);
    process.exit(0);
  }
}

main();
