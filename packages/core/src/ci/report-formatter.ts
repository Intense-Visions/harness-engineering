import type { CICheckReport, CICheckResult, GateMeasurement } from '@harness-engineering/types';
import { accumulateLoss, computeGateLosses } from '../gate-loss';

const STATUS_ICONS: Record<string, string> = {
  pass: '\u2705',
  fail: '\u274C',
  warn: '\u26A0\uFE0F',
  skip: '\u23ED\uFE0F',
};

function statusIcon(status: string): string {
  return STATUS_ICONS[status] ?? status;
}

function formatCheckRow(check: CICheckResult): string {
  const icon = statusIcon(check.status);
  const issueCount = check.issues.length;
  // An abstention and an operator `--skip` both carry `status: 'skip'`, so the
  // row has to say which one this is. Without it the table renders a gate that
  // could not run identically to a gate the operator chose to sit out (#2071).
  const status = check.skipReason ? 'skip (could not run)' : check.status;
  return `| ${icon} ${check.name} | ${status} | ${issueCount} | ${check.durationMs}ms |`;
}

/**
 * The "Could not run" panel.
 *
 * `formatIssueDetails` cannot carry this: it filters on `issues.length > 0` and
 * an abstention has zero issues by construction — it produced no findings
 * because it produced no verdict. So the markdown report named a non-zero
 * `abstained` count in the summary line and then gave the reader no way to tell
 * WHICH check it was or why, which is most of the value of the abstention
 * (#2071).
 */
function formatAbstentionDetails(checks: CICheckResult[]): string {
  const abstained = checks.filter((c) => c.skipReason !== undefined);
  if (abstained.length === 0) return '';

  const sections: string[] = ['', '### Could not run', ''];
  for (const check of abstained) {
    sections.push(`**${check.name}:** ${check.skipReason}`);
    sections.push('');
  }
  sections.push(
    'A check that could not run is not a check that passed. Fix the configuration above, ' +
      'or pass `--skip <check>` to acknowledge that the gate is not enforced.'
  );
  sections.push('');
  return sections.join('\n');
}

function formatIssueDetails(checks: CICheckResult[]): string {
  const checksWithIssues = checks.filter((c) => c.issues.length > 0);
  if (checksWithIssues.length === 0) return '';

  const sections: string[] = ['', '### Details', ''];
  for (const check of checksWithIssues) {
    sections.push(`**${check.name}:**`);
    for (const issue of check.issues) {
      const prefix = issue.severity === 'error' ? '\u274C' : '\u26A0\uFE0F';
      const location = issue.file
        ? issue.line
          ? ` (\`${issue.file}:${issue.line}\`)`
          : ` (\`${issue.file}\`)`
        : '';
      sections.push(`- ${prefix} ${issue.message}${location}`);
    }
    sections.push('');
  }
  return sections.join('\n');
}

/**
 * Render the continuous-loss panel beside the pass/fail views (Taguchi
 * continuous-loss, #1673). Emission only: this reads the `measurements` each
 * thresholded check emitted alongside its verdict and shows the distance-to-limit
 * the binary status discards. Returns '' when no check took any measurement, so
 * reports without thresholded metrics are unchanged.
 */
function formatLossPanel(checks: CICheckResult[]): string {
  const measurements: GateMeasurement[] = checks.flatMap((c) => c.measurements ?? []);
  if (measurements.length === 0) return '';

  const losses = computeGateLosses(measurements);
  const accumulated = accumulateLoss(losses);

  const sections: string[] = [
    '',
    '### Continuous loss (distance-to-threshold)',
    '',
    `Accumulated loss **${accumulated.totalLoss.toFixed(3)}** across **${accumulated.count}** measurement(s), mean **${accumulated.meanLoss.toFixed(3)}**. Loss is low while comfortably passing and rises quadratically toward each threshold — a leading indicator the pass/fail verdict discards.`,
    '',
    '| Gate | Measured | Target | Margin | Loss |',
    '|------|----------|--------|--------|------|',
  ];
  for (const l of losses) {
    const unit = l.unit ?? '';
    const marginSign = l.margin >= 0 ? '+' : '';
    sections.push(
      `| ${l.gate} | ${l.measured}${unit} | ${l.target}${unit} | ${marginSign}${l.margin}${unit} | ${l.loss.toFixed(3)} |`
    );
  }
  sections.push('');
  return sections.join('\n');
}

/**
 * Format a CI check report as GitHub-flavored markdown.
 * Produces a summary table with per-check status, issue counts,
 * and detailed issue listings for checks that have findings.
 */
export function formatCIReportAsMarkdown(report: CICheckReport): string {
  const { summary, checks } = report;

  const header =
    report.exitCode === 0
      ? '## \u2705 Harness CI — All Checks Passed'
      : '## \u274C Harness CI — Checks Failed';

  const summaryLine =
    `**${summary.passed}** passed, **${summary.failed}** failed, ` +
    `**${summary.warnings}** warnings, **${summary.skipped}** skipped` +
    // Surface the abstentions inside the skipped count: those are gates that
    // could not run, not gates the operator chose to sit out (#2071).
    (summary.abstained > 0 ? ` (**${summary.abstained}** could not run)` : '');

  const table = [
    '',
    '| Check | Status | Issues | Duration |',
    '|-------|--------|--------|----------|',
    ...checks.map(formatCheckRow),
    '',
  ].join('\n');

  const abstentions = formatAbstentionDetails(checks);
  const details = formatIssueDetails(checks);
  const lossPanel = formatLossPanel(checks);

  const footer = `\n---\n*Generated by [harness ci notify](https://github.com/Intense-Visions/harness-engineering) at ${report.timestamp}*`;

  // Abstentions come before the findings panel: a gate that did not run changes
  // how every other number in this report should be read.
  return [header, '', summaryLine, table, abstentions, details, lossPanel, footer].join('\n');
}
