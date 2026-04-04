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
  // Global cooldown check
  if (state.globalCooldownUntilMs && Date.now() < state.globalCooldownUntilMs) {
    return false;
  }

  // Rolling window request and token cap check
  const now = Date.now();
  // Per second requests check
  const recentCountSec = state.recentRequestTimestamps.filter((ts) => now - ts < 1000).length;
  if (recentCountSec >= state.maxRequestsPerSecond) {
    return false;
  }

  if (state.maxInputTokensPerMinute > 0) {
    const minInputTokens = state.recentInputTokens
      .filter((t) => now - t.timestamp < 60000)
      .reduce((sum, t) => sum + t.tokens, 0);
    if (minInputTokens >= state.maxInputTokensPerMinute) {
      return false; // Exhausted ITPM
    }
  }

  if (state.maxOutputTokensPerMinute > 0) {
    const minOutputTokens = state.recentOutputTokens
      .filter((t) => now - t.timestamp < 60000)
      .reduce((sum, t) => sum + t.tokens, 0);
    if (minOutputTokens >= state.maxOutputTokensPerMinute) {
      return false; // Exhausted OTPM
    }
  }

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
