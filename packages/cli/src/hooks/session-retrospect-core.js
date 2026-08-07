// session-retrospect-core.js — shared, agent-agnostic core for the opt-in
// end-of-session retrospection trigger.
//
// Why this exists: the session-archive lifecycle runs its `onArchived` step
// (session summary, index, and — when enabled — retrospection) only when a
// session is archived. The only caller that archives a session is the
// `archive_session` state action, which autonomous flows invoke at teardown.
// A manual, interactive session is never archived, so its end-of-session
// analysis never runs. The per-agent session-end hooks close that gap: at
// session end each agent's hook archives the active session through the same
// public archive seam, so `onArchived` fires for manually driven sessions too.
//
// This module holds the agent-agnostic middle: the opt-in gate, the
// once-per-session dedupe, the active-session resolver, and the archive call.
// Each agent's entry point (session-retrospect.js for Claude Code,
// session-retrospect-gemini.js, -codex.js, -cursor.js) is a thin wrapper that
// parses its own session-end event, extracts a session id, and delegates to
// `retrospectSession` here. Extracting the core keeps every agent on the exact
// same archive engine (#1124's archiveSession / buildArchiveHooks) instead of a
// parallel retrospection path, and keeps the fail-soft, at-most-once-per-session
// guarantees in one place.
//
// Opt-in: the whole flow is a no-op unless HARNESS_SESSION_RETROSPECTION is
// enabled (default off), matching the same flag that gates the retrospection
// step inside the archive lifecycle. Callers who have not opted in pay nothing
// beyond a single env-var check — no archive package is even resolved.
//
// Once per session: a session-end hook can fire more than once per real session
// (Claude's Stop fires on every turn-stop; Codex's notify fires on every
// agent-turn-complete). Archiving on every fire would tear down a live session,
// so this archives AT MOST ONCE per session, keyed on the agent's session id via
// a sentinel file under `.harness/state/retrospection/<sessionId>.archived`. The
// first fire that finds an active session archives it and writes the sentinel;
// every later fire for the same session is a no-op. A fire that finds no session
// to archive writes no sentinel, so a session created later in the same run can
// still be caught.
//
// Fail-soft: any error — unreadable stdin, missing packages, a failed archive —
// is swallowed by the entry point and the hook exits 0. It never blocks or
// delays session exit.

import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, readdirSync, readSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const CHUNK_BYTES = 64 * 1024;
const EAGAIN_DEADLINE_MS = 5000;
const EAGAIN_BACKOFF_MS = 5;

/** Synchronously sleep without spinning the CPU. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Read all of stdin, retrying while the pipe reports EAGAIN. Mirrors the shared
 * read-hook-stdin helper so a writer that races ahead of the read is not
 * mistaken for empty stdin. Used by the agents that deliver their session-end
 * event on stdin (Claude Code, Gemini CLI, Cursor); Codex delivers its event as
 * an argv argument and does not use this.
 * @returns {{ ok: true, data: string } | { ok: false }}
 */
