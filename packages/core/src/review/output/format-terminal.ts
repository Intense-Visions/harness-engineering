import type { ReviewFinding, ReviewStrength, EvidenceCoverageReport } from '../types';
import { determineAssessment } from './assessment';
import { SEVERITY_ORDER, SEVERITY_LABELS } from '../constants';
import type { DepthCalibration } from '../depth-calibrator';
import type { FindingIntegrityReport } from '../finding-integrity';

/** Format the confidence field consistently regardless of legacy/new shape. */
function formatConfidence(c: ReviewFinding['confidence']): string {
  if (c === undefined) return '';
  if (typeof c === 'number') return ` (conf ${c})`;
  return ` (conf ${c})`;
}

/**
 * Format a single finding as a terminal text block.
 */
export function formatFindingBlock(finding: ReviewFinding): string {
  const lines: string[] = [];
  const location = `${finding.file}:L${finding.lineRange[0]}-${finding.lineRange[1]}`;

  const trustBadge = finding.trustScore != null ? ` [${finding.trustScore}%]` : '';
  const subagentBadge =
    finding.subagent && finding.subagent !== finding.domain ? `:${finding.subagent}` : '';
  lines.push(
    `  [${finding.domain}${subagentBadge}] ${finding.title}${formatConfidence(finding.confidence)}${trustBadge}`
  );
  lines.push(`    Location: ${location}`);
  lines.push(`    Rationale: ${finding.rationale}`);

  if (finding.suggestion) {
    lines.push(`    Suggestion: ${finding.suggestion}`);
  }

  // Emission-invariant audit trail (#984). Only rendered when an invariant
  // altered this finding, so clean findings print exactly as before.
  for (const v of finding.integrityViolations ?? []) {
    lines.push(`    Integrity (${v.invariant}, ${v.action}): ${v.reason}`);
  }

  return lines.join('\n');
}

/**
 * Render the Phase 5.75 finding-integrity section (#984).
 *
 * Always prints the denominator. An `abstained` layer is labelled as such rather
 * than rendered as a clean pass — a gate that examined zero findings verified
 * nothing, and the output must not imply otherwise.
 */
export function formatIntegritySection(report: FindingIntegrityReport): string {
  const lines = ['## Finding Integrity\n'];

  if (report.abstained) {
    lines.push('  ABSTAINED — 0 findings examined; no invariant was verified.');
    return lines.join('\n');
  }

  lines.push(`  Findings examined: ${report.examined}`);
  lines.push(
    `  Vulnerability-class claims checked: ${report.vulnerabilityClaimsExamined}/${report.examined}`
  );
  lines.push(`  Confidence claims checked: ${report.confidenceClaimsExamined}/${report.examined}`);
  lines.push(
    `  Altered: ${report.altered} (${report.dropped} dropped, ${report.downgraded} downgraded, ${report.confidenceReconciled} confidence-reconciled)`
  );

  for (const v of report.violations) {
    lines.push(`  ! ${v.findingId} [${v.invariant} → ${v.action}]: ${v.reason}`);
  }

  return lines.join('\n');
}

/** Capitalize the first letter of a string. */
function titleCase(s: string): string {
  if (s.length === 0) return s;
  return s[0]!.toUpperCase() + s.slice(1);
}

/** Render the Phase 3.5 calibration header. */
export function formatDepthHeader(calibration: DepthCalibration): string {
  const overrideTag = calibration.overridden ? ' (override)' : '';
  const signals =
    calibration.riskSignals.length === 0 ? 'none' : calibration.riskSignals.join(', ');
  const activations =
    calibration.activations.size === 0 ? 'none' : [...calibration.activations].join(', ');
  return [
    `## Review Depth: ${titleCase(calibration.depth)}${overrideTag}`,
    `  Changed lines: ${calibration.changedLines}`,
    `  Risk signals: ${signals}`,
    `  Conditional subagents: ${activations}`,
    '',
  ].join('\n');
}

/**
 * Format the full terminal output in Strengths / Issues / Assessment format.
 */
export function formatTerminalOutput(options: {
  findings: ReviewFinding[];
  strengths: ReviewStrength[];
  evidenceCoverage?: EvidenceCoverageReport;
  depthCalibration?: DepthCalibration;
  integrityReport?: FindingIntegrityReport;
}): string {
  const { findings, strengths } = options;
  const sections: string[] = [];

  // --- Depth calibration (Phase 3.5) ---
  if (options.depthCalibration) {
    sections.push(formatDepthHeader(options.depthCalibration));
  }

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

  // --- Finding Integrity (Phase 5.75, #984) ---
  if (options.integrityReport) {
    sections.push('');
    sections.push(formatIntegritySection(options.integrityReport));
  }

  return sections.join('\n');
}
