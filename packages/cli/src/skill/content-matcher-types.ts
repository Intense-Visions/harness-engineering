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

/**
 * Shared domain-to-keyword mapping used by both signal-extractor (inferDomain)
 * and content-matcher (computeDomainMatch). Single source of truth prevents drift.
 */
export const DOMAIN_KEYWORD_MAP: Record<string, string[]> = {
  design: [
    'layout',
    'responsive',
    'typography',
    'color',
    'theme',
    'dark mode',
    'ui',
    'ux',
    'component',
    'palette',
    'breakpoint',
    'grid',
    'elevation',
    'shadow',
    'motion',
    'animation',
    'css',
  ],
  auth: [
    'authentication',
    'authorization',
    'oauth',
    'session',
    'token',
    'jwt',
    'login',
    'signup',
    'password',
    'credential',
    'rbac',
    'permission',
    'identity',
  ],
  data: [
    'database',
    'schema',
    'migration',
    'query',
    'sql',
    'nosql',
    'orm',
    'model',
    'table',
    'transaction',
    'prisma',
    'drizzle',
  ],
  security: [
    'security',
    'vulnerability',
    'xss',
    'csrf',
    'injection',
    'sanitiz',
    'encrypt',
    'hash',
    'owasp',
    'cve',
    'audit',
  ],
  a11y: [
    'accessibility',
    'a11y',
    'aria',
    'screen reader',
    'screen-reader',
    'wcag',
    'contrast',
    'keyboard navigation',
    'focus management',
  ],
  perf: [
    'performance',
    'latency',
    'throughput',
    'cache',
    'lazy load',
    'bundle size',
    'tree shaking',
    'code splitting',
    'lighthouse',
    'optimization',
    'bundle',
  ],
  testing: [
    'test',
    'coverage',
    'mock',
    'stub',
    'fixture',
    'assertion',
    'snapshot',
    'e2e',
    'integration test',
    'unit test',
    'tdd',
  ],
  api: [
    'api',
    'endpoint',
    'rest',
    'graphql',
    'openapi',
    'swagger',
    'route',
    'middleware',
    'webhook',
    'grpc',
  ],
  infra: [
    'docker',
    'kubernetes',
    'ci/cd',
    'ci',
    'cd',
    'deploy',
    'terraform',
    'aws',
    'gcp',
    'azure',
    'cloud',
    'container',
    'helm',
  ],
  mobile: [
    'mobile',
    'ios',
    'android',
    'react native',
    'react-native',
    'flutter',
    'app store',
    'push notification',
  ],
};
