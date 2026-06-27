// packages/orchestrator/src/core/lane-persistence.ts
//
// Phase 4 (DLane-5): durable persistence of orchestrator task-lane state via the
// core event log. This is the ONLY new orchestrator<->core lane coupling; it is
// kept self-contained so the reconciliation loop and the pure `applyEvent`
// reducer stay untouched.
//
// Orchestrator lifecycle signals map to ON-TABLE lanes only (no force/evidence):
//   claim    -> claimed
//   dispatch -> in_progress
//   success  -> in_review   (the orchestrator NEVER drives `done` -- that stays a
//                            human/skill action carrying PR/test evidence)
//   failure  -> blocked
//   abandon  -> canceled
import { eventSourcing } from '@harness-engineering/core';
import { type Result, Err } from '@harness-engineering/types';

export type OrchestratorLaneSignal = 'claim' | 'dispatch' | 'success' | 'failure' | 'abandon';

const SIGNAL_TO_LANE: Record<OrchestratorLaneSignal, eventSourcing.Lane> = {
  claim: 'claimed',
  dispatch: 'in_progress',
  success: 'in_review',
  failure: 'blocked',
  abandon: 'canceled',
};

/** Pure map: orchestrator lifecycle signal -> on-table lane. */
export function mapOrchestratorLane(signal: OrchestratorLaneSignal): eventSourcing.Lane {
  return SIGNAL_TO_LANE[signal];
}

/**
 * Idempotently register then transition the issue's lane in the durable core log.
 *
 * NEVER throws. On any failure -- a `registerTask`/`transitionLane` `Err`, or a
 * thrown error from the core log layer -- it returns an `Err` Result so the caller
 * can log a diagnostic and continue. A lane-persistence failure must never break
 * orchestrator dispatch.
 *
 * `registerTask` is safe to call repeatedly: `projectLanes` only seeds `lane:
 * 'planned'` on the FIRST registration, so re-registering an already-advanced
 * task preserves its current lane (only `dependsOn` is refreshed).
 */
export async function persistLane(
  projectPath: string,
  issueId: string,
  signal: OrchestratorLaneSignal
): Promise<Result<eventSourcing.EmitResult, Error>> {
  try {
    const reg = await eventSourcing.registerTask(projectPath, issueId, []);
    if (!reg.ok) return reg;
    return await eventSourcing.transitionLane(projectPath, issueId, mapOrchestratorLane(signal));
  } catch (err) {
    return Err(err instanceof Error ? err : new Error(String(err)));
  }
}
