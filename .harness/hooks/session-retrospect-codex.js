#!/usr/bin/env node
// session-retrospect-codex.js — Codex CLI notify hook (opt-in).
//
// Thin entry point for Codex CLI. Codex has no session-end lifecycle hook; its
// `[hooks]`/hooks.json engine only exposes tool-use events. The only end-of-turn
// seam is the `notify` key in `.codex/config.toml`, which fires on
// `agent-turn-complete` and passes its event as a SINGLE JSON ARGV ARGUMENT (not
// stdin) (per https://learn.chatgpt.com/docs/config-file/config-advanced and
// https://github.com/openai/codex, verified 2026-08). The payload fields are
// `type`, `thread-id` (the session/conversation identifier), `turn-id`, `cwd`,
// `input-messages`, and `last-assistant-message`.
//
// The generated notify line no longer references this file by absolute path.
// notify is now fired via the PATH-resolvable `harness hooks run
// session-retrospect-codex` command (machine-independent, committable). This
// file remains shipped as a copied support script for backward compatibility
// with configs that still reference it; both paths share the same payload
// parser (`parseCodexNotifyPayload`) and archive core so they cannot drift.
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
import {
  parseCodexNotifyPayload,
  retrospectLogLine,
  retrospectSession,
} from './session-retrospect-core.js';

async function main() {
  // Codex delivers the notification as a single JSON string in argv, not stdin.
  const parsed = parseCodexNotifyPayload(process.argv[2]);
  if (!parsed) {
    process.exit(0);
  }

  try {
    const result = await retrospectSession(parsed);
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
