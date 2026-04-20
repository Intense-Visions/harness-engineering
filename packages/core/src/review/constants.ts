import type { FindingSeverity, ReviewFinding } from './types';
import type { ReviewDomain } from './types/context';

/**
 * Severity rank — higher value means more severe.
 * Used by assessment, deduplication, and output formatting.
 */
export const SEVERITY_RANK: Record<FindingSeverity, number> = {
  suggestion: 0,
  important: 1,
  critical: 2,
};

/**
 * Ordered severity levels for iteration (most severe first).
 */
export const SEVERITY_ORDER: FindingSeverity[] = ['critical', 'important', 'suggestion'];

/**
 * Human-readable labels for severity levels.
 */
export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: 'Critical',
  important: 'Important',
  suggestion: 'Suggestion',
};

/**
 * ValidatedBy priority — higher is more authoritative.
 */
export const VALIDATED_BY_RANK: Record<string, number> = {
  mechanical: 0,
  heuristic: 1,
  graph: 2,
};

// --- Trust scoring constants ---

/** Validation method → trust factor. Mechanical is authoritative, heuristic is weakest. */
export const VALIDATION_SCORES: Record<ReviewFinding['validatedBy'], number> = {
  mechanical: 1.0,
  graph: 0.8,
  heuristic: 0.5,
};

/** Per-domain historical accuracy baselines (used when graph effectiveness data is unavailable). */
export const DOMAIN_BASELINES: Record<ReviewDomain, number> = {
  security: 0.7,
  bug: 0.6,
  architecture: 0.65,
  compliance: 0.75,
  learnings: 0.5,
};

/** Weight of each factor in the final trust score. Sums to 1.0. */
export const FACTOR_WEIGHTS = {
  validation: 0.35,
  evidence: 0.3,
  agreement: 0.15,
  historical: 0.2,
} as const;

/** Evidence items needed for maximum evidence factor score. */
export const EVIDENCE_SATURATION = 3;

/** Agreement factor when corroborated by a finding from a different domain. */
export const CORROBORATED_AGREEMENT = 1.0;

/** Agreement factor when only one agent flagged this location. */
export const STANDALONE_AGREEMENT = 0.5;

/** Line gap for cross-agent agreement detection (same tolerance as dedup). */
export const AGREEMENT_LINE_GAP = 3;

/**
 * Generate a deterministic finding ID from domain, file, line, and title.
 */
export function makeFindingId(domain: string, file: string, line: number, title: string): string {
  const hash = title.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '');
  return `${domain}-${file.replace(/[^a-zA-Z0-9]/g, '-')}-${line}-${hash}`;
}
