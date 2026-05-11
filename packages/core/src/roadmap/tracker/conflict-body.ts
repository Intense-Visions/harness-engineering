/**
 * Shared TRACKER_CONFLICT HTTP 409 body shape.
 *
 * Three endpoints emit this body when a `ConflictError` propagates from
 * `RoadmapTrackerClient` writes (REV-P7-S5):
 *
 *   - S3 dashboard claim:         POST /api/actions/roadmap/claim
 *   - S5 dashboard roadmap-status: POST /api/actions/roadmap-status
 *   - S6 orchestrator append:      POST /api/roadmap/append
 *
 * Lifting the constructor here keeps the wire shape pinned in one place;
 * the dashboard's `TrackerConflictBody` type and `isTrackerConflictBody`
 * guard (in `packages/dashboard/src/shared/types.ts`) form the matching
 * client-side contract. Drift between server emitters and the guard is
 * what this helper exists to prevent.
 */
import type { ConflictError } from './client';

/**
 * Public shape of the body emitted by `makeTrackerConflictBody`. Mirrors
 * the dashboard's `TrackerConflictBody` type — the two MUST stay in
 * lock-step. `conflictedWith` is `unknown` at the type level because the
 * underlying `ConflictError.diff` is intentionally schemaless (the diff
 * shape varies by adapter and by which field conflicted).
 */
export interface TrackerConflictBody {
  error: string;
  code: 'TRACKER_CONFLICT';
  externalId: string;
  /** Server-side diff payload from ConflictError (shape varies). */
  conflictedWith?: unknown;
  refreshHint: 'reload-roadmap';
}

export interface MakeTrackerConflictBodyOptions {
  /**
   * Override the value placed at `conflictedWith`. When omitted, the
   * helper uses `err.diff` (the canonical server-side payload). Callers
   * that want to surface a user-facing identity ("claimed by Bob") can
   * pass a string here.
   */
  conflictedWith?: unknown;
}

/**
 * Build the HTTP 409 TRACKER_CONFLICT response body from a ConflictError.
 *
 * @param err  - The `ConflictError` thrown by a `RoadmapTrackerClient` write.
 * @param opts - Optional overrides. By default `conflictedWith` is `err.diff`.
 * @returns The wire body, ready to be JSON-stringified.
 */
export function makeTrackerConflictBody(
  err: ConflictError,
  opts: MakeTrackerConflictBodyOptions = {}
): TrackerConflictBody {
  return {
    error: err.message,
    code: 'TRACKER_CONFLICT',
    externalId: err.externalId,
    conflictedWith: opts.conflictedWith ?? err.diff,
    refreshHint: 'reload-roadmap',
  };
}
