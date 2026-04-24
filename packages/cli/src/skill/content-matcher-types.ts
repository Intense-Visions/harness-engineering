/**
 * Types for the Pipeline Skill Advisor content matching engine.
 * Used by signal-extractor, content-matcher, and skills-md-writer.
 */

/** Content signals extracted from a spec and project context. */
export interface ContentSignals {
  /** Keywords extracted from spec frontmatter + contextKeywords from handoff. */
  specKeywords: string[];
  /** Full spec body text for description term matching. */
  specText: string;
  /** Individual task description for task-level matching (optional). */
  taskText?: string;
  /** Tech stack signals detected from project (e.g., 'react', 'typescript'). */
  stackSignals: string[];
  /** Domain categories extracted from spec content (e.g., 'design', 'auth'). */
  featureDomain: string[];
}

/** Tier classification for a matched skill. */
export type SkillMatchTier = 'apply' | 'reference' | 'consider';

/** A single skill match with scoring and classification. */
export interface SkillMatch {
  /** Skill name (matches skill.yaml name field). */
  skillName: string;
  /** Composite score from 0 to 1. */
  score: number;
  /** Tier classification based on score thresholds. */
  tier: SkillMatchTier;
  /** Human-readable reasons for the match. */
  matchReasons: string[];
  /** Grouping category (e.g., 'design', 'framework', 'security'). */
  category: string;
  /** When during the phase this skill should be applied. */
  when: string;
}

/** Complete result of a content matching run. */
export interface ContentMatchResult {
  /** All matched skills above the exclusion threshold, sorted by score descending. */
  matches: SkillMatch[];
  /** The signals used for matching. */
  signalsUsed: ContentSignals;
  /** Duration of the scan in milliseconds. */
  scanDuration: number;
}

/** Score thresholds for tier classification. */
export const TIER_THRESHOLDS = {
  apply: 0.6,
  reference: 0.35,
  consider: 0.15,
} as const;

/** Scoring weights for each signal dimension. */
export const SCORING_WEIGHTS = {
  keyword: 0.35,
  stack: 0.25,
  termOverlap: 0.25,
  domain: 0.15,
} as const;
