// packages/cli/src/commands/roadmap/triage-pool.ts
//
// Roadmap Auto-Triage — pool-first local-model selection for the CLI brainstorm/report path.
//
// The static `agent.backends.local.model` config list is a fixed, hand-maintained array whose
// FIRST entry was the only model triage ever used — so triage could be pinned to a weak model
// even after the LMLM pool had installed and RANKED a stronger one. The live orchestrator does
// not have this problem: its `LocalModelResolver` derives candidates from the pool via
// `poolStateToCandidates(snapshot, profile)`. This module brings the SAME pool-first pick to the
// one-shot CLI triage path, so the CLI and live agents agree on the model.
//
// Pool is the PREFERRED source; the static config list remains the documented fallback for
// pool-less adopters and non-Ollama (`pi`) backends (see `resolveTriageProvider`).

import {
  PoolStateStore,
  poolStateToCandidates,
  type PoolState,
  type RankProfile,
} from '@harness-engineering/orchestrator';

/** Minimal read view of the persisted pool the resolver needs (hydrate + snapshot). */
export interface PoolSnapshotStore {
  load(): Promise<void>;
  snapshot(): PoolState;
}

/** Dependencies for {@link resolvePreferredLocalModel} — an injectable store for tests. */
export interface ResolvePreferredLocalModelDeps {
  /**
   * Store to read. Defaults to a `PoolStateStore` over the global
   * `~/.harness/local-models/pool.json`. Injected in tests to avoid disk IO.
   */
  store?: PoolSnapshotStore;
}

/**
 * Derive the preferred LOCAL model from the persisted LMLM pool, ranked for `profile`.
 *
 * Returns the top-ranked installed model for `profile`, or `undefined` when the pool is
 * empty/absent or any read fails — the caller then falls back to the static
 * `agent.backends.local.model` config list. NEVER throws (a broken/missing pool must degrade to
 * the config fallback, not break triage). Mirrors the orchestrator's `LocalModelResolver`
 * candidate derivation (`poolStateToCandidates`) so the CLI and live agents pick the same model.
 */
export async function resolvePreferredLocalModel(
  profile: RankProfile,
  deps: ResolvePreferredLocalModelDeps = {}
): Promise<string | undefined> {
  try {
    const store = deps.store ?? new PoolStateStore();
    await store.load();
    // `load()` itself degrades a missing/malformed pool to an empty snapshot, so `candidates`
    // is simply `[]` there and we return `undefined` → config fallback.
    const candidates = poolStateToCandidates(store.snapshot(), profile);
    return candidates[0];
  } catch {
    // Defensive: any unexpected throw (a future store change, an injected faulty store) must
    // not break triage — degrade to the static config list.
    return undefined;
  }
}
