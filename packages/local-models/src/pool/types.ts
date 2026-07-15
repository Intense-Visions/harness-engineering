/**
 * Pool — runtime types.
 *
 * Phase 3a stub. Mirrors the runtime shapes defined in
 * `docs/changes/local-model-lifecycle-manager/proposal.md` (lines 140–157)
 * verbatim so later phases (3b installer + manager, 4 resolver, 5b proposals,
 * 6 scheduler) consume them through the package barrel without re-modeling.
 *
 * The persisted shape is intentionally minimal: only the fields the proposal
 * defines on `PoolEntry` / `PoolState` survive a crash + reload cycle.
 * Transient status (e.g. `pendingEviction`, `pendingInstall`) lives on a
 * separate runtime record introduced in Phase 3b alongside the install state
 * machine, so a crash mid-pull cannot leave a stale flag pinned on disk.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 3, lines 431–443)
 */

import type { RankProfile } from '../ranker/profiles.js';

/**
 * A single installed Ollama model whose lifecycle the orchestrator is
 * managing. Steady-state shape only — transient install/evict status is
 * tracked separately so the on-disk record stays stable across restarts.
 */
export interface PoolEntry {
  /** Ollama model identifier, e.g. `'qwen3:32b'`. Unique within a pool. */
  ollamaName: string;
  /** Source repo on HuggingFace, e.g. `'Qwen/Qwen3-32B-GGUF'`. */
  hfRepoId: string;
  /** Disk footprint reported by `/api/show` at install time, in GB. */
  sizeOnDiskGb: number;
  /** ISO-8601 timestamp recorded when the install completed. */
  installedAt: string;
  /**
   * ISO-8601 timestamp of the most recent dispatch that resolved to this
   * entry. `null` while the resolver has never picked it up — the eviction
   * planner ranks `null` oldest so unused fresh installs evict first when
   * scores tie.
   */
  lastUsedAt: string | null;
  /** Most-recent ranker score (0–100). Eviction's primary sort key. */
  currentScore: number;
  /**
   * Consumption Phase 4 (T13): most-recent per-task-profile scores (0–100),
   * written back by the scheduler's re-score step. Optional + additive so
   * entries persisted before this field round-trip unchanged (the loader
   * tolerates its absence; `cloneEntry` spreads it when present). Consumed by
   * `poolStateToCandidates(state, profile)` to order candidates for a
   * task-tagged dispatch. Absent ⇒ selection falls back to `currentScore`.
   */
  scoresByProfile?: Partial<Record<RankProfile, number>>;
  /**
   * Whether this model can drive an AGENTIC build — i.e. it emits native OpenAI
   * `tool_calls` (not the call rendered as text, which the coding-agent SDK can't
   * parse). Determined by `probeToolCalling` (a cheap `/api/show` capability gate
   * + one tool-schema inference call) and written back by the scheduler re-score.
   * Optional + additive (round-trips via `cloneEntry`'s spread; the loader tolerates
   * its absence). Consumed by `poolStateToCandidates(state, profile, {requireToolCalling})`
   * to keep an agentic BUILD from routing to a text-only model. Absent ⇒ unknown ⇒
   * NOT filtered (fail-open; only `false` excludes). Triage/classification never sets it.
   */
  toolCalling?: boolean;
}

/**
 * The full pool record persisted to `~/.harness/local-models/pool.json`.
 * `diskUsedGb` is derived data — `PoolStateStore.update` recomputes it from
 * the entry sum on every mutation so callers cannot drift the two apart.
 */
export interface PoolState {
  /** Hard ceiling on cumulative `sizeOnDiskGb` across `entries`. */
  diskBudgetGb: number;
  /** Sum of `entries.sizeOnDiskGb`. Derived; never set by callers. */
  diskUsedGb: number;
  entries: PoolEntry[];
  /** Operator-approved HuggingFace orgs. Empty array ⇒ no installs allowed. */
  allowedOrgs: string[];
  /**
   * Optional family allowlist within `allowedOrgs`. Empty array ⇒ all
   * families under the allowed orgs are permitted.
   */
  allowedFamilies: string[];
  /** ISO-8601 timestamp of the last successful refresh; `null` before first tick. */
  lastRefreshAt: string | null;
}

/**
 * Runtime view of a pool entry with the transient `pendingEviction` overlay
 * (LMLM Phase 7 / S1). `pendingEviction` is NEVER persisted — it lives in a
 * `PoolManager`-owned `Set` and is overlaid only at `viewState()` time, so a
 * crash mid-drain cannot pin a stale flag on disk (`cloneEntry` in `state.ts`
 * spreads all persisted fields, so this flag must stay off `PoolEntry`).
 */
export interface PoolEntryView extends PoolEntry {
  /** True while an approved eviction is deferred because the model is in use (S1). */
  pendingEviction?: boolean;
}

/** Runtime view of the whole pool state with `pendingEviction`-overlaid entries. */
export interface PoolStateView extends Omit<PoolState, 'entries'> {
  entries: PoolEntryView[];
}

/**
 * Factory for the all-zero / all-empty state. Used by `PoolStateStore.load`
 * when the on-disk file is missing, malformed, or schema-mismatched.
 */
export function EmptyPoolState(): PoolState {
  return {
    diskBudgetGb: 0,
    diskUsedGb: 0,
    entries: [],
    allowedOrgs: [],
    allowedFamilies: [],
    lastRefreshAt: null,
  };
}

/** Alias kept for readability at call sites that talk about candidates. */
export type EvictionCandidate = PoolEntry;

/**
 * The eviction planner's reply. `evict` is ordered lowest-score first;
 * `freedGb` is the cumulative `sizeOnDiskGb` of `evict`; `remainingNeededGb`
 * is what's left to free if the pool couldn't satisfy the request. The
 * caller decides whether `remainingNeededGb > 0` is an error.
 */
export interface EvictionPlan {
  evict: PoolEntry[];
  freedGb: number;
  remainingNeededGb: number;
}
