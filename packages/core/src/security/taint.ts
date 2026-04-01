/**
 * Sentinel Taint State Management
 *
 * Session-scoped taint file read/write/check/clear/expire logic.
 * Taint files live at `.harness/session-taint-{sessionId}.json`.
 *
 * The taint file is the single source of truth for enforcement.
 * Hooks and MCP middleware read this file on every invocation.
 */

import { readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { InjectionFinding } from './injection-patterns';

/** Default taint duration in milliseconds (30 minutes). */
const TAINT_DURATION_MS = 30 * 60 * 1000;

/** Default session ID when none is provided. */
const DEFAULT_SESSION_ID = 'default';

export interface TaintFinding {
  ruleId: string;
  severity: string;
  match: string;
  source: string;
  detectedAt: string;
}

export interface TaintState {
  sessionId: string;
  taintedAt: string;
  expiresAt: string;
  reason: string;
  severity: 'high' | 'medium';
  findings: TaintFinding[];
}

export interface TaintCheckResult {
  tainted: boolean;
  expired: boolean;
  state: TaintState | null;
}

/**
 * Get the taint file path for a given session.
 */
export function getTaintFilePath(projectRoot: string, sessionId?: string): string {
  const id = sessionId || DEFAULT_SESSION_ID;
  return join(projectRoot, '.harness', `session-taint-${id}.json`);
}

/**
 * Read the taint state for a session.
 * Returns null if no taint file exists or if the file is malformed (fail-open).
 * If malformed, the file is deleted.
 */
export function readTaint(projectRoot: string, sessionId?: string): TaintState | null {
  const filePath = getTaintFilePath(projectRoot, sessionId);
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    // File doesn't exist or can't be read — no taint
    return null;
  }

  let state: TaintState;
  try {
    state = JSON.parse(content) as TaintState;
  } catch {
    // Malformed JSON — delete and fail-open
    try {
      unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    return null;
  }

  // Basic shape validation
  if (!state.sessionId || !state.taintedAt || !state.expiresAt || !state.findings) {
    try {
      unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    return null;
  }

  return state;
}

/**
 * Check taint status for a session.
 * Handles expiry: if taint has expired, deletes the file and returns expired=true.
 */
export function checkTaint(projectRoot: string, sessionId?: string): TaintCheckResult {
  const state = readTaint(projectRoot, sessionId);

  if (!state) {
    return { tainted: false, expired: false, state: null };
  }

  const now = new Date();
  const expiresAt = new Date(state.expiresAt);

  if (now >= expiresAt) {
    // Expired — delete taint file
    const filePath = getTaintFilePath(projectRoot, sessionId);
    try {
      unlinkSync(filePath);
    } catch {
      // ignore delete errors
    }
    return { tainted: false, expired: true, state };
  }

  return { tainted: true, expired: false, state };
}

/**
 * Write taint state for a session.
 * Creates .harness/ directory if it doesn't exist.
 * If taint already exists for this session, appends new findings and keeps the earlier taintedAt.
 */
export function writeTaint(
  projectRoot: string,
  sessionId: string | undefined,
  reason: string,
  findings: InjectionFinding[],
  source: string
): TaintState {
  const id = sessionId || DEFAULT_SESSION_ID;
  const filePath = getTaintFilePath(projectRoot, id);
  const now = new Date().toISOString();

  // Ensure .harness/ directory exists
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  // Read existing taint to merge findings
  const existing = readTaint(projectRoot, id);

  // Determine highest severity from new findings
  const maxSeverity = findings.some((f) => f.severity === 'high') ? 'high' : 'medium';

  const taintFindings: TaintFinding[] = findings.map((f) => ({
    ruleId: f.ruleId,
    severity: f.severity,
    match: f.match,
    source,
    detectedAt: now,
  }));

  const state: TaintState = {
    sessionId: id,
    taintedAt: existing?.taintedAt || now,
    expiresAt: new Date(Date.now() + TAINT_DURATION_MS).toISOString(),
    reason,
    severity: existing?.severity === 'high' || maxSeverity === 'high' ? 'high' : 'medium',
    findings: [...(existing?.findings || []), ...taintFindings],
  };

  writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n');
  return state;
}

/**
 * Clear taint for a specific session or all sessions.
 * Returns the number of taint files removed.
 */
export function clearTaint(projectRoot: string, sessionId?: string): number {
  if (sessionId) {
    // Clear specific session
    const filePath = getTaintFilePath(projectRoot, sessionId);
    try {
      unlinkSync(filePath);
      return 1;
    } catch {
      return 0;
    }
  }

  // Clear all taint files
  const harnessDir = join(projectRoot, '.harness');
  let count = 0;
  try {
    const files = readdirSync(harnessDir);
    for (const file of files) {
      if (file.startsWith('session-taint-') && file.endsWith('.json')) {
        try {
          unlinkSync(join(harnessDir, file));
          count++;
        } catch {
          // ignore individual delete errors
        }
      }
    }
  } catch {
    // .harness/ doesn't exist — nothing to clear
  }
  return count;
}

/**
 * List all active taint sessions.
 * Returns session IDs with active (non-expired) taint.
 */
export function listTaintedSessions(projectRoot: string): string[] {
  const harnessDir = join(projectRoot, '.harness');
  const sessions: string[] = [];
  try {
    const files = readdirSync(harnessDir);
    for (const file of files) {
      if (file.startsWith('session-taint-') && file.endsWith('.json')) {
        const sessionId = file.replace('session-taint-', '').replace('.json', '');
        const result = checkTaint(projectRoot, sessionId);
        if (result.tainted) {
          sessions.push(sessionId);
        }
        // If expired, checkTaint already deleted the file
      }
    }
  } catch {
    // .harness/ doesn't exist
  }
  return sessions;
}
