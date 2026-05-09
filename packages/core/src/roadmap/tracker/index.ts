/**
 * Tracker abstraction — public entry point.
 *
 * Phase 1 surface: IssueTrackerClient, Issue, BlockerRef, TrackerConfig.
 * Phase 2 will add: factory(), body-metadata helpers, ETag store,
 * conflict types, and the GitHub Issues adapter.
 *
 * @see docs/changes/roadmap-tracker-only/proposal.md
 */
export type { IssueTrackerClient, Issue, BlockerRef, TrackerConfig } from './types';
