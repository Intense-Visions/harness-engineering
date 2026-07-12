import type { Issue, WorkflowConfig, WorkflowExecutionPlan } from '@harness-engineering/types';

/**
 * split-routing D5/D12/D13 — the result of the doubly-opt-in match.
 *
 * `workflowFor` is the SINGLE matching authority: it returns BOTH the execution
 * `plan` AND the matched decl's optional `stageDeadlineMs` (D12) so `dispatchIssue`
 * never re-runs the prefix+labels+`>= 2` predicate to recover the deadline. One
 * match, one source of truth — no drift between the predicate and a second matcher.
 */
export interface WorkflowMatch {
  /** The execution plan for the matched >= 2-stage decl. */
  plan: WorkflowExecutionPlan;
  /** The matched decl's per-stage deadline override (D12), if declared. */
  stageDeadlineMs?: number;
}

/**
 * split-routing D5/D13 — the doubly-opt-in gate as a PURE matcher.
 *
 * Selects a `WorkflowMatch` for `issue` iff `config.workflows` declares a
 * matching decl with `stages.length >= 2`. Match grain (v1): an
 * `identifierPrefix` and/or `labels`; both, when declared, must hold. The FIRST
 * matching decl wins. The returned `WorkflowMatch` carries the matched decl's
 * `stageDeadlineMs` (D12) so the caller reads it from HERE rather than
 * re-matching — this function is the single match authority.
 *
 * D13: a matching 1-stage decl returns `undefined` — the unit takes the
 * single-agent path (a 1-stage "workflow" is not staged). A 0-stage decl never
 * reaches here (rejected at config validation).
 *
 * SC4 — this matcher has ZERO side effects: it never touches the workspace,
 * claims, routes, logs, or mutates state. When it returns `undefined`
 * `dispatchIssue` falls through to the byte-identical single-agent path. Keep it
 * cheap and pure so calling it on every dispatch cannot change non-workflow
 * behavior.
 */
export function workflowFor(issue: Issue, config: WorkflowConfig): WorkflowMatch | undefined {
  const decls = config.workflows;
  if (!decls || decls.length === 0) return undefined;
  for (const d of decls) {
    const prefixOk =
      d.match.identifierPrefix === undefined ||
      issue.identifier.startsWith(d.match.identifierPrefix);
    const labelsOk =
      d.match.labels === undefined || d.match.labels.every((l) => issue.labels.includes(l));
    if (!prefixOk || !labelsOk) continue;
    // D13: a matched 1-stage (or empty, though validation forbids that) decl
    // falls back to single dispatch — the `>= 2` gate is enforced HERE, not in
    // the schema (a 1-stage decl is legal config).
    if (d.stages.length < 2) return undefined;
    return {
      plan: { coherenceUnit: issue.id, stages: d.stages },
      ...(d.stageDeadlineMs !== undefined ? { stageDeadlineMs: d.stageDeadlineMs } : {}),
    };
  }
  return undefined;
}
