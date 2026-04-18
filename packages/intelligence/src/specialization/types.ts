/**
 * Persistent Agent Specialization types.
 *
 * Extends the effectiveness module with temporal awareness, task-type
 * categorization, expertise levels, and dynamic persona weighting.
 */

export type { TaskType } from '../outcome/types.js';

/** Expertise tier derived from sample size and success rate. */
export type ExpertiseLevel = 'novice' | 'competent' | 'proficient' | 'expert';

/**
 * Composite specialization score for a (persona, system, taskType) tuple.
 * All values are in [0, 1].
 */
export interface SpecializationScore {
  /** Temporally-weighted success rate (recent outcomes weighted higher). */
  temporalSuccessRate: number;
  /** Consistency score: 1 - stddev of rolling success windows. */
  consistencyScore: number;
  /** Volume bonus: log-scaled sample count, capped at 1.0. */
  volumeBonus: number;
  /** Composite score: weighted combination of the above. */
  composite: number;
}

/** A single specialization entry for a (persona, system, taskType) bucket. */
export interface SpecializationEntry {
  persona: string;
  systemNodeId: string;
  taskType: string; // TaskType | '*'
  score: SpecializationScore;
  expertiseLevel: ExpertiseLevel;
  sampleSize: number;
  /** ISO timestamp of most recent outcome in this bucket. */
  lastOutcome: string;
}

/** Full specialization profile for a persona across all systems/task-types. */
export interface SpecializationProfile {
  persona: string;
  /** Per-(system, taskType) specialization entries. */
  entries: SpecializationEntry[];
  /** Top areas of expertise (highest composite scores). */
  strengths: SpecializationEntry[];
  /** Areas of consistent failure. */
  weaknesses: SpecializationEntry[];
  /** Overall expertise level across all entries. */
  overallLevel: ExpertiseLevel;
  /** ISO timestamp when this profile was computed. */
  computedAt: string;
}

/** Weighted persona recommendation incorporating specialization scores. */
export interface WeightedRecommendation {
  persona: string;
  /** Base score from existing recommendPersona(). */
  baseScore: number;
  /** Specialization multiplier [0.5, 1.5]. */
  specializationMultiplier: number;
  /** Final weighted score: baseScore * specializationMultiplier. */
  weightedScore: number;
  /** Expertise level for the requested systems/task-type. */
  expertiseLevel: ExpertiseLevel;
  /** Number of requested systems with specialization data. */
  specializedSystems: number;
}
