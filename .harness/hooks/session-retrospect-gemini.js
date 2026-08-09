#!/usr/bin/env node
// session-retrospect-gemini.js — Gemini CLI SessionEnd hook (opt-in).
//
// Thin entry point for Gemini CLI. Registered under the `SessionEnd` event in
// `.gemini/settings.json` (see agent-retrospect.ts). Gemini delivers its hook
// event as JSON on stdin; the SessionEnd payload's base fields include
// `session_id` and `cwd` (per https://geminicli.com/docs/hooks/reference/,
// verified 2026-08). It extracts the session id and delegates to the shared
// agent-agnostic core, which gates on HARNESS_SESSION_RETROSPECTION, dedupes
// once per session, and archives the active session through the same archive
// seam every other agent uses.
//
// Gemini "does not wait for SessionEnd and ignores flow-control fields", which
// is fine: this is a best-effort, log-only, fail-soft hook that never blocks or
// delays session exit. Any error is swallowed and the hook exits 0.
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
    // Gemini's SessionEnd payload carries `cwd`; prefer it so the archive
    // targets the project the session ran in, falling back to the process cwd.
    const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
    const sessionId = typeof input.session_id === 'string' ? input.session_id : 'unknown';
    const result = await retrospectSession({ cwd, sessionId });
    const line = retrospectLogLine('session-retrospect-gemini', result);
    if (line) process.stderr.write(line);
    process.exit(0);
  } catch (err) {
    process.stderr.write(
      `[session-retrospect-gemini] Failed: ${err && err.message ? err.message : String(err)}\n`
    );
    process.exit(0);
  }
}

main();
