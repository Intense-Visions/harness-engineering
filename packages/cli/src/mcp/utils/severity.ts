/**
 * Canonical severity ordering for review findings.
 * Lower numbers = higher severity. Used by review-changes and review-pipeline.
 */
export const SEVERITY_ORDER: Record<string, number> = {
  error: 0,
  critical: 0,
  warning: 1,
  important: 1,
  info: 2,
  suggestion: 2,
};

/**
 * Sort an array of findings by severity descending (most severe first).
 * Findings without a recognized severity sort last.
 */
export function sortFindingsBySeverity(findings: unknown[]): unknown[] {
  return [...findings].sort((a, b) => {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aSev = SEVERITY_ORDER[typeof aObj.severity === 'string' ? aObj.severity : ''] ?? 99;
    const bSev = SEVERITY_ORDER[typeof bObj.severity === 'string' ? bObj.severity : ''] ?? 99;
    return aSev - bSev;
  });
}
