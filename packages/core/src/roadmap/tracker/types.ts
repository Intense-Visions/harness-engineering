/**
 * Tracker abstraction — shared types.
 *
 * This module re-exports the canonical tracker interface and its
 * companion types from `@harness-engineering/types`, giving them a
 * stable, public home inside `@harness-engineering/core` for
 * non-orchestrator consumers (CLI, dashboard, MCP, skills).
 *
 * Design note: the definitions live in `@harness-engineering/types`
 * to keep them at the foundational layer alongside `WorkflowConfig`
 * and `TrackerConfig`. Re-exporting from core (rather than
 * physically relocating the definitions) preserves the layer
 * topology while satisfying the public-surface goal of Phase 1
 * of the file-less roadmap proposal.
 *
 * @see docs/changes/roadmap-tracker-only/proposal.md
 */
export type {
  IssueTrackerClient,
  Issue,
  BlockerRef,
  TrackerConfig,
} from '@harness-engineering/types';
