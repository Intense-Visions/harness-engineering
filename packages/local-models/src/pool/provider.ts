/**
 * `PoolStateProvider` — the read-only port the Phase 4 `LocalModelResolver`
 * consumes to derive its candidate list from LMLM pool state (D5). Both
 * `PoolManager` and `PoolStateStore` structurally satisfy it via their
 * existing `snapshot(): PoolState` accessor, so no adapter is required.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md Phase 4; D5
 */
import type { PoolState, PoolEntry } from './types.js';
import type { RankProfile } from '../ranker/profiles.js';

/** Read-only view over current pool state. Satisfied by PoolManager + PoolStateStore. */
export interface PoolStateProvider {
  /** Frozen clone of the current pool state. */
  snapshot(): PoolState;
}

/**
 * The score an entry sorts by for `profile`. Consumption Phase 4 (T15): when a
 * task profile is requested, prefer that profile's score from `scoresByProfile`;
 * fall back to `currentScore` when the entry lacks a profile score (older entry,
 * or a profile the re-rank couldn't compute). With no profile, `currentScore`.
 */
function scoreForProfile(entry: PoolEntry, profile?: RankProfile): number {
  if (profile !== undefined) {
    const byProfile = entry.scoresByProfile?.[profile];
    if (byProfile !== undefined) return byProfile;
  }
  return entry.currentScore;
}

/** Options for {@link poolStateToCandidates}. */
export interface PoolCandidateOptions {
  /**
   * When true, drop entries KNOWN not to drive an agentic build (`toolCalling === false`),
   * keeping those that can (`true`) or are unprobed (`undefined`, fail-open). Set only for
   * agentic BUILD routing — never for triage/classification, which needs no tool-calling.
   */
  requireToolCalling?: boolean;
}

/**
 * Derive the resolver candidate list from pool state: entries ordered by score
 * descending, mapped to `ollamaName`. When `profile` is given, entries order by
 * their per-profile score (falling back to `currentScore`) so a task-tagged
 * dispatch prefers the profile's best-fit model; `ollamaName` breaks ties for a
 * stable order. With `opts.requireToolCalling`, entries known NOT to tool-call are
 * excluded first (fail-open on unknowns). Pure; does not mutate the input.
 */
export function poolStateToCandidates(
  state: PoolState,
  profile?: RankProfile,
  opts?: PoolCandidateOptions
): string[] {
  const entries =
    opts?.requireToolCalling === true
      ? state.entries.filter((e) => e.toolCalling !== false) // keep true + undefined (fail-open)
      : state.entries;
  return [...entries]
    .sort((a, b) => {
      const diff = scoreForProfile(b, profile) - scoreForProfile(a, profile);
      if (diff !== 0) return diff;
      return a.ollamaName < b.ollamaName ? -1 : a.ollamaName > b.ollamaName ? 1 : 0;
    })
    .map((entry) => entry.ollamaName);
}
