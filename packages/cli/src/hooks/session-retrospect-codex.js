#!/usr/bin/env node
// session-retrospect-codex.js — Codex CLI notify hook (opt-in).
//
// Thin entry point for Codex CLI. Codex has no session-end lifecycle hook; its
// `[hooks]`/hooks.json engine only exposes tool-use events. The only end-of-turn
// seam is the `notify` key in `.codex/config.toml`, which fires on
// `agent-turn-complete` and passes its event as a SINGLE JSON ARGV ARGUMENT (not
// stdin) — `notify = ["node", "<abs path to this script>"]` (per
// https://learn.chatgpt.com/docs/config-file/config-advanced and
// https://github.com/openai/codex, verified 2026-08). The payload fields are
// `type`, `thread-id` (the session/conversation identifier), `turn-id`, `cwd`,
// `input-messages`, and `last-assistant-message`.
//
// notify fires once per AGENT TURN, not once per session, so this would fire
// many times in an interactive session. The shared core dedupes per session id
// (`thread-id`) via the same sentinel every other agent uses, so per-turn firing
// archives the session AT MOST ONCE. `thread-id` is stable across the turns of
// one Codex conversation, which is exactly the dedupe key we want.
//
// Because notify runs as a detached subprocess whose cwd is not guaranteed to be
// the project, the archive targets the payload's `cwd` field (falling back to
// the process cwd).
//
// Fail-soft: any error is swallowed and the hook exits 0. Codex does not act on
// notify exit codes, so this never blocks or delays anything.
//
// Exit codes: 0 = allow (always, log-only hook)

import process from 'node:process';
import { retrospectLogLine, retrospectSession } from './session-retrospect-core.js';

async function main() {
  // Codex delivers the notification as a single JSON string in argv, not stdin.
  const raw = process.argv[2];
  if (typeof raw !== 'string' || !raw.trim()) {
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  try {
    // `thread-id` (hyphenated) is Codex's stable per-conversation session id.
    const sessionId = typeof input['thread-id'] === 'string' ? input['thread-id'] : 'unknown';
    const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
    const result = await retrospectSession({ cwd, sessionId });
    const line = retrospectLogLine('session-retrospect-codex', result);
    if (line) process.stderr.write(line);
    process.exit(0);
  } catch (err) {
    process.stderr.write(
      `[session-retrospect-codex] Failed: ${err && err.message ? err.message : String(err)}\n`
    );
    process.exit(0);
  }
}

main();
