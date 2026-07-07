/**
 * `PoolStateProvider` — the read-only port the Phase 4 `LocalModelResolver`
 * consumes to derive its candidate list from LMLM pool state (D5). Both
 * `PoolManager` and `PoolStateStore` structurally satisfy it via their
 * existing `snapshot(): PoolState` accessor, so no adapter is required.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md Phase 4; D5
 */
import type { PoolState } from './types.js';

/** Read-only view over current pool state. Satisfied by PoolManager + PoolStateStore. */
export interface PoolStateProvider {
  /** Frozen clone of the current pool state. */
  snapshot(): PoolState;
}

/**
 * Derive the resolver candidate list from pool state: entries ordered by
 * `currentScore` descending, mapped to `ollamaName`. Pure; does not mutate
 * the input.
 */
export function poolStateToCandidates(state: PoolState): string[] {
  return [...state.entries]
    .sort((a, b) => b.currentScore - a.currentScore)
    .map((entry) => entry.ollamaName);
}
