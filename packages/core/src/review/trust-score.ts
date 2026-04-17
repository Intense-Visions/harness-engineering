import type { ReviewFinding } from './types';
import type { ReviewDomain } from './types/context';

/** Validation method → trust factor. Mechanical is authoritative, heuristic is weakest. */
const VALIDATION_SCORES: Record<ReviewFinding['validatedBy'], number> = {
  mechanical: 1.0,
  graph: 0.8,
  heuristic: 0.5,
};

/** Per-domain historical accuracy baselines (used when graph is unavailable). */
const DOMAIN_BASELINES: Record<ReviewDomain, number> = {
  security: 0.7,
  bug: 0.6,
  architecture: 0.65,
  compliance: 0.75,
};

/** Weight of each factor in the final score. Sums to 1.0. */
const FACTOR_WEIGHTS = {
  validation: 0.35,
  evidence: 0.30,
  agreement: 0.15,
  historical: 0.20,
} as const;

/** Evidence items needed for maximum evidence factor. */
const EVIDENCE_SATURATION = 3;

/** Agreement factor when corroborated by another domain. */
const CORROBORATED_AGREEMENT = 1.0;

/** Agreement factor when only one agent flagged this location. */
const STANDALONE_AGREEMENT = 0.5;

/** Line gap for agreement detection (same as dedup). */
const AGREEMENT_LINE_GAP = 3;

function rangesOverlap(a: [number, number], b: [number, number], gap: number): boolean {
  return a[0] <= b[1] + gap && b[0] <= a[1] + gap;
}

/**
 * Build a set of finding IDs that are corroborated by findings from a different domain
 * targeting overlapping line ranges in the same file.
 */
function findCorroboratedIds(findings: ReviewFinding[]): Set<string> {
  const corroborated = new Set<string>();

  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      const a = findings[i]!;
      const b = findings[j]!;
      if (
        a.file === b.file &&
        a.domain !== b.domain &&
        rangesOverlap(a.lineRange, b.lineRange, AGREEMENT_LINE_GAP)
      ) {
        corroborated.add(a.id);
        corroborated.add(b.id);
      }
    }
  }

  return corroborated;
}

/**
 * Compute trust scores for all findings. Pure function — same inputs produce same outputs.
 *
 * Score = round((validation * 0.35 + evidence * 0.25 + agreement * 0.20 + historical * 0.20) * 100)
 */
export function computeTrustScores(findings: ReviewFinding[]): ReviewFinding[] {
  if (findings.length === 0) return [];

  const corroboratedIds = findCorroboratedIds(findings);

  return findings.map((finding) => {
    const validationFactor = VALIDATION_SCORES[finding.validatedBy];
    const evidenceFactor = Math.min(1.0, finding.evidence.length / EVIDENCE_SATURATION);
    const agreementFactor = corroboratedIds.has(finding.id)
      ? CORROBORATED_AGREEMENT
      : STANDALONE_AGREEMENT;
    const historicalFactor = DOMAIN_BASELINES[finding.domain];

    const raw =
      FACTOR_WEIGHTS.validation * validationFactor +
      FACTOR_WEIGHTS.evidence * evidenceFactor +
      FACTOR_WEIGHTS.agreement * agreementFactor +
      FACTOR_WEIGHTS.historical * historicalFactor;

    const trustScore = Math.round(raw * 100);

    return { ...finding, trustScore };
  });
}

/** Map numeric trust score to categorical level for backwards compatibility. */
export function getTrustLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}
