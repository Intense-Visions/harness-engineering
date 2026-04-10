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
