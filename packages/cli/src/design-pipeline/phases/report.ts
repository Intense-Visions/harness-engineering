/**
 * Phase 6: REPORT — compute verdict + aggregate summary.
 *
 * Verdict:
 *   pass — zero findings/suggestions/bootstrapped
 *   warn — warn-severity OR craft suggestions OR bootstrapped any input
 *   fail — any error-severity finding remains after FIX
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

  const appliedFixCount = context.fixesApplied.filter((o) => o.kind === 'applied').length;
  const anyBootstrap = Object.values(context.bootstrapped).some(Boolean);

  context.summary.bySeverity = bySeverity;
  context.summary.byCode = byCode;
  context.summary.totalFindings = totalFindings;
  context.summary.fixesApplied = appliedFixCount;

  context.verdict = computeVerdict(bySeverity, context.craftSuggestions, anyBootstrap);
}

function computeVerdict(
  bySeverity: Record<'error' | 'warn' | 'info', number>,
  craftSuggestions: number,
  anyBootstrap: boolean
): Verdict {
  if (bySeverity.error > 0) return 'fail';
  if (bySeverity.warn > 0 || craftSuggestions > 0 || anyBootstrap) return 'warn';
  return 'pass';
}
