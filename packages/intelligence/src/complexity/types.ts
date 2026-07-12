import type { ComplexityLevel } from '@harness-engineering/types';

/** Which signal set is available at this invocation phase (S3-001). */
export type Phase = 'pre-diff' | 'post-diff';

/** Raw signals gathered for the static pass. Diff-based fields are undefined pre-diff. */
export interface ComplexitySignals {
  /** Files touched by the diff/target. Undefined pre-diff. */
  filesTouched?: number;
  /** Distinct architectural layers touched. Undefined pre-diff. */
  layersTouched?: number;
  /** compute_blast_radius result. Undefined pre-diff. */
  blastRadius?: number;
  /** hotspot × churn heat. Undefined pre-diff. */
  hotspotChurn?: number;
  /** Text-only fallback signals (always available). */
  descriptionLength: number;
  specExists: boolean;
  acceptanceMeasurable: boolean;
}

/** Provisional static verdict before any LLM tie-break. */
export interface StaticVerdict {
  level: ComplexityLevel;
  confidence: 'high' | 'medium' | 'low';
  /** Serialized subset of signals for the ComplexityVerdict.signals map. */
  signals: Record<string, number | boolean | string>;
}
