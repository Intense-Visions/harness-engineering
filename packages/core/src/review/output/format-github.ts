import type { ReviewFinding, ReviewStrength, FindingSeverity, GitHubInlineComment } from '../types';
import { determineAssessment } from './assessment';

const SEVERITY_ORDER: FindingSeverity[] = ['critical', 'important', 'suggestion'];
const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: 'Critical',
  important: 'Important',
  suggestion: 'Suggestion',
};

const SMALL_SUGGESTION_LINE_LIMIT = 10;

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
  const header = `${severityBadge} [${finding.domain}] ${finding.title}`;

  let body: string;

  if (isSmallSuggestion(finding.suggestion)) {
    body = [header, '', finding.rationale, '', '```suggestion', finding.suggestion!, '```'].join(
      '\n'
    );
  } else {
    const parts = [header, '', `**Rationale:** ${finding.rationale}`];

    if (finding.suggestion) {
      parts.push('', `**Suggested approach:** ${finding.suggestion}`);
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
      sections.push(`- ${prefix}${s.description}`);
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
      sections.push(`- **${finding.title}** at ${location}`);
      sections.push(`  ${finding.rationale}`);
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

  return sections.join('\n');
}
