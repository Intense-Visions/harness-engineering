import type { AutoDecision, AutoDecisionSummary } from '@harness-engineering/types';
import { isUnsafeLogChar } from './decision-schema';

/** Pure. N = agreed + escalated (the audit ran); M = every judgment decision (SC9). */
export function summarizeAutoDecisions(entries: readonly AutoDecision[]): AutoDecisionSummary {
  const s: AutoDecisionSummary = {
    total: entries.length,
    byClass: { ceremony: 0, judgment: 0 },
    judgments: 0,
    audited: 0,
    agreed: 0,
    escalations: 0,
    unavailable: 0,
    off: 0,
    agreementRate: null,
  };
  for (const e of entries) {
    s.byClass[e.pauseClass] += 1;
    if (e.pauseClass !== 'judgment') continue;
    s.judgments += 1;
    const status = e.audit?.status;
    if (status === 'agreed') s.agreed += 1;
    else if (status === 'escalated') s.escalations += 1;
    else if (status === 'unavailable') s.unavailable += 1;
    else s.off += 1; // 'off': the audit did not run, so never counted as audited. (A judgment
    // with no audit never gets here: the strict schema rejects that line on read.)
  }
  s.audited = s.agreed + s.escalations;
  s.agreementRate = s.audited === 0 ? null : s.agreed / s.audited;
  return s;
}

export interface RenderAutoDecisionOptions {
  session?: string;
  /** Unreadable log lines skipped by the reader; reported, never counted. */
  invalidLines?: number;
  /** Append one line per judgment decision (harness autonomy log). */
  includeJudgments?: boolean;
}

/** One terminal line: control, newline and bidi characters become spaces. */
function oneLine(s: string): string {
  let out = '';
  for (const ch of s) out += isUnsafeLogChar(ch.codePointAt(0) ?? 0, false) ? ' ' : ch;
  return out.replace(/ {2,}/g, ' ').trim();
}

/**
 * End-of-run summary (SC11). Pure: terminal skills (Phase 3) print the returned lines. Returns []
 * when there is nothing to report, so a session with no auto-decisions prints nothing.
 */
export function renderAutoDecisionSummary(
  entries: readonly AutoDecision[],
  opts: RenderAutoDecisionOptions = {}
): string[] {
  const invalid = opts.invalidLines ?? 0;
  if (entries.length === 0 && invalid === 0) return [];
  const s = summarizeAutoDecisions(entries);
  const rate =
    s.agreementRate === null
      ? 'n/a (nothing audited)'
      : // Floor: 199/200 must not display as 100% while an escalation exists (review S5).
        `${Math.floor(s.agreementRate * 100)}% (${s.agreed}/${s.audited})`;
  const lines = [
    `Auto-decisions${opts.session !== undefined ? ` (session ${oneLine(opts.session)})` : ''}: ${s.total}`,
    `  by class: ceremony ${s.byClass.ceremony}, judgment ${s.byClass.judgment}`,
    `  audited ${s.audited}/${s.judgments} (unavailable ${s.unavailable}, off ${s.off})`,
    `  agreement rate: ${rate}`,
    `  escalations: ${s.escalations}`,
    // Statuses come from the agent's own self-audit; the log cannot verify them.
    '  Audit statuses are agent-reported.',
  ];
  if (invalid > 0) {
    lines.push(
      `  WARNING: ${invalid} unreadable log line(s) were skipped and are not counted; the log may have been edited or a write was cut short.`
    );
  }
  if (opts.includeJudgments) {
    for (const e of entries) {
      if (e.pauseClass !== 'judgment') continue;
      lines.push(
        `  - [${e.audit?.status ?? 'off'}] ${oneLine(e.skill)}/${oneLine(e.phase)}: ${oneLine(e.question)} -> ${oneLine(e.chosen)}`
      );
    }
  }
  return lines;
}
