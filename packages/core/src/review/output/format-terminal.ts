import type { ReviewFinding, ReviewStrength, FindingSeverity } from '../types';
import { determineAssessment } from './assessment';

/**
 * Severity display labels and ordering (highest first).
 */
const SEVERITY_ORDER: FindingSeverity[] = ['critical', 'important', 'suggestion'];
const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: 'Critical',
  important: 'Important',
  suggestion: 'Suggestion',
};

/**
 * Format a single finding as a terminal text block.
 */
export function formatFindingBlock(finding: ReviewFinding): string {
  const lines: string[] = [];
  const location = `${finding.file}:L${finding.lineRange[0]}-${finding.lineRange[1]}`;

  lines.push(`  [${finding.domain}] ${finding.title}`);
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

  return sections.join('\n');
}
