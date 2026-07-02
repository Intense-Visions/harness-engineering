import type { CiReviewResult, DiffInfo } from '@harness-engineering/core';
import type { SignalResult } from '@harness-engineering/signals';
import type { OutcomeVerdict } from '@harness-engineering/intelligence';

/** Hidden HTML marker used to find + upsert the sticky comment. */
export const BRIEF_MARKER = '<!-- harness:pre-merge-brief -->';

/** All inputs are OPTIONAL; a missing input degrades to an "unavailable" line. */
export interface BriefInputs {
  /** Diff summary; undefined when the range produced no diff / could not resolve. */
  diff?: DiffInfo | undefined;
  /** review-ci JSON verdict, from `--from`; undefined when absent. */
  review?: CiReviewResult['verdict'] | undefined;
  /** Fresh signal snapshot; empty/undefined when signals could not be gathered. */
  signals?: SignalResult[] | undefined;
  /** Outcome-eval verdict for the head commit; undefined = "not yet evaluated". */
  outcome?: OutcomeVerdict | undefined;
}

/** Standard degradation line for an input that could not be gathered. */
const UNAVAILABLE = '> _unavailable / not configured._';

/**
 * Render the diff-summary section. Degrades to an "unavailable" line when no
 * diff could be resolved (empty range, git failure, etc.).
 */
function renderDiffSummary(diff?: DiffInfo): string[] {
  const out: string[] = ['## Diff summary', ''];
  if (!diff) {
    out.push(UNAVAILABLE);
    return out;
  }
  out.push(
    `**Files changed:** ${diff.changedFiles.length}` +
      ` (new: ${diff.newFiles.length}, deleted: ${diff.deletedFiles.length})` +
      `  •  **Diff lines:** ${diff.totalDiffLines}`
  );
  return out;
}

/** A single validated finding as it appears on the verdict. */
type ReviewFindingView = NonNullable<CiReviewResult['verdict']['findings']>[number];

/** Render a finding as a one-line Markdown bullet: severity, location, title. */
function findingLine(f: ReviewFindingView): string {
  const loc = f.lineRange ? `${f.file}:${f.lineRange[0]}` : f.file;
  return `- \`${f.severity}\` **${loc}** — ${f.title}`;
}

/**
 * Render the review-verdict section. Degrades to an "unavailable" line when no
 * `--from` verdict was supplied.
 */
function renderReviewVerdict(verdict?: CiReviewResult['verdict']): string[] {
  const out: string[] = ['## Review verdict', ''];
  if (!verdict) {
    out.push(UNAVAILABLE);
    return out;
  }
  const findings = verdict.findings ?? [];
  const blocking = verdict.blockingFindings ?? [];
  out.push(
    `**Assessment:** \`${verdict.assessment}\`  •  **Runner:** \`${verdict.runner}\`` +
      `  •  **Findings:** ${findings.length} (blocking: ${blocking.length})`
  );
  if (verdict.skipped) {
    out.push('', `> ⚠️ ${verdict.skipReason ?? 'A review tier was skipped.'}`);
  }
  if (blocking.length) out.push('', '### Blocking', ...blocking.map(findingLine));
  const nonBlocking = findings.filter((f) => !blocking.some((b) => b.id === f.id));
  if (nonBlocking.length) out.push('', '### Other findings', ...nonBlocking.map(findingLine));
  return out;
}

/**
 * Pure Markdown render (no I/O, no process.exit). Assembles the brief section by
 * section, in the order required by the spec: header, diff summary, review
 * verdict, Signal status, outcome-eval, "worth your eyes".
 */
export function buildBriefBody(inputs: BriefInputs): string {
  const lines: string[] = [
    BRIEF_MARKER,
    '# 🧭 Pre-merge brief',
    '',
    ...renderDiffSummary(inputs.diff),
    '',
    ...renderReviewVerdict(inputs.review),
  ];
  return lines.join('\n');
}
