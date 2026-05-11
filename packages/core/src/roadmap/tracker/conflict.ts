import type { TrackedFeature, FeaturePatch } from './client';
import { ConflictError } from './client';

export interface CompareResult {
  ok: boolean;
  idempotent?: boolean;
  diff?: Record<string, { ours: unknown; theirs: unknown }>;
}

/** Per-field comparison verdict. */
interface FieldVerdict {
  diff?: { ours: unknown; theirs: unknown };
  idempotent: boolean;
}

/** Status comparator: terminal-sticky, idempotent on equal. */
function compareStatus(server: TrackedFeature, patch: FeaturePatch): FieldVerdict {
  if (patch.status === undefined) return { idempotent: true };
  if (server.status === 'done' && patch.status !== 'done') {
    return { diff: { ours: patch.status, theirs: server.status }, idempotent: false };
  }
  return { idempotent: server.status === patch.status };
}

/** Assignee comparator: any non-null mismatch is a conflict. */
function compareAssignee(server: TrackedFeature, patch: FeaturePatch): FieldVerdict {
  if (patch.assignee === undefined) return { idempotent: true };
  if (server.assignee !== null && server.assignee !== patch.assignee) {
    return { diff: { ours: patch.assignee, theirs: server.assignee }, idempotent: false };
  }
  return { idempotent: server.assignee === patch.assignee };
}

/** Generic scalar comparator: diff if server has a different non-null value. */
function compareScalar(
  field: 'priority' | 'milestone' | 'spec',
  server: TrackedFeature,
  patch: FeaturePatch
): FieldVerdict {
  const next = patch[field];
  if (next === undefined) return { idempotent: true };
  const cur = server[field];
  if (cur !== null && cur !== next) {
    return { diff: { ours: next, theirs: cur }, idempotent: false };
  }
  return { idempotent: cur === next };
}

/** Array comparator: diff only when server has elements not in patch. */
function compareArray(
  field: 'plans' | 'blockedBy',
  server: TrackedFeature,
  patch: FeaturePatch
): FieldVerdict {
  const next = patch[field];
  if (next === undefined) return { idempotent: true };
  const cur = server[field];
  if (arraysEqual(next, cur)) return { idempotent: true };
  if (cur.length > 0 && cur.some((v) => !next.includes(v))) {
    return { diff: { ours: next, theirs: cur }, idempotent: false };
  }
  return { idempotent: false };
}

/**
 * Compare a planned patch against the server's freshly-fetched state.
 * Returns ok:true when the patch is safe (or idempotent); ok:false with diff
 * when applying the patch would clobber an external change.
 *
 * Rules per spec §"Conflict-resolution policy" + decision D-P2-B:
 * - terminal state 'done' is sticky: any patch that would un-set it conflicts
 * - assignee mismatch is a conflict unless our patch is exactly the server's value (idempotent)
 * - status mismatch is a conflict unless our patch matches (idempotent)
 * - other field mismatches are flagged as a diff
 */
export function refetchAndCompare(server: TrackedFeature, patch: FeaturePatch): CompareResult {
  const verdicts: Array<readonly [string, FieldVerdict]> = [
    ['status', compareStatus(server, patch)],
    ['assignee', compareAssignee(server, patch)],
    ['priority', compareScalar('priority', server, patch)],
    ['milestone', compareScalar('milestone', server, patch)],
    ['spec', compareScalar('spec', server, patch)],
    ['plans', compareArray('plans', server, patch)],
    ['blockedBy', compareArray('blockedBy', server, patch)],
  ];

  const diff: Record<string, { ours: unknown; theirs: unknown }> = {};
  let idempotent = true;
  for (const [field, verdict] of verdicts) {
    if (verdict.diff) diff[field] = verdict.diff;
    if (!verdict.idempotent) idempotent = false;
  }

  if (Object.keys(diff).length > 0) return { ok: false, diff };
  return { ok: true, idempotent };
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export interface BackoffOpts {
  maxAttempts: number;
  baseDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

export async function withBackoff<T>(fn: () => Promise<T>, opts: BackoffOpts): Promise<T> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let lastErr: unknown;
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ConflictError) throw err; // do not retry conflicts
      lastErr = err;
      if (attempt === opts.maxAttempts - 1) break;
      await sleep(opts.baseDelayMs * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}

export { ConflictError } from './client';
