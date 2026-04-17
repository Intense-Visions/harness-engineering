import type { ReviewFinding, ReviewStrength, EvidenceCoverageReport } from '../types';
import { determineAssessment } from './assessment';
import { SEVERITY_ORDER, SEVERITY_LABELS } from '../constants';

/**
 * Format a single finding as a terminal text block.
 */
export function formatFindingBlock(finding: ReviewFinding): string {
  const lines: string[] = [];
  const location = `${finding.file}:L${finding.lineRange[0]}-${finding.lineRange[1]}`;

  const trustBadge = finding.trustScore != null ? ` [${finding.trustScore}%]` : '';
  lines.push(`  [${finding.domain}] ${finding.title}${trustBadge}`);
  lines.push(`    Location: ${location}`);
  lines.push(`    Rationale: ${finding.rationale}`);

  if (finding.suggestion) {
    lines.push(`    Suggestion: ${finding.suggestion}`);
  }

  return lines.join('\n');
}

/**
 * Format the full terminal output in Strengths / Issues / Assessment format.
 */
export function formatTerminalOutput(options: {
  findings: ReviewFinding[];
  strengths: ReviewStrength[];
  evidenceCoverage?: EvidenceCoverageReport;
}): string {
  const { findings, strengths } = options;
  const sections: string[] = [];

  // --- Strengths ---
  sections.push('## Strengths\n');
  if (strengths.length === 0) {
    sections.push('  No specific strengths noted.\n');
  } else {
    for (const s of strengths) {
      const prefix = s.file ? `${s.file}: ` : '';
      sections.push(`  + ${prefix}${s.description}`);
    }
    sections.push('');
  }

  // --- Issues ---
  sections.push('## Issues\n');

  let hasIssues = false;
  for (const severity of SEVERITY_ORDER) {
    const group = findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;

    hasIssues = true;
    sections.push(`### ${SEVERITY_LABELS[severity]} (${group.length})\n`);
    for (const finding of group) {
      sections.push(formatFindingBlock(finding));
      sections.push('');
    }
  }

  if (!hasIssues) {
    sections.push('  No issues found.\n');
  }

  // --- Assessment ---
  const assessment = determineAssessment(findings);
  const assessmentLabel =
    assessment === 'approve' ? 'Approve' : assessment === 'comment' ? 'Comment' : 'Request Changes';

  sections.push(`## Assessment: ${assessmentLabel}\n`);

  const issueCount = findings.length;
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const importantCount = findings.filter((f) => f.severity === 'important').length;
  const suggestionCount = findings.filter((f) => f.severity === 'suggestion').length;

  if (issueCount === 0) {
    sections.push('  No issues found. The changes look good.');
  } else {
    const parts: string[] = [];
    if (criticalCount > 0) parts.push(`${criticalCount} critical`);
    if (importantCount > 0) parts.push(`${importantCount} important`);
    if (suggestionCount > 0) parts.push(`${suggestionCount} suggestion(s)`);
    sections.push(`  Found ${issueCount} issue(s): ${parts.join(', ')}.`);
  }

  // --- Evidence Coverage ---
  if (options.evidenceCoverage) {
    const ec = options.evidenceCoverage;
    sections.push('');
    sections.push('## Evidence Coverage\n');
    sections.push(`  Evidence entries: ${ec.totalEntries}`);
    sections.push(
      `  Findings with evidence: ${ec.findingsWithEvidence}/${ec.findingsWithEvidence + ec.uncitedCount}`
    );
    sections.push(`  Uncited findings: ${ec.uncitedCount} (flagged as [UNVERIFIED])`);
    sections.push(`  Coverage: ${ec.coveragePercentage}%`);
  }

  return sections.join('\n');
}
