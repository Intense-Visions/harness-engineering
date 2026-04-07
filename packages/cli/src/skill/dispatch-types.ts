/**
 * Types for the intelligent skill dispatch system.
 * Used by the dispatch engine (Phase 2) and MCP tool (Phase 3).
 */

import type { ChangeType } from '@harness-engineering/core';
import type { HealthSnapshot } from './health-snapshot.js';
import type { RecommendationUrgency } from './recommendation-types.js';

/**
 * Enriched context that combines a health snapshot with change-type and
 * domain signals derived from a git diff.
 */
export interface DispatchContext {
  /** Existing cached or fresh health snapshot. */
  snapshot: HealthSnapshot;
  /** Change type derived from detectChangeType(). */
  changeType: ChangeType;
  /** File paths from git diff (project-relative). */
  changedFiles: string[];
  /** Domain identifiers derived from diff-scoped stack profile detection. */
  domains: string[];
  /** Merged signal set: snapshot.signals + change-type signal + domain signals. */
  allSignals: string[];
  /** Whether the health snapshot was freshly captured or loaded from cache. */
  snapshotFreshness: 'fresh' | 'cached';
}

/**
 * A single skill in the dispatched sequence, annotated with execution metadata.
 */
export interface DispatchedSkill {
  /** Skill name (matches skill.yaml name field). */
  name: string;
  /** Composite score from the recommendation engine (0 to 1). */
  score: number;
  /** Urgency classification from the recommendation engine. */
  urgency: RecommendationUrgency;
  /** Human-readable explanation of why this skill was dispatched. */
  reason: string;
  /** True if this skill targets non-overlapping signal categories with adjacent skills. */
  parallelSafe: boolean;
  /** Impact estimate: hard address match -> high, score >= 0.7 -> medium, else low. */
  estimatedImpact: 'high' | 'medium' | 'low';
  /** Skills that should run before this one (from skill index dependsOn field). */
  dependsOn?: string[];
}

/**
 * Complete result of a skill dispatch invocation.
 */
export interface DispatchResult {
  /** Summary context about the dispatch inputs. */
  context: {
    changeType: ChangeType;
    domains: string[];
    signalCount: number;
    snapshotFreshness: 'fresh' | 'cached';
  };
  /** Ordered list of dispatched skills with execution annotations. */
  skills: DispatchedSkill[];
  /** ISO 8601 timestamp when the dispatch result was generated. */
  generatedAt: string;
}
