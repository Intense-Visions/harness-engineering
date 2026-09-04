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
export { PnyonTrackerAdapter } from './adapters/pnyon';
export type { PnyonTrackerOptions, PnyonTrackerClientConfig } from './adapters/pnyon';
export { WaypointHttp, WaypointHttpError } from './adapters/waypoint-http';
export type {
  WaypointItem,
  WaypointNewItem,
  WaypointItemPatch,
  WaypointCommand,
  WaypointCommandResult,
  WaypointEvidenceEntry,
} from './adapters/waypoint-http';
export {
  registerTrackerKind,
  getTrackerKindRegistration,
  listRegisteredTrackerKinds,
} from './registry';
export type { TrackerKindRegistration, RegisteredTrackerClientConfig } from './registry';
