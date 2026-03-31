#!/usr/bin/env node
// pre-compact-state.js — PreCompact:* hook
// Saves a compact session summary before context compaction.
// Reads from .harness/state.json and .harness/sessions/ to gather context.
// Writes to .harness/state/pre-compact-summary.json (overwrites on each run).
// Fail-open: parse errors and unexpected exceptions log to stderr and exit 0.
// Exit codes: 0 = allow (always, log-only hook)

import { readFileSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

function readJsonSafe(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function findActiveSession(sessionsDir) {
  try {
    const entries = readdirSync(sessionsDir, { withFileTypes: true });
    // Look for the most recently modified session with an autopilot-state.json
    let latest = null;
    let latestMtime = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const statePath = join(sessionsDir, entry.name, 'autopilot-state.json');
      try {
        const stat = statSync(statePath);
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latest = { dir: entry.name, state: readJsonSafe(statePath) };
        }
      } catch {
        // No autopilot-state.json in this session
      }
    }
    return latest;
  } catch {
    return null;
  }
}

function main() {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    process.stderr.write('[pre-compact-state] Could not read stdin — allowing (fail-open)\n');
    process.exit(0);
  }

  if (!raw.trim()) {
    process.stderr.write('[pre-compact-state] Empty stdin — allowing (fail-open)\n');
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stderr.write('[pre-compact-state] Could not parse stdin — allowing (fail-open)\n');
    process.exit(0);
  }

  try {
    const cwd = process.cwd();
    const harnessDir = join(cwd, '.harness');
    const stateDir = join(harnessDir, 'state');

    // Read harness state
    const state = readJsonSafe(join(harnessDir, 'state.json'));

    // Find active session
    const session = findActiveSession(join(harnessDir, 'sessions'));

    // Extract recent decisions (last 5)
    const decisions = state?.decisions ?? [];
    const recentDecisions = decisions.slice(-5).map((d) =>
      typeof d === 'string' ? d : (d?.decision ?? d?.summary ?? JSON.stringify(d))
    );

    // Extract open questions / blockers
    const openQuestions = state?.blockers ?? [];

    // Determine current phase from session state
    const currentPhase = session?.state?.currentState
      ?? (state?.position?.phase ?? null);

    // Build summary
    const summary = {
      timestamp: new Date().toISOString(),
      sessionId: session?.dir ?? null,
      activeStream: session?.state?.currentState ?? null,
      recentDecisions,
      openQuestions,
      currentPhase,
    };

    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'pre-compact-summary.json'),
      JSON.stringify(summary, null, 2) + '\n'
    );

    process.stderr.write('[pre-compact-state] Saved pre-compact summary\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[pre-compact-state] Failed to save summary: ${String(err?.message ?? err)}\n`);
    process.exit(0);
  }
}

main();
