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

/** Pick the longer of two optional strings, or whichever is defined. */
function pickLongest(a: string | undefined, b: string | undefined): string | undefined {
  if (a && b) return a.length >= b.length ? a : b;
  return a ?? b;
}

/** Build a merged title from domains and the primary finding. */
function buildMergedTitle(
  a: ReviewFinding,
  b: ReviewFinding,
  domains: Set<ReviewDomain>
): { title: string; primaryFinding: ReviewFinding } {
  const primaryFinding = SEVERITY_RANK[a.severity] >= SEVERITY_RANK[b.severity] ? a : b;
  const domainList = [...domains].sort().join(', ');
  const cleanTitle = primaryFinding.title.replace(/^\[.*?\]\s*/, '');
  return { title: `[${domainList}] ${cleanTitle}`, primaryFinding };
}

function setIfDefined<T extends ReviewFinding, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined
): void {
  if (value !== undefined) target[key] = value;
}

/** Merge security-specific optional fields onto the merged finding. */
function mergeSecurityFields(
  merged: ReviewFinding,
  primary: ReviewFinding,
  a: ReviewFinding,
  b: ReviewFinding
): void {
  setIfDefined(merged, 'cweId', primary.cweId ?? a.cweId ?? b.cweId);
  setIfDefined(
    merged,
    'owaspCategory',
    primary.owaspCategory ?? a.owaspCategory ?? b.owaspCategory
  );
  setIfDefined(merged, 'confidence', primary.confidence ?? a.confidence ?? b.confidence);
  setIfDefined(merged, 'remediation', pickLongest(a.remediation, b.remediation));

  const mergedRefs = [...new Set([...(a.references ?? []), ...(b.references ?? [])])];
  if (mergedRefs.length > 0) merged.references = mergedRefs;
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
function pickHigherRank<T extends string>(aVal: T, bVal: T, rankMap: Record<string, number>): T {
  return (rankMap[aVal] ?? 0) >= (rankMap[bVal] ?? 0) ? aVal : bVal;
}

function mergedLineRange(a: [number, number], b: [number, number]): [number, number] {
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
}

function mergeTrustScore(a: ReviewFinding, b: ReviewFinding): number | undefined {
  const max = Math.max(a.trustScore ?? 0, b.trustScore ?? 0);
  return max > 0 ? max : undefined;
}

function mergeFindings(a: ReviewFinding, b: ReviewFinding): ReviewFinding {
  const domains = new Set<ReviewDomain>([a.domain, b.domain]);
  const { title, primaryFinding } = buildMergedTitle(a, b, domains);

  const merged: ReviewFinding = {
    id: primaryFinding.id,
    file: a.file,
    lineRange: mergedLineRange(a.lineRange, b.lineRange),
    domain: primaryFinding.domain,
    severity: pickHigherRank(a.severity, b.severity, SEVERITY_RANK),
    title,
    rationale: a.rationale.length >= b.rationale.length ? a.rationale : b.rationale,
    evidence: [...new Set([...a.evidence, ...b.evidence])],
    validatedBy: pickHigherRank(a.validatedBy, b.validatedBy, VALIDATED_BY_RANK),
  };

  setIfDefined(merged, 'suggestion', pickLongest(a.suggestion, b.suggestion));
  setIfDefined(merged, 'trustScore', mergeTrustScore(a, b));
  mergeSecurityFields(merged, primaryFinding, a, b);

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
