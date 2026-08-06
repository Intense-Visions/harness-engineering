#!/usr/bin/env node
// session-retrospect.js — Stop:* hook (opt-in)
//
// Why this exists: the session-archive lifecycle runs its `onArchived` step
// (session summary, index, and — when enabled — retrospection) only when a
// session is archived. The only caller that archives a session is the
// `archive_session` state action, which autonomous flows invoke at teardown.
// A manual, interactive session is never archived, so its end-of-session
// analysis never runs. This hook closes that gap: at session end it archives
// the active session through the same public archive seam, so `onArchived`
// fires for manually driven sessions too.
//
// Opt-in: the whole hook is a no-op unless HARNESS_SESSION_RETROSPECTION is
// enabled (default off), matching the same flag that gates the retrospection
// step inside the archive lifecycle. Users who have not opted in pay nothing
// beyond a single env-var check.
//
// Once per session: a Stop hook fires on every turn-stop, not only at genuine
// session end, and Claude Code's Stop payload carries no reliable "this is the
// last turn" signal. Archiving on every stop would tear down a live session, so
// this hook archives AT MOST ONCE per Claude session, keyed on `session_id` via
// a sentinel file. The first stop that finds an active session archives it and
// writes the sentinel; every later stop for the same session is a no-op. A stop
// that finds no session to archive writes no sentinel, so a session created
// later in the same run can still be caught.
//
// Fail-soft: any error — unreadable stdin, missing packages, a failed archive —
// is swallowed and the hook exits 0. It never blocks the session.
//
// Self-contained: this file imports no sibling hook modules so the installer
// ships it as a single script. The stdin reader below mirrors the shared
// read-hook-stdin helper's EAGAIN handling.
//
// Exit codes: 0 = allow (always, log-only hook)

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
 * mistaken for empty stdin.
 * @returns {{ ok: true, data: string } | { ok: false }}
 */
function readStdin() {
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
function isRetrospectionEnabled() {
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

/** Persist the once-per-session sentinel so later stops are no-ops. */
function writeSentinel(cwd, sessionId) {
  const file = sentinelPath(cwd, sessionId);
  mkdirSync(join(cwd, '.harness', 'state', 'retrospection'), { recursive: true });
  writeFileSync(file, new Date().toISOString() + '\n', { encoding: 'utf-8' });
}

async function main() {
  const stdin = readStdin();
  if (!stdin.ok || !stdin.data.trim()) {
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(stdin.data);
  } catch {
    process.exit(0);
  }

  // Opt-in gate: do nothing unless the user enabled retrospection.
  if (!isRetrospectionEnabled()) {
    process.exit(0);
  }

  try {
    const cwd = process.cwd();
    const sessionId = typeof input.session_id === 'string' ? input.session_id : 'unknown';

    // Once-per-session dedupe: a Stop hook fires every turn, so bail if this
    // session was already archived.
    if (existsSync(sentinelPath(cwd, sessionId))) {
      process.exit(0);
    }

    const slug = findActiveSessionSlug(cwd);
    if (!slug) {
      // Nothing to archive yet. Do not write the sentinel — a session created
      // later in this same run should still be caught by a subsequent stop.
      process.exit(0);
    }

    const archived = await archiveActiveSession(cwd, slug);
    if (archived) {
      // Only mark the session done once the archive actually succeeded, so a
      // transient failure can be retried on the next stop.
      writeSentinel(cwd, sessionId);
      process.stderr.write(`[session-retrospect] Archived session '${slug}' at session end\n`);
    } else {
      process.stderr.write(
        `[session-retrospect] Archive of '${slug}' did not succeed — will retry\n`
      );
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(
      `[session-retrospect] Failed: ${err && err.message ? err.message : String(err)}\n`
    );
    process.exit(0);
  }
}

main();
