import type { RunningEntry } from '../types/internal';

/**
 * Pure stall-detection: returns the issue IDs whose running entry has been
 * silent for at least `stallTimeoutMs`.
 *
 * "Silent" is measured from `session.lastTimestamp` when an agent has emitted
 * at least one event, and falls back to `startedAt` when it has not. Without
 * the fallback, an agent that crashes or hangs before emitting any event sits
 * in `running` forever — over a long-running orchestrator process this fills
 * `maxConcurrentAgents` and silently blocks every new dispatch until restart.
 *
 * Entries without either timestamp (should not happen — `startedAt` is set at
 * dispatch) are skipped.
 */
export function detectStalledIssues(
  running: ReadonlyMap<string, RunningEntry>,
  nowMs: number,
  stallTimeoutMs: number
): string[] {
  if (stallTimeoutMs <= 0) return [];

  const stalled: string[] = [];
  for (const [runId, entry] of running) {
    // split-routing D12: a workflow unit's liveness is per-stage — the engine's
    // per-stage deadline (DEFAULT_STAGE_DEADLINE_MS) owns it, not this issue-grain
    // detector. A long multi-stage unit would otherwise be falsely stalled+retried,
    // which wipes the shared worktree mid-workflow. Skip entries with a plan set.
    if (entry.workflow) continue;
    const reference = entry.session?.lastTimestamp ?? entry.startedAt;
    if (!reference) continue;
    const silentMs = nowMs - new Date(reference).getTime();
    if (silentMs >= stallTimeoutMs) {
      stalled.push(runId);
    }
  }
  return stalled;
}
