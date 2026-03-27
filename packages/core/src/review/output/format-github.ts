import type {
  ReviewFinding,
  ReviewStrength,
  GitHubInlineComment,
  EvidenceCoverageReport,
} from '../types';
import { determineAssessment } from './assessment';
import { SEVERITY_ORDER, SEVERITY_LABELS } from '../constants';

const SMALL_SUGGESTION_LINE_LIMIT = 10;

/**
 * Sanitize text for safe inclusion in GitHub markdown comments.
 * Escapes characters that could be used for markdown/HTML injection (CWE-79).
 */
function sanitizeMarkdown(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Check if a suggestion is "small" (under 10 lines) and suitable
 * for a committable GitHub suggestion block.
 */
export function isSmallSuggestion(suggestion: string | undefined): boolean {
  if (!suggestion) return false;
  const lineCount = suggestion.split('\n').length;
  return lineCount < SMALL_SUGGESTION_LINE_LIMIT;
}

/**
 * Format a single finding as a GitHub inline comment.
 *
 * - Small suggestions (< 10 lines): committable suggestion block
 * - Large suggestions or no suggestion: description + rationale
 */
export function formatGitHubComment(finding: ReviewFinding): GitHubInlineComment {
  const severityBadge = `**${finding.severity.toUpperCase()}**`;
  const header = `${severityBadge} [${finding.domain}] ${sanitizeMarkdown(finding.title)}`;

  let body: string;

  if (isSmallSuggestion(finding.suggestion)) {
    body = [
      header,
      '',
      sanitizeMarkdown(finding.rationale),
      '',
      '```suggestion',
      finding.suggestion!,
      '```',
    ].join('\n');
  } else {
    const parts = [header, '', `**Rationale:** ${sanitizeMarkdown(finding.rationale)}`];

    if (finding.suggestion) {
      parts.push('', `**Suggested approach:** ${sanitizeMarkdown(finding.suggestion)}`);
    }

    body = parts.join('\n');
  }

  return {
    path: finding.file,
    line: finding.lineRange[1], // Comment on end line of range
    side: 'RIGHT',
    body,
  };
}

/**
 * Format the review summary for a GitHub PR review body.
 * Uses markdown formatting (## headers, bullet lists).
 */
export function formatGitHubSummary(options: {
  findings: ReviewFinding[];
  strengths: ReviewStrength[];
  evidenceCoverage?: EvidenceCoverageReport;
}): string {
  const { findings, strengths } = options;
  const sections: string[] = [];

  // --- Strengths ---
  sections.push('## Strengths\n');
  if (strengths.length === 0) {
    sections.push('No specific strengths noted.\n');
  } else {
    for (const s of strengths) {
      const prefix = s.file ? `**${s.file}:** ` : '';
      sections.push(`- ${prefix}${sanitizeMarkdown(s.description)}`);
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
      const location = `\`${finding.file}:L${finding.lineRange[0]}-${finding.lineRange[1]}\``;
      sections.push(`- **${sanitizeMarkdown(finding.title)}** at ${location}`);
      sections.push(`  ${sanitizeMarkdown(finding.rationale)}`);
      sections.push('');
    }
  }

  if (!hasIssues) {
    sections.push('No issues found.\n');
  }

  // --- Assessment ---
  const assessment = determineAssessment(findings);
  const assessmentLabel =
    assessment === 'approve' ? 'Approve' : assessment === 'comment' ? 'Comment' : 'Request Changes';

  sections.push(`## Assessment: ${assessmentLabel}`);

  // --- Evidence Coverage ---
  if (options.evidenceCoverage) {
    const ec = options.evidenceCoverage;
    sections.push('');
    sections.push('## Evidence Coverage\n');
    sections.push(`- Evidence entries: ${ec.totalEntries}`);
    sections.push(
      `- Findings with evidence: ${ec.findingsWithEvidence}/${ec.findingsWithEvidence + ec.uncitedCount}`
    );
    sections.push(`- Uncited findings: ${ec.uncitedCount} (flagged as \\[UNVERIFIED\\])`);
    sections.push(`- Coverage: ${ec.coveragePercentage}%`);
  }

  return sections.join('\n');
}
