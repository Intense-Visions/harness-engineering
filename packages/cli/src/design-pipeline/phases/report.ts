/**
 * Phase 6: REPORT — compute verdict + aggregate summary.
 *
 * Verdict:
 *   pass — zero findings/suggestions/bootstrapped AND every verifier ran
 *   warn — warn-severity OR craft suggestions OR bootstrapped any input
 *   fail — any error-severity finding remains after FIX, OR any verifier
 *          abstained (see `degradedBy`)
 *
 * The verdict is resolved FROM the context in one pass rather than computed
 * alongside it. Before #2273 it was derived from the finding severities alone,
 * so `verifiersFailed` — the record of a verifier that examined nothing — could
 * not influence it, and the pipeline reported `pass` over a run in which one of
 * its four verifiers saw no part of the design surface. `harness
 * design-pipeline` exits on the verdict, so that was a gate that could not
 * fail. Same bug class as `harness ci check` #2071 (fixed in #2207): a summary
 * field computed independently of the thing it summarises.
 *
 * Source: docs/changes/design-pipeline/orchestrator/proposal.md
 *   (Technical Design → Phase 6: REPORT).
 */

import type { DesignPipelineContext, Verdict } from '../context.js';

export interface ReportInput {
  context: DesignPipelineContext;
}

export function runReport(input: ReportInput): void {
  const { context } = input;

  const bySeverity: Record<'error' | 'warn' | 'info', number> = { error: 0, warn: 0, info: 0 };
  const byCode: Record<string, number> = {};

  for (const f of context.driftFindings) {
    bySeverity[f.severity]++;
    byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  }
  for (const f of context.auditFindings.anatomy) {
    bySeverity[f.severity]++;
    byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  }
  for (const f of context.auditFindings.brand) {
    bySeverity[f.severity]++;
    byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  }
  // Craft findings use tier; we don't roll into bySeverity here — they're
  // surfaced separately as ceiling-layer suggestions.

  const totalFindings =
    context.driftFindings.length +
    context.auditFindings.anatomy.length +
    context.auditFindings.brand.length;

  context.summary.bySeverity = bySeverity;
  context.summary.byCode = byCode;
  context.summary.totalFindings = totalFindings;
  context.summary.fixesApplied = context.fixesApplied.filter((o) => o.kind === 'applied').length;
  // Counted from the list it counts, rather than stored beside it by FILL, so
  // the two cannot drift apart (#2273).
  context.craftSuggestions = context.craftFindings.length;

  const resolution = resolveVerdict(context);
  context.verdict = resolution.verdict;
  context.degradedBy = resolution.degradedBy;
}

/**
 * Resolve the verdict from the context, returning the abstention set it was
 * resolved against in the same value. Nothing else in the pipeline writes
 * `verdict` or `degradedBy`, so the pair is always internally consistent: a
 * `degradedBy` entry forces a non-`pass` verdict by construction rather than by
 * a separate agreement check that someone has to remember to run.
 *
 * Mirrors `harness check-design`, whose `valid` is
 * `bySeverity.error === 0 && verifiersFailed.length === 0` — an abstention is
 * not a pass there either.
 */
function resolveVerdict(context: DesignPipelineContext): {
  verdict: Verdict;
  degradedBy: string[];
} {
  // A projection, not a parallel tally: every abstention any phase recorded
  // appears here, including the same verifier twice (detect-drift abstains in
  // DETECT and again inside the FIX loop) and a verifier that also sits in
  // `verifiersRun` because an earlier invocation succeeded.
  const degradedBy = context.verifiersFailed.map((f) => f.name);
  const { bySeverity } = context.summary;
  const anyBootstrap = Object.values(context.bootstrapped).some(Boolean);

  // An error-severity finding is the loudest, most concrete signal, so it wins
  // the verdict — but `degradedBy` is still carried, because "we also could not
  // see part of the surface" remains true and a reader needs it.
  if (bySeverity.error > 0) return { verdict: 'fail', degradedBy };

  // A verifier that could not run did not pass. Downgrading this to `warn`
  // would leave the gate green, because `harness design-pipeline` exits
  // non-zero only on `fail`.
  if (degradedBy.length > 0) return { verdict: 'fail', degradedBy };

  if (bySeverity.warn > 0 || context.craftSuggestions > 0 || anyBootstrap) {
    return { verdict: 'warn', degradedBy };
  }
  return { verdict: 'pass', degradedBy };
}