export function readHookStdin() {
  const chunks = [];
  const buf = Buffer.alloc(CHUNK_BYTES);
  const deadline = Date.now() + EAGAIN_DEADLINE_MS;

  for (;;) {
    let bytesRead;
    try {
      bytesRead = readSync(0, buf, 0, CHUNK_BYTES, null);
    } catch (err) {
      if (err.code === 'EAGAIN') {
        if (Date.now() >= deadline) return { ok: false };
        sleepSync(EAGAIN_BACKOFF_MS);
        continue;
      }
      if (err.code === 'EOF') break;
      return { ok: false };
    }
    if (bytesRead === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
  }

  return { ok: true, data: Buffer.concat(chunks).toString('utf-8') };
}

/** Whether end-of-session retrospection is opted in via env flag (default off). */
export function isRetrospectionEnabled() {
  const value = (process.env.HARNESS_SESSION_RETROSPECTION ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

/** Make a session id safe to use as a single path segment. */
function sanitizeSessionId(sessionId) {
  return String(sessionId).replace(/[^A-Za-z0-9._-]/g, '_') || 'unknown';
}

/** Absolute path of the once-per-session sentinel for this session id. */
function sentinelPath(cwd, sessionId) {
  return join(
    cwd,
    '.harness',
    'state',
    'retrospection',
    `${sanitizeSessionId(sessionId)}.archived`
  );
}

/**
 * Resolve the slug of the session to archive: the most-recently-modified
 * directory under `.harness/sessions/`. Returns null when there is none.
 */
function findActiveSessionSlug(cwd) {
  const sessionsDir = join(cwd, '.harness', 'sessions');
  let latestSlug = null;
  let latestMtime = -1;
  let entries;
  try {
    entries = readdirSync(sessionsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const stat = statSync(join(sessionsDir, entry.name));
      if (stat.mtimeMs > latestMtime) {
        latestMtime = stat.mtimeMs;
        latestSlug = entry.name;
      }
    } catch {
      // Unreadable entry — skip it.
    }
  }
  return latestSlug;
}

/**
 * Archive the given session through the public archive seam, wiring the same
 * `onArchived` hook bundle the archive_session action uses so the summary,
 * index, and (when enabled) retrospection steps run. Returns true on success.
 */
async function archiveActiveSession(cwd, slug) {
  const { archiveSession } = await import('@harness-engineering/core');
  const { buildArchiveHooks } = await import('@harness-engineering/orchestrator');
  const hooks = buildArchiveHooks({ projectPath: cwd });
  const result = await archiveSession(cwd, slug, { hooks });
  return Boolean(result && result.ok);
}

/** Persist the once-per-session sentinel so later fires are no-ops. */
function writeSentinel(cwd, sessionId) {
  const file = sentinelPath(cwd, sessionId);
  mkdirSync(join(cwd, '.harness', 'state', 'retrospection'), { recursive: true });
  writeFileSync(file, new Date().toISOString() + '\n', { encoding: 'utf-8' });
}

/**
 * Agent-agnostic end-of-session retrospection: gate on the opt-in flag, dedupe
 * once per session, resolve the active session, and archive it through the
 * shared archive seam. Never throws for the "nothing to do" cases; a genuine
 * archive failure is allowed to propagate so the caller can log it and still
 * exit 0. The opt-in gate is checked FIRST so a caller who has not opted in
 * never triggers the dynamic import of the archive packages.
 *
 * @param {{ cwd: string, sessionId: string }} params
 * @returns {Promise<{ status: 'disabled' | 'already-archived' | 'no-session' | 'archived' | 'archive-failed', slug?: string }>}
 */
export async function retrospectSession({ cwd, sessionId }) {
  if (!isRetrospectionEnabled()) {
    return { status: 'disabled' };
  }

  const id = typeof sessionId === 'string' && sessionId ? sessionId : 'unknown';

  // Once-per-session dedupe: a session-end hook can fire more than once, so bail
  // if this session was already archived.
  if (existsSync(sentinelPath(cwd, id))) {
    return { status: 'already-archived' };
  }

  const slug = findActiveSessionSlug(cwd);
  if (!slug) {
    // Nothing to archive yet. Do not write the sentinel — a session created
    // later in this same run should still be caught by a subsequent fire.
    return { status: 'no-session' };
  }

  const archived = await archiveActiveSession(cwd, slug);
  if (archived) {
    // Only mark the session done once the archive actually succeeded, so a
    // transient failure can be retried on the next fire.
    writeSentinel(cwd, id);
    return { status: 'archived', slug };
  }
  return { status: 'archive-failed', slug };
}

/**
 * Render the stderr line for a retrospection result, or null when the result
 * warrants no output (disabled, already-archived, no-session). `label` is the
 * per-agent hook name so log lines identify which agent's hook fired.
 * @param {string} label
 * @param {{ status: string, slug?: string }} result
 * @returns {string | null}
 */
export function retrospectLogLine(label, result) {
  if (result.status === 'archived') {
    return `[${label}] Archived session '${result.slug}' at session end\n`;
  }
  if (result.status === 'archive-failed') {
    return `[${label}] Archive of '${result.slug}' did not succeed — will retry\n`;
  }
  return null;
}
