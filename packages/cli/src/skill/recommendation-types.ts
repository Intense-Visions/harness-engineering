import { HEALTH_SIGNAL_NAMES, type SignalName } from '@harness-engineering/core';

/**
 * Change-type signals (exactly one active per dispatch). cli-LOCAL: these are a
 * dispatch concern, not a health-vocabulary concern, so core must stay unaware
 * of them (layer rule: core ⇏ cli).
 */
export const CHANGE_SIGNALS = [
  'change-feature',
  'change-bugfix',
  'change-refactor',
  'change-docs',
] as const;

/** Domain signals (zero or more active per dispatch). cli-LOCAL — see CHANGE_SIGNALS. */
export const DOMAIN_SIGNALS = [
  'domain-database',
  'domain-containerization',
  'domain-deployment',
  'domain-infrastructure-as-code',
  'domain-api-design',
  'domain-secrets',
  'domain-e2e',
  'domain-mutation-test',
  'domain-load-testing',
  'domain-data-pipeline',
  'domain-mobile-patterns',
  'domain-incident-response',
] as const;

/**
 * Standardized signal identifiers used in SkillAddress.signal,
 * HealthSnapshot.signals, and Recommendation.triggeredBy.
 *
 * The health portion is single-sourced from core's `HEALTH_SIGNAL_NAMES` (SC4);
 * the cli-local change/domain signals follow. Order: 12 health, 4 change, 12 domain.
 */
export const HEALTH_SIGNALS = [
  ...HEALTH_SIGNAL_NAMES,
  ...CHANGE_SIGNALS,
  ...DOMAIN_SIGNALS,
] as const;

/** A single health signal identifier. */
export type HealthSignal =
  | SignalName
  | (typeof CHANGE_SIGNALS)[number]
  | (typeof DOMAIN_SIGNALS)[number];

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

/** A knowledge skill recommendation produced by the dispatcher (not the health engine). */
export interface KnowledgeRecommendation {
  /** Skill name (matches skill.yaml name field). */
  skillName: string;
  /** Composite score from 0 to 1. */
  score: number;
  /** File glob patterns that triggered this recommendation. */
  paths: string[];
}

/** The complete result of a recommendation run. */
export interface RecommendationResult {
  /** Ordered list of skill recommendations. */
  recommendations: Recommendation[];
  /** Age indicator for the health snapshot used. */
  snapshotAge: 'fresh' | 'cached' | 'none';
  /** Human-readable explanation of the sequencing logic. */
  sequenceReasoning: string;
  /** Knowledge skill recommendations from the dispatcher (separate from health-based recs). */
  knowledgeRecommendations?: KnowledgeRecommendation[];
}
