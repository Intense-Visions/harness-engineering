import type { ReviewFinding, ReviewDomain } from './types';
import { SEVERITY_RANK, VALIDATED_BY_RANK } from './constants';

/**
 * Options for the deduplication phase.
 */
export interface DeduplicateFindingsOptions {
  /** Validated findings from Phase 5 */
  findings: ReviewFinding[];
  /** Maximum line gap to consider findings as overlapping (default: 3) */
  lineGap?: number;
}

/**
 * Check if two line ranges overlap (or are within `gap` lines of each other).
 */
function rangesOverlap(a: [number, number], b: [number, number], gap: number): boolean {
  return a[0] <= b[1] + gap && b[0] <= a[1] + gap;
}

/**
 * Merge two findings into one.
 * - Keeps highest severity
 * - Combines evidence (deduped)
 * - Preserves longest rationale
 * - Expands line range
 * - Merges domains in title
 * - Keeps highest-priority validatedBy
 */
function mergeFindings(a: ReviewFinding, b: ReviewFinding): ReviewFinding {
  const highestSeverity =
    SEVERITY_RANK[a.severity] >= SEVERITY_RANK[b.severity] ? a.severity : b.severity;

  const highestValidatedBy =
    (VALIDATED_BY_RANK[a.validatedBy] ?? 0) >= (VALIDATED_BY_RANK[b.validatedBy] ?? 0)
      ? a.validatedBy
      : b.validatedBy;

  const longestRationale = a.rationale.length >= b.rationale.length ? a.rationale : b.rationale;

  // Combine evidence, dedup
  const evidenceSet = new Set([...a.evidence, ...b.evidence]);

  // Expand line range
  const lineRange: [number, number] = [
    Math.min(a.lineRange[0], b.lineRange[0]),
    Math.max(a.lineRange[1], b.lineRange[1]),
  ];

  // Collect unique domains
  const domains = new Set<ReviewDomain>();
  domains.add(a.domain);
  domains.add(b.domain);

  // Pick the best suggestion (longest, or either if one is undefined)
  const suggestion =
    a.suggestion && b.suggestion
      ? a.suggestion.length >= b.suggestion.length
        ? a.suggestion
        : b.suggestion
      : (a.suggestion ?? b.suggestion);

  // Build title with domain info — strip existing domain prefix to prevent nesting
  const primaryFinding = SEVERITY_RANK[a.severity] >= SEVERITY_RANK[b.severity] ? a : b;
  const domainList = [...domains].sort().join(', ');
  const cleanTitle = primaryFinding.title.replace(/^\[.*?\]\s*/, '');
  const title = `[${domainList}] ${cleanTitle}`;

  const merged: ReviewFinding = {
    id: primaryFinding.id,
    file: a.file, // same file for all merged findings
    lineRange,
    domain: primaryFinding.domain,
    severity: highestSeverity,
    title,
    rationale: longestRationale,
    evidence: [...evidenceSet],
    validatedBy: highestValidatedBy,
  };

  if (suggestion !== undefined) {
    merged.suggestion = suggestion;
  }

  return merged;
}

/**
 * Deduplicate and merge overlapping findings.
 *
 * Groups findings by file, then merges findings with overlapping line ranges
 * (within `lineGap` lines of each other). Merged findings keep the highest
 * severity, combine evidence, preserve the strongest rationale, and note
 * all contributing domains in the title.
 */
export function deduplicateFindings(options: DeduplicateFindingsOptions): ReviewFinding[] {
  const { findings, lineGap = 3 } = options;

  if (findings.length === 0) return [];

  // Group by file
  const byFile = new Map<string, ReviewFinding[]>();
  for (const f of findings) {
    const existing = byFile.get(f.file);
    if (existing) {
      existing.push(f);
    } else {
      byFile.set(f.file, [f]);
    }
  }

  const result: ReviewFinding[] = [];

  for (const [, fileFindings] of byFile) {
    // Sort by start line for consistent merging
    const sorted = [...fileFindings].sort((a, b) => a.lineRange[0] - b.lineRange[0]);

    // Greedy merge: walk through sorted findings, merge overlapping clusters
    const clusters: ReviewFinding[] = [];
    let current = sorted[0]!;

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i]!;
      if (rangesOverlap(current.lineRange, next.lineRange, lineGap)) {
        current = mergeFindings(current, next);
      } else {
        clusters.push(current);
        current = next;
      }
    }
    clusters.push(current);

    result.push(...clusters);
  }

  return result;
}
