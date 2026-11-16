/**
 * #2063 — make the committed substrate's semantic debt VISIBLE.
 *
 * Per ADR 0116 a PR legitimately downgrades a unit to `semantic: absent` and the
 * single-writer `main` main-pass is expected to restore it — but nothing reported
 * whether that restoration ever happened, so the absent share grew unseen. These
 * pure helpers format the present/absent ratio and decide how loudly `--check`
 * surfaces it. They never change ADR 0116 semantics: on the `pr` path an absent
 * unit is the designed outcome (info only); on `main` it is advisory debt (a
 * warning), and becomes a failure ONLY when the opt-in
 * `comprehension.maxSemanticAbsentRatio` threshold is configured and exceeded.
 */

import type { SemanticCoverage } from '@harness-engineering/core';
import type { RegressionContext } from './regression';

/** `572 present / 178 absent of 750 unit(s) — 23.7% semantic: absent`. */
export function formatSemanticCoverage(cov: SemanticCoverage): string {
  return (
    `Semantic coverage: ${cov.present} present / ${cov.absent} absent of ${cov.total} ` +
    `unit(s) — ${(cov.absentRatio * 100).toFixed(1)}% semantic: absent.`
  );
}

export interface SemanticCoverageAssessment {
  /** `none` ⇒ print nothing; `error` ⇒ the configured threshold was exceeded on `main`. */
  level: 'none' | 'info' | 'warn' | 'error';
  message: string;
}

const RESTORE_HINT =
  "Restore it with a provider-backed 'harness comprehend --all' committed to main (#2063).";

/**
 * Decide how `--check` surfaces the ratio. `maxAbsentRatio` is the optional
 * `comprehension.maxSemanticAbsentRatio` (a fraction in [0, 1]); absent ⇒ never
 * fail. The threshold is strict (`ratio > max`) and only ever applies on `main`.
 */
export function assessSemanticCoverage(
  cov: SemanticCoverage,
  context: RegressionContext,
  maxAbsentRatio?: number
): SemanticCoverageAssessment {
  if (cov.total === 0) return { level: 'none', message: '' };
  const line = formatSemanticCoverage(cov);
  if (cov.absent === 0) return { level: 'info', message: line };
  if (context === 'pr') {
    return {
      level: 'info',
      message:
        `${line} Static-only units are expected on the PR path; semantic is restored by the ` +
        '`main` main-pass (ADR 0116 §4).',
    };
  }
  if (maxAbsentRatio !== undefined && cov.absentRatio > maxAbsentRatio) {
    return {
      level: 'error',
      message:
        `${line} Exceeds comprehension.maxSemanticAbsentRatio ` +
        `(${(maxAbsentRatio * 100).toFixed(1)}%). ${RESTORE_HINT}`,
    };
  }
  return {
    level: 'warn',
    message: `${line} The semantic half is missing for these units on main. ${RESTORE_HINT}`,
  };
}
