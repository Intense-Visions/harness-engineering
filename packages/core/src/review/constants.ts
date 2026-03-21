import type { FindingSeverity } from './types';

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

/**
 * Generate a deterministic finding ID from domain, file, line, and title.
 */
export function makeFindingId(domain: string, file: string, line: number, title: string): string {
  const hash = title.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '');
  return `${domain}-${file.replace(/[^a-zA-Z0-9]/g, '-')}-${line}-${hash}`;
}
