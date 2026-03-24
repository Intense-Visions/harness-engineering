import type { OrchestratorState, RunningEntry } from '../types/internal';

/**
 * Get the number of available global concurrency slots.
 */
export function getAvailableSlots(state: OrchestratorState): number {
  return Math.max(state.maxConcurrentAgents - state.running.size, 0);
}

/**
 * Count running entries by normalized (lowercase) issue state.
 */
export function getPerStateCount(running: ReadonlyMap<string, RunningEntry>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of running.values()) {
    const key = entry.issue.state.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Check if dispatching an issue in the given state is allowed
 * by both global and per-state concurrency limits.
 */
export function canDispatch(
  state: OrchestratorState,
  issueState: string,
  maxConcurrentAgentsByState: Record<string, number>
): boolean {
  // Global slots check
  if (getAvailableSlots(state) <= 0) {
    return false;
  }

  // Per-state cap check
  const normalizedState = issueState.toLowerCase();
  const perStateCap = maxConcurrentAgentsByState[normalizedState];
  if (perStateCap !== undefined) {
    const perStateCounts = getPerStateCount(state.running);
    const currentCount = perStateCounts.get(normalizedState) ?? 0;
    if (currentCount >= perStateCap) {
      return false;
    }
  }

  return true;
}
