import type { Issue, WorkflowConfig, WorkflowExecutionPlan } from '@harness-engineering/types';

/**
 * split-routing D5/D13 — the doubly-opt-in gate as a PURE predicate.
 *
 * Selects a `WorkflowExecutionPlan` for `issue` iff `config.workflows` declares
 * a matching decl with `stages.length >= 2`. Match grain (v1): an
 * `identifierPrefix` and/or `labels`; both, when declared, must hold. The FIRST
 * matching decl wins.
 *
 * D13: a matching 1-stage decl returns `undefined` — the unit takes the
 * single-agent path (a 1-stage "workflow" is not staged). A 0-stage decl never
 * reaches here (rejected at config validation).
 *
 * SC4 — this predicate has ZERO side effects: it never touches the workspace,
 * claims, routes, logs, or mutates state. When it returns `undefined`
 * `dispatchIssue` falls through to the byte-identical single-agent path. Keep it
 * cheap and pure so calling it on every dispatch cannot change non-workflow
 * behavior.
 */
export function workflowFor(
  issue: Issue,
  config: WorkflowConfig
): WorkflowExecutionPlan | undefined {
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
    return { coherenceUnit: issue.id, stages: d.stages };
  }
  return undefined;
}
