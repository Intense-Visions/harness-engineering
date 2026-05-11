/**
 * Parses a roadmap from its string representation (Markdown or JSON).
 */
export { parseRoadmap } from './parse';

/**
 * Serializes a roadmap object back to its string representation.
 */
export { serializeRoadmap } from './serialize';

/**
 * Synchronizes the project roadmap with the current state of the codebase and issues.
 */
export { syncRoadmap, applySyncChanges } from './sync';

/**
 * Type definitions for roadmap synchronization and changes.
 */
export type { SyncChange, SyncOptions } from './sync';

/**
 * Tracker sync adapter interface and shared utilities for external issue trackers.
 */
export type { TrackerSyncAdapter, ExternalSyncOptions } from './tracker-sync';
export { resolveReverseStatus } from './tracker-sync';

/**
 * Shared status ranking for directional sync protection.
 */
export { STATUS_RANK, isRegression } from './status-rank';

/**
 * GitHub Issues adapter for the TrackerSyncAdapter interface.
 */
export { GitHubIssuesSyncAdapter } from './adapters/github-issues';

/**
 * Shared tracker config loader for harness.config.json.
 */
export { loadTrackerSyncConfig } from './tracker-config';

/**
 * Sync engine for bidirectional sync between roadmap and external trackers.
 */
export { syncToExternal, syncFromExternal, fullSync } from './sync-engine';

/**
 * Pilot scoring algorithm for auto-pick feature selection.
 */
export {
  scoreRoadmapCandidates,
  assignFeature,
  scoreRoadmapCandidatesForMode,
} from './pilot-scoring';
export type { ScoredCandidate, PilotScoringOptions } from './pilot-scoring';

/**
 * File-less pilot scoring (D4: priority + createdAt ascending).
 */
export { scoreRoadmapCandidatesFileLess } from './pilot-scoring-file-less';
export type { FileLessScoredCandidate } from './pilot-scoring-file-less';

/**
 * Tracker abstraction — IssueTrackerClient and shared types.
 * See packages/core/src/roadmap/tracker/index.ts.
 */
export type {
  IssueTrackerClient,
  Issue,
  BlockerRef,
  TrackerConfig,
  RoadmapTrackerClient,
  TrackedFeature,
  NewFeatureInput,
  FeaturePatch,
  HistoryEvent,
  HistoryEventType,
  TrackerClientConfig,
} from './tracker';
export { ConflictError, createTrackerClient, ETagStore } from './tracker';

/**
 * Roadmap storage mode helper. See packages/core/src/roadmap/mode.ts.
 */
export { getRoadmapMode } from './mode';
export type { RoadmapMode, RoadmapModeConfig } from './mode';

/** Per-request loader: resolves roadmap.mode from <projectRoot>/harness.config.json. */
export { loadProjectRoadmapMode } from './load-mode';

/** Shared loader: resolves `TrackerClientConfig` from harness.config.json. */
export { loadTrackerClientConfigFromProject } from './load-tracker-client-config';

/**
 * Migration helpers. Phase 5 migration to file-less roadmap mode.
 * See packages/core/src/roadmap/migrate/index.ts.
 */
export * as migrate from './migrate';
