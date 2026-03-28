import type { SessionEntry } from '@harness-engineering/types';
import type { ReviewFinding } from './types';
import type { EvidenceCoverageReport } from './types/mechanical';

/**
 * Parse file:line references from an evidence entry's content.
 * Matches patterns like:
 *   - src/auth.ts:42
 *   - src/auth.ts:40-45
 *   - src/auth.ts (file-only, no line)
 */
interface EvidenceRef {
  file: string;
  lineStart?: number;
  lineEnd?: number;
}

const FILE_LINE_RANGE_PATTERN = /^([\w./@-]+\.\w+):(\d+)-(\d+)/;
const FILE_LINE_PATTERN = /^([\w./@-]+\.\w+):(\d+)/;
const FILE_ONLY_PATTERN = /^([\w./@-]+\.\w+)\s/;

function parseEvidenceRef(content: string): EvidenceRef | null {
  const trimmed = content.trim();

  // Try file:start-end
  const rangeMatch = trimmed.match(FILE_LINE_RANGE_PATTERN);
  if (rangeMatch) {
    return {
      file: rangeMatch[1]!,
      lineStart: parseInt(rangeMatch[2]!, 10),
      lineEnd: parseInt(rangeMatch[3]!, 10),
    };
  }

  // Try file:line
  const lineMatch = trimmed.match(FILE_LINE_PATTERN);
  if (lineMatch) {
    return {
      file: lineMatch[1]!,
      lineStart: parseInt(lineMatch[2]!, 10),
    };
  }

  // Try file-only (file path followed by whitespace)
  const fileMatch = trimmed.match(FILE_ONLY_PATTERN);
  if (fileMatch) {
    return { file: fileMatch[1]! };
  }

  return null;
}

/**
 * Check whether an evidence reference matches a finding's file and line range.
 *
 * Matching rules:
 * - File paths must match exactly
 * - If evidence has a line number, it must fall within the finding's lineRange
 * - If evidence has a line range, the ranges must overlap
 * - If evidence has no line number (file-only), it matches any finding for that file
 */
function evidenceMatchesFinding(ref: EvidenceRef, finding: ReviewFinding): boolean {
  if (ref.file !== finding.file) return false;

  // File-only match: any finding in this file
  if (ref.lineStart === undefined) return true;

  const [findStart, findEnd] = finding.lineRange;

  if (ref.lineEnd !== undefined) {
    // Range overlap: ranges overlap if one starts before the other ends
    return ref.lineStart <= findEnd && ref.lineEnd >= findStart;
  }

  // Single line within finding range
  return ref.lineStart >= findStart && ref.lineStart <= findEnd;
}

/**
 * Check evidence coverage for a set of review findings against session evidence entries.
 *
 * For each finding, checks whether any active evidence entry references the same
 * file:line location. Findings without matching evidence are flagged as uncited.
 */
export function checkEvidenceCoverage(
  findings: ReviewFinding[],
  evidenceEntries: SessionEntry[]
): EvidenceCoverageReport {
  if (findings.length === 0) {
    return {
      totalEntries: evidenceEntries.filter((e) => e.status === 'active').length,
      findingsWithEvidence: 0,
      uncitedCount: 0,
      uncitedFindings: [],
      coveragePercentage: 100,
    };
  }

  // Filter to active evidence only
  const activeEvidence = evidenceEntries.filter((e) => e.status === 'active');

  // Parse all evidence references
  const evidenceRefs: EvidenceRef[] = [];
  for (const entry of activeEvidence) {
    const ref = parseEvidenceRef(entry.content);
    if (ref) evidenceRefs.push(ref);
  }

  let findingsWithEvidence = 0;
  const uncitedFindings: string[] = [];

  for (const finding of findings) {
    const hasEvidence = evidenceRefs.some((ref) => evidenceMatchesFinding(ref, finding));
    if (hasEvidence) {
      findingsWithEvidence++;
    } else {
      uncitedFindings.push(finding.title);
    }
  }

  const uncitedCount = findings.length - findingsWithEvidence;
  const coveragePercentage = Math.round((findingsWithEvidence / findings.length) * 100);

  return {
    totalEntries: activeEvidence.length,
    findingsWithEvidence,
    uncitedCount,
    uncitedFindings,
    coveragePercentage,
  };
}

/**
 * Tag uncited findings by prefixing their title with [UNVERIFIED].
 * Mutates the findings array in place and returns it.
 */
export function tagUncitedFindings(
  findings: ReviewFinding[],
  evidenceEntries: SessionEntry[]
): ReviewFinding[] {
  const activeEvidence = evidenceEntries.filter((e) => e.status === 'active');
  const evidenceRefs: EvidenceRef[] = [];
  for (const entry of activeEvidence) {
    const ref = parseEvidenceRef(entry.content);
    if (ref) evidenceRefs.push(ref);
  }

  for (const finding of findings) {
    const hasEvidence = evidenceRefs.some((ref) => evidenceMatchesFinding(ref, finding));
    if (!hasEvidence && !finding.title.startsWith('[UNVERIFIED]')) {
      finding.title = `[UNVERIFIED] ${finding.title}`;
    }
  }

  return findings;
}
