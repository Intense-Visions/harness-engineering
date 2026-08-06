/**
 * Closed taxonomy of *why* a skill invocation did not complete. Recorded on
 * `SkillInvocationRecord.failureCategory` so downstream consumers (the
 * skill-effectiveness scorer and the catalog retrospective) can distinguish
 * failure reasons instead of treating every non-completed run as undifferentiated
 * noise.
 *
 * The categories are intentionally small and mutually exclusive:
 * - `prerequisite-missing` — a required precondition/input was absent (e.g. a
 *   missing spec, config, or upstream artifact) so the skill could not start.
 * - `gate-rejected` — a mechanical or evaluative gate returned a failing verdict
 *   (a failed `gate_result`, or an outcome/verify evaluation that was not
 *   satisfied).
 * - `user-cancelled` — a human aborted, interrupted, or declined to continue.
 * - `timeout` — the run exceeded a time budget / deadline.
 * - `dependency-failure` — an upstream dependency or blocking skill failed,
 *   leaving this run unable to proceed.
 * - `agent-error` — an unclassified execution error the agent hit (the default
 *   for a recorded error with no more specific signal).
 * - `inconclusive` — the run stopped without a determinable pass/fail verdict.
 */
export type FailureCategory =
  | 'prerequisite-missing'
  | 'gate-rejected'
  | 'user-cancelled'
  | 'timeout'
  | 'dependency-failure'
  | 'agent-error'
  | 'inconclusive';

/**
 * The full closed set of {@link FailureCategory} values, in a stable order.
 * Exported so producers and consumers can validate against a single source of
 * truth. Keep in sync with the derivation table in the adoption-tracker hook.
 */
export const FAILURE_CATEGORIES: readonly FailureCategory[] = [
  'prerequisite-missing',
  'gate-rejected',
  'user-cancelled',
  'timeout',
  'dependency-failure',
  'agent-error',
  'inconclusive',
];

/**
 * A single skill invocation record stored in adoption.jsonl.
 * One line per invocation, appended by the adoption-tracker hook.
 */
export interface SkillInvocationRecord {
  /** Skill name (e.g., "harness-brainstorming") */
  skill: string;
  /** Session identifier */
  session: string;
  /** ISO 8601 timestamp when the skill started */
  startedAt: string;
  /** Duration in milliseconds */
  duration: number;
  /** Invocation outcome */
  outcome: 'completed' | 'failed' | 'abandoned';
  /** Phase names reached during the invocation */
  phasesReached: string[];
  /** Skill tier (1, 2, or 3). Absent when not derivable from events. */
  tier?: number;
  /** How the skill was triggered. Absent when not derivable from events. */
  trigger?: string;
  /**
   * Why a non-completed run stopped. Absent for completed runs and for
   * non-completed runs whose reason cannot be determined from the event stream
   * (the reason is genuinely unknown rather than guessed). Optional and additive:
   * records written before this field existed still parse.
   */
  failureCategory?: FailureCategory;
}

/**
 * Aggregated summary for a single skill across multiple invocations.
 */
export interface SkillAdoptionSummary {
  /** Skill name */
  skill: string;
  /** Total invocation count */
  invocations: number;
  /** Fraction of invocations with outcome 'completed' (0-1) */
  successRate: number;
  /** Mean duration in milliseconds */
  avgDuration: number;
  /** ISO 8601 timestamp of the most recent invocation */
  lastUsed: string;
  /** Skill tier (absent when unknown) */
  tier?: number;
}

/**
 * Point-in-time snapshot of adoption metrics.
 * Used by CLI commands and dashboard API.
 */
export interface AdoptionSnapshot {
  /** Time period: "daily", "weekly", or "all-time" */
  period: string;
  /** Total invocations in the period */
  totalInvocations: number;
  /** Count of distinct skills invoked */
  uniqueSkills: number;
  /** Top skills by invocation count */
  topSkills: SkillAdoptionSummary[];
  /** ISO 8601 timestamp when this snapshot was generated */
  generatedAt: string;
}
