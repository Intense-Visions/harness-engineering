---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

Staged local units now converge instead of looping. A staged workflow whose last stage routes to a local-endpoint backend (`local`/`pi`/`ollama`) previously marked itself "done" after every stage merely ran, then wiped its worktree at settle — destroying real-but-incomplete work before any retry, and, because the row never shipped a PR to reach `done`, re-dispatching forever.

The staged settle now reuses the single-dispatch enforced gate:

- **Real acceptance gate.** `settleWorkflowSuccess` routes a local last-stage unit through the same `runLocalWorkflowGate` (empty-diff → verify/acceptance → outcome-eval) the single-dispatch path uses — one convergence contract, not a diff-only heuristic. The #886 empty-diff halt is subsumed as step 0. A new optional `StagedWorkflowDecl.acceptance` shell command overrides the default `verify` mechanical step (exit 0 ⇒ pass; nothing project-specific is baked in).
- **Convergent retry.** On gate FAIL the workspace is preserved (no wipe, no `success → in_review`), the failure reason is threaded into the next prompt, and the unit re-dispatches through the same retry seam (lane `blocked`, so `blocked → claimed` re-claims). Work accumulates across preserved retries. Bounded by the new optional `agent.routing.maxLocalStageRetries` (default 5); on exhaustion the unit escalates to the `needs-human` terminal and the tick stops re-selecting it.
- **Deterministic ship.** On gate PASS the orchestrator commits the accumulated work, pushes an `orchestrator/<identifier>` branch, and opens a PR (`shipWorkspace`), then takes the existing success finalize so `cleanWorkspaceWithGuard` preserves the branch + PR and the PR merge auto-dones the row. The shipped unit is recorded in `completed` — the same guard the single-dispatch normal exit uses — so it is not re-dispatched (double-shipped) while its `in_review` row is still in-progress.

Non-local/primary staged units and the single-dispatch path are byte-identical (`success → in_review` human-review semantics unchanged; the gate is a no-op off the local path). The #886 empty-diff halt still fires. Adds `StagedWorkflowDecl.acceptance` and `RoutingConfig.maxLocalStageRetries` to `@harness-engineering/types` (both wired into the orchestrator Zod config schema). See ADR 0079/0080.
