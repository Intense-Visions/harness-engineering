/**
 * Standardized health signal identifiers.
 * Used in SkillAddress.signal, HealthSnapshot.signals, and Recommendation.triggeredBy.
 */
export const HEALTH_SIGNALS = [
  'circular-deps',
  'layer-violations',
  'high-coupling',
  'high-complexity',
  'low-coverage',
  'dead-code',
  'drift',
  'security-findings',
  'doc-gaps',
  'perf-regression',
  'anomaly-outlier',
  'articulation-point',
] as const;

/** A single health signal identifier. */
export type HealthSignal = (typeof HEALTH_SIGNALS)[number];

/** Urgency classification for a recommendation. */
export type RecommendationUrgency = 'critical' | 'recommended' | 'nice-to-have';

/** A single skill recommendation with scoring and sequencing metadata. */
export interface Recommendation {
  /** Skill name (matches skill.yaml name field). */
  skillName: string;
  /** Composite score from 0 to 1. */
  score: number;
  /** Urgency classification. */
  urgency: RecommendationUrgency;
  /** Human-readable explanations of why this skill was recommended. */
  reasons: string[];
  /** Position in the recommended workflow order (1-based). */
  sequence: number;
  /** Signal identifiers that triggered this recommendation. */
  triggeredBy: string[];
}

/** The complete result of a recommendation run. */
export interface RecommendationResult {
  /** Ordered list of skill recommendations. */
  recommendations: Recommendation[];
  /** Age indicator for the health snapshot used. */
  snapshotAge: 'fresh' | 'cached' | 'none';
  /** Human-readable explanation of the sequencing logic. */
  sequenceReasoning: string;
}
