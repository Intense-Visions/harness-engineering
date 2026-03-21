import type { ReviewFinding, ReviewAssessment, FindingSeverity } from '../types';
import { SEVERITY_RANK } from '../constants';

/**
 * Determine the overall assessment based on the highest severity finding.
 *
 * - No findings or all suggestions → approve
 * - Any important (but no critical) → comment
 * - Any critical → request-changes
 */
export function determineAssessment(findings: ReviewFinding[]): ReviewAssessment {
  if (findings.length === 0) return 'approve';

  let maxSeverity: FindingSeverity = 'suggestion';
  for (const f of findings) {
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[maxSeverity]) {
      maxSeverity = f.severity;
    }
  }

  switch (maxSeverity) {
    case 'critical':
      return 'request-changes';
    case 'important':
      return 'comment';
    case 'suggestion':
      return 'approve';
  }
}

/**
 * Map an assessment to a process exit code.
 * - approve / comment → 0
 * - request-changes → 1
 */
export function getExitCode(assessment: ReviewAssessment): number {
  return assessment === 'request-changes' ? 1 : 0;
}
