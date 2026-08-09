#!/usr/bin/env node
// session-retrospect.js — Claude Code Stop:* hook (opt-in).
//
// Thin entry point: reads Claude Code's Stop hook JSON from stdin, extracts the
// `session_id`, and delegates to the shared, agent-agnostic core
// (session-retrospect-core.js) that gates on HARNESS_SESSION_RETROSPECTION,
// dedupes once per session, and archives the active session through the same
// public archive seam the archive_session action uses (so summary + index +
// retrospection run for manually driven sessions too).
//
// The core is shared with the Gemini CLI, Codex CLI, and Cursor entry points so
// every agent runs the exact same archive engine and the same at-most-once,
// fail-soft guarantees. See session-retrospect-core.js for the full rationale.
//
// Once per session: a Stop hook fires on every turn-stop, not only at genuine
// session end, and Claude Code's Stop payload carries no reliable "this is the
// last turn" signal. The core archives AT MOST ONCE per Claude session, keyed on
// `session_id` via a sentinel file.
//
// Fail-soft: any error is swallowed and the hook exits 0. It never blocks the
// session.
//
// Exit codes: 0 = allow (always, log-only hook)

import process from 'node:process';
import { readHookStdin, retrospectLogLine, retrospectSession } from './session-retrospect-core.js';

async function main() {
  const stdin = readHookStdin();
  if (!stdin.ok || !stdin.data.trim()) {
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(stdin.data);
  } catch {
    process.exit(0);
  }

  try {
    const cwd = process.cwd();
    const sessionId = typeof input.session_id === 'string' ? input.session_id : 'unknown';
    const result = await retrospectSession({ cwd, sessionId });
    const line = retrospectLogLine('session-retrospect', result);
    if (line) process.stderr.write(line);
    process.exit(0);
  } catch (err) {
    process.stderr.write(
      `[session-retrospect] Failed: ${err && err.message ? err.message : String(err)}\n`
    );
    process.exit(0);
  }
}

main();
