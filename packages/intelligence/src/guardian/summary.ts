/**
 * Deterministic, LLM-free projections of guardian diff-coverage records into
 * human/consumer-facing text. Kept pure so both `outcome_eval` (rationale
 * annotation) and `pre-merge-brief` (review section) surface the SAME signal.
 */

import type { GuardianAnalysis, GuardianFileCoverage } from './types.js';

/** A guardian record "flags" a change when it failed or is error-severity. */
export function guardianFlags(a: GuardianAnalysis): boolean {
  return a.verdict === 'fail' || a.severity === 'error';
}

/** Total distinct files carrying uncovered diff lines across all records. */
function totalUncoveredFiles(analyses: GuardianAnalysis[]): number {
  const files = new Set<string>();
  for (const a of analyses) {
    for (const f of a.files) {
      if (f.uncoveredLines.length > 0 || (f.uncoveredRegions?.length ?? 0) > 0) files.add(f.file);
    }
  }
  return files.size;
}

/** Worst (most negative) coverage delta across records, or null when none. */
function worstCoverageDelta(analyses: GuardianAnalysis[]): number | null {
  if (analyses.length === 0) return null;
  return Math.min(...analyses.map((a) => a.coverageDelta));
}

/**
 * One-line advisory summary of the guardian signal, or `null` when there is no
 * guardian input at all (the "no signal" case — consumers must treat this as
 * byte-identical to having no guardian wiring).
 */
export function summarizeGuardian(analyses: GuardianAnalysis[]): string | null {
  if (analyses.length === 0) return null;
  const flagged = analyses.some(guardianFlags);
  const verdict = flagged ? 'FAIL' : 'PASS';
  const fileCount = totalUncoveredFiles(analyses);
  const delta = worstCoverageDelta(analyses);
  const deltaStr = delta === null ? 'n/a' : `${delta > 0 ? '+' : ''}${delta}%`;
  return (
    `Guardian diff-coverage: ${verdict} — ${analyses.length} record(s), ` +
    `${fileCount} file(s) with uncovered diff lines, worst coverage delta ${deltaStr}.`
  );
}

/** Render a single file's uncovered lines/regions as a compact string. */
function fileDetail(f: GuardianFileCoverage): string {
  const parts: string[] = [];
  if (f.uncoveredLines.length > 0) parts.push(`lines ${f.uncoveredLines.join(', ')}`);
  for (const [start, end] of f.uncoveredRegions ?? []) parts.push(`${start}-${end}`);
  const detail = parts.length > 0 ? parts.join('; ') : 'uncovered';
  return `${f.file}: ${detail}`;
}

/**
 * Per-file detail lines suitable for a review brief, most impactful producers
 * first is not attempted — files are listed in record/declaration order.
 */
export function guardianFileLines(analyses: GuardianAnalysis[]): string[] {
  const lines: string[] = [];
  for (const a of analyses) {
    for (const f of a.files) {
      if (f.uncoveredLines.length > 0 || (f.uncoveredRegions?.length ?? 0) > 0) {
        lines.push(fileDetail(f));
      }
    }
  }
  return lines;
}
