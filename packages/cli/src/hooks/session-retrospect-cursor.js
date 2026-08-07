#!/usr/bin/env node
// session-retrospect-cursor.js — Cursor stop / sessionEnd hook (opt-in).
//
// Thin entry point for Cursor. Registered under BOTH the `stop` and `sessionEnd`
// events in `.cursor/hooks.json` (see agent-retrospect.ts). Cursor delivers its
// hook event as JSON on stdin. Per https://cursor.com/docs/agent/hooks (verified
// 2026-08):
//   - the `stop` payload carries `conversation_id` (and generation_id, status…);
//   - the `sessionEnd` payload carries both `session_id` and `conversation_id`.
// So this prefers `session_id` and falls back to `conversation_id`, giving one
// stable dedupe key whichever event fired. The shared core dedupes once per
// session id, so wiring both events archives the session AT MOST ONCE.
//
// KNOWN LIMITATION — Cursor CLI: `sessionEnd` is documented as IDE-only ("tied
// to the IDE session, not a cloud agent chat"), and the local `cursor-agent` CLI
// has historically emitted only beforeShellExecution / afterShellExecution. The
// `stop` event is documented for cloud/agent chats. This hook is wired for both
// events so it works today in the Cursor IDE agent (and in cloud agents that
// emit `stop`), and starts working in the local CLI the moment it emits these
// events — but full local-CLI coverage cannot be guaranteed yet. See the hooks
// guide for the current coverage matrix.
//
// Cursor's `stop` payload has no `cwd` field but does carry `workspace_roots`;
// the archive targets the first workspace root when present, else the process
// cwd.
//
// Fail-soft: any error is swallowed and the hook exits 0. It never blocks or
// delays session exit.
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
    // sessionEnd carries session_id; stop carries only conversation_id.
    const sessionId =
      typeof input.session_id === 'string' && input.session_id
        ? input.session_id
        : typeof input.conversation_id === 'string' && input.conversation_id
          ? input.conversation_id
          : 'unknown';
    const workspaceRoot =
      Array.isArray(input.workspace_roots) && typeof input.workspace_roots[0] === 'string'
        ? input.workspace_roots[0]
        : null;
    const cwd = workspaceRoot ?? process.cwd();
    const result = await retrospectSession({ cwd, sessionId });
    const line = retrospectLogLine('session-retrospect-cursor', result);
    if (line) process.stderr.write(line);
    process.exit(0);
  } catch (err) {
    process.stderr.write(
      `[session-retrospect-cursor] Failed: ${err && err.message ? err.message : String(err)}\n`
    );
    process.exit(0);
  }
}

main();
