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
import { readHookStdin } from './read-hook-stdin.js';

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

/**
 * Read and validate stdin as JSON. On any failure, writes the matching
 * fail-open stderr message and exits 0. Returns the raw string on success.
 */
function readValidStdin() {
  // readHookStdin retries the EAGAIN that fd 0 throws under compound load (v8
  // coverage on the pre-push gate): the writer races ahead of the read, and a
  // raw readFileSync(0) would mistake that backpressure for empty stdin and
  // fail-open, silently skipping the summary write and flaking the suite (#620).
  const stdin = readHookStdin();
  if (!stdin.ok) {
    process.stderr.write('[pre-compact-state] Could not read stdin — allowing (fail-open)\n');
    process.exit(0);
  }
  const raw = stdin.data;

  if (!raw.trim()) {
    process.stderr.write('[pre-compact-state] Empty stdin — allowing (fail-open)\n');
    process.exit(0);
  }

  try {
    JSON.parse(raw); // validate stdin is JSON
  } catch {
    process.stderr.write('[pre-compact-state] Could not parse stdin — allowing (fail-open)\n');
    process.exit(0);
  }

  return raw;
}

/** Map a decision entry to its display string. */
function decisionToString(d) {
  return typeof d === 'string' ? d : (d?.decision ?? d?.summary ?? JSON.stringify(d));
}

/** The active session's current state string, or null when absent. */
function sessionCurrentState(session) {
  return session?.state?.currentState ?? null;
}

/** Last five decisions from harness state, each mapped to a display string. */
function recentDecisionsFrom(state) {
  const decisions = state?.decisions ?? [];
  return decisions.slice(-5).map(decisionToString);
}

/** Current phase: prefer the live session state, fall back to the persisted position. */
function currentPhaseFrom(state, session) {
  return sessionCurrentState(session) ?? state?.position?.phase ?? null;
}

/** Build the pre-compact summary object from harness state and active session. */
function buildSummary(state, session) {
  return {
    timestamp: new Date().toISOString(),
    sessionId: session?.dir ?? null,
    activeStream: sessionCurrentState(session),
    recentDecisions: recentDecisionsFrom(state),
    openQuestions: state?.blockers ?? [],
    currentPhase: currentPhaseFrom(state, session),
  };
}

function main() {
  readValidStdin();

  try {
    const cwd = process.cwd();
    const harnessDir = join(cwd, '.harness');
    const stateDir = join(harnessDir, 'state');

    const state = readJsonSafe(join(harnessDir, 'state.json'));
    const session = findActiveSession(join(harnessDir, 'sessions'));
    const summary = buildSummary(state, session);

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
