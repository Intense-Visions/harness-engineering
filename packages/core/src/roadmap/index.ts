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
export type { TrackerSyncAdapter } from './tracker-sync';
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
 * Sync engine for bidirectional sync between roadmap and external trackers.
 */
export { syncToExternal, syncFromExternal, fullSync } from './sync-engine';
