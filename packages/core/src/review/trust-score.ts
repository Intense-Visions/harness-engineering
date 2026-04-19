import type { ReviewFinding } from './types';
import type { ReviewDomain } from './types/context';
import {
  VALIDATION_SCORES,
  DOMAIN_BASELINES,
  FACTOR_WEIGHTS,
  EVIDENCE_SATURATION,
  CORROBORATED_AGREEMENT,
  STANDALONE_AGREEMENT,
  AGREEMENT_LINE_GAP,
} from './constants';

/**
 * Options for trust score computation.
 */
export interface TrustScoreOptions {
  /**
   * Per-domain accuracy overrides from graph-based effectiveness data.
   * When provided, these replace the corresponding DOMAIN_BASELINES values
   * for the historical accuracy factor. Callers can populate this from
   * PersonaEffectiveness scores in the intelligence package.
   *
   * Values should be in [0, 1].
   */
  domainAccuracy?: Partial<Record<ReviewDomain, number>>;
}

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
 * Score = round((validation × 0.35 + evidence × 0.30 + agreement × 0.15 + historical × 0.20) × 100)
 *
 * When `options.domainAccuracy` is provided, the historical factor uses graph-derived
 * effectiveness scores instead of the static DOMAIN_BASELINES. This allows callers
 * (e.g. the orchestrator) to enrich scoring with PersonaEffectiveness data.
 */
export function computeTrustScores(
  findings: ReviewFinding[],
  options?: TrustScoreOptions
): ReviewFinding[] {
  if (findings.length === 0) return [];

  const corroboratedIds = findCorroboratedIds(findings);
  const domainAccuracy = options?.domainAccuracy;

  return findings.map((finding) => {
    const validationFactor = VALIDATION_SCORES[finding.validatedBy];
    const evidenceFactor = Math.min(1.0, finding.evidence.length / EVIDENCE_SATURATION);
    const agreementFactor = corroboratedIds.has(finding.id)
      ? CORROBORATED_AGREEMENT
      : STANDALONE_AGREEMENT;
    const historicalFactor =
      domainAccuracy?.[finding.domain] ?? DOMAIN_BASELINES[finding.domain];

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
