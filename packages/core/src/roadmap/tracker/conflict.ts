import type { TrackedFeature, FeaturePatch } from './client';
import { ConflictError } from './client';

export interface CompareResult {
  ok: boolean;
  idempotent?: boolean;
  diff?: Record<string, { ours: unknown; theirs: unknown }>;
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
  const diff: Record<string, { ours: unknown; theirs: unknown }> = {};
  let idempotent = true;

  // Status: terminal-sticky, idempotent if same
  if (patch.status !== undefined) {
    if (server.status === 'done' && patch.status !== 'done') {
      diff.status = { ours: patch.status, theirs: server.status };
    } else if (server.status !== patch.status) {
      idempotent = false;
    }
  }

  // Assignee: idempotent only when equal
  if (patch.assignee !== undefined) {
    if (server.assignee !== null && server.assignee !== patch.assignee) {
      diff.assignee = { ours: patch.assignee, theirs: server.assignee };
    } else if (server.assignee !== patch.assignee) {
      idempotent = false;
    }
  }

  // Other scalar fields: diff if server already has a different non-null value
  for (const key of ['priority', 'milestone', 'spec'] as const) {
    const next = patch[key];
    if (next === undefined) continue;
    const cur = server[key];
    if (cur !== null && cur !== next) {
      diff[key] = { ours: next, theirs: cur };
    } else if (cur !== next) {
      idempotent = false;
    }
  }

  // Arrays (plans, blockedBy): diff only on inequality of intent (no merge here)
  if (patch.plans !== undefined && !arraysEqual(patch.plans, server.plans)) {
    idempotent = false;
    if (server.plans.length > 0 && server.plans.some((p) => !patch.plans!.includes(p))) {
      diff.plans = { ours: patch.plans, theirs: server.plans };
    }
  }
  if (patch.blockedBy !== undefined && !arraysEqual(patch.blockedBy, server.blockedBy)) {
    idempotent = false;
    if (
      server.blockedBy.length > 0 &&
      server.blockedBy.some((b) => !patch.blockedBy!.includes(b))
    ) {
      diff.blockedBy = { ours: patch.blockedBy, theirs: server.blockedBy };
    }
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
