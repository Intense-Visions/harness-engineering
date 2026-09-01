/**
 * Model-update regression sentinel (#1617) — types.
 *
 * Treat the underlying model as a vendored dependency: capture the configured
 * model identity, detect a change vs the last-seen value, and record an
 * append-only sentinel event. Detect + report only (the pinned behaviour-envelope
 * suite and the routing hold gate are deferred).
 */

/** The resolved model identity of a single configured backend. */
export interface BackendModelIdentity {
  /** Backend name (the key in `agent.backends`). */
  backend: string;
  /** Backend type discriminator (e.g. `anthropic`, `local`, `claude-code`). */
  type: string;
  /** Configured model id(s), normalised to a sorted, de-duplicated list. */
  models: string[];
}

/**
 * A deterministic point-in-time snapshot of every configured backend's model
 * identity. `backends` is sorted by name and each `models` list is sorted, so a
 * semantically identical configuration always yields an identical `digest`.
 */
export interface ModelSnapshot {
  /** ISO-8601 timestamp the snapshot was taken. */
  takenAt: string;
  /** Backends sorted by name. */
  backends: BackendModelIdentity[];
  /** Stable content hash over the canonical (name/model-sorted) identity set. */
  digest: string;
}

/** Per-backend change classification between two snapshots. */
export interface BackendModelDelta {
  backend: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  /** Model ids in the previous snapshot (empty when the backend is new). */
  before: string[];
  /** Model ids in the current snapshot (empty when the backend was removed). */
  after: string[];
  /** Model ids present now but not before. */
  addedModels: string[];
  /** Model ids present before but not now. */
  removedModels: string[];
}

/** Severity of an overall drift result. */
export type DriftSeverity = 'none' | 'benign' | 'material';

/** High-level classification of a sentinel cycle. */
export type DriftKind = 'initial' | 'unchanged' | 'changed';

/** The diff between a previous snapshot and the current one. */
export interface ModelDriftResult {
  kind: DriftKind;
  severity: DriftSeverity;
  /** Per-backend deltas (only backends that changed, plus added/removed ones). */
  deltas: BackendModelDelta[];
  /** Digest of the snapshot compared against, or null on the initial baseline. */
  previousDigest: string | null;
  /** Digest of the current snapshot. */
  currentDigest: string;
}

/**
 * One append-only record in `.harness/model-sentinel/history.jsonl`.
 * A record is written on the initial baseline, on every detected change, and on
 * an explicit acknowledgement (which re-pins the baseline without rewriting
 * history).
 */
export interface SentinelRecord {
  /** Monotonic-ish unique id (timestamp + digest prefix). */
  id: string;
  /** ISO-8601 timestamp the record was observed/written. */
  observedAt: string;
  /** The snapshot captured for this record. */
  snapshot: ModelSnapshot;
  /** The drift result relative to the prior snapshot. */
  drift: ModelDriftResult;
  /** True when this record is an operator acknowledgement re-pinning the baseline. */
  acknowledged: boolean;
  /** Optional free-text note (e.g. why an operator acknowledged the drift). */
  note?: string;
}

/** Result of running one sentinel cycle (snapshot → detect → maybe-append). */
export interface SentinelCycleResult {
  /** The record produced for this cycle (written iff `wroteRecord`). */
  record: SentinelRecord;
  /** The drift result for this cycle (same as `record.drift`). */
  drift: ModelDriftResult;
  /** Whether a new record was appended to the history file. */
  wroteRecord: boolean;
  /** Digest of the prior snapshot, or null when this is the first cycle. */
  previousDigest: string | null;
}
