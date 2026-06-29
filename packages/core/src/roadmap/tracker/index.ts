/**
 * Tracker abstraction — public entry point.
 *
 * Phase 1 surface (existing): IssueTrackerClient (small, 6 methods),
 *   Issue, BlockerRef, TrackerConfig.
 * Phase 2 surface (new): RoadmapTrackerClient (wide, 10 methods),
 *   TrackedFeature, NewFeatureInput, FeaturePatch, HistoryEvent,
 *   ConflictError, createTrackerClient, ETagStore.
 *
 * @see docs/changes/roadmap-tracker-only/proposal.md
 */
export type { IssueTrackerClient, Issue, BlockerRef, TrackerConfig } from './types';
export type {
  RoadmapTrackerClient,
  TrackedFeature,
  NewFeatureInput,
  FeaturePatch,
  HistoryEvent,
  HistoryEventType,
} from './client';
export { ConflictError } from './client';
export { createTrackerClient } from './factory';
export type {
  TrackerClientConfig,
  GitHubTrackerClientConfig,
  LinearTrackerClientConfig,
} from './factory';
export { LinearTrackerAdapter } from './adapters/linear';
export type { LinearTrackerOptions } from './adapters/linear';
export { ETagStore } from './etag-store';
export { makeTrackerConflictBody } from './conflict-body';
export type { TrackerConflictBody, MakeTrackerConflictBodyOptions } from './conflict-body';
