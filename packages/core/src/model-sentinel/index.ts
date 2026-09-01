/**
 * Model-update regression sentinel (#1617) — supplier change-control for the
 * underlying model.
 *
 * Treat the model as a vendored dependency: snapshot the configured model
 * identity (`agent.backends[*].model`), detect a change vs the last-seen value,
 * and append a sentinel record to `.harness/model-sentinel/history.jsonl`.
 * Detect + report only — the pinned behaviour-envelope suite, the scheduled
 * canary, and the routing hold gate are deferred (see the issue remainder).
 */

export type {
  BackendModelIdentity,
  ModelSnapshot,
  BackendModelDelta,
  DriftSeverity,
  DriftKind,
  ModelDriftResult,
  SentinelRecord,
  SentinelCycleResult,
} from './types';

export { snapshotModelIdentities, fnv1aHex, type RawBackendsMap } from './snapshot';

export { detectModelDrift } from './drift';

export {
  readSentinelHistory,
  latestSnapshot,
  appendSentinelRecord,
  sentinelHistoryPath,
  SENTINEL_HISTORY_RELPATH,
} from './store';

export {
  evaluateModelSentinel,
  acknowledgeModelDrift,
  hasUnacknowledgedMaterialDrift,
} from './evaluate';
