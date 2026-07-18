# Staged Local Verification Gate + Convergent Retry

**Keywords:** orchestrator, staged-workflow, settle, verification-gate, verifyRunner, convergence, retry, ship, lane-lifecycle, local-dispatch

## Overview and Goals

**Problem.** A staged local-dispatch workflow **cannot converge** on a simple item — it loops forever producing incomplete work. Two structural gaps (found live 2026-07-18 re-running the qwen3.6 pilot with PR #890's reuse-on-retry already in the dist):

1. **Hollow success + settle-time wipe (no real verification).** The staged engine marks a unit "completed all stages" after every stage merely _runs_ (the per-stage gate always-passes — no `pass-required`, `execute-workflow.ts:314-319` — and `ret.success` is the model's "TASK_COMPLETE", not "tests passed"). `settleWorkflowSuccess` (`orchestrator.ts:3300-3351`) then only runs the #886 empty-diff gate (which passes any non-empty diff), calls `cleanWorkspaceWithGuard` (`orchestrator.ts:1781-1833`, wipes when the agent pushed no branch — the local case), and `persistLane('success')`. So real-but-incomplete work (a rule written, its test + integration count-bump missing) is **destroyed** at settle, before any retry — #890's `ensureWorkspace` reuse guard never gets a workspace to preserve.
2. **Cannot terminalize → infinite re-dispatch.** `persistLane('success')` maps `success → in_review` (`lane-persistence.ts:11,23`; "the orchestrator NEVER drives `done`"). The roadmap row stays `in-progress` (done needs a merged PR, which never happens — nothing shipped). The next tick re-selects the row and re-dispatches; the claim fails `forceGuard: in_review→claimed not allowed` (a warning; dispatch proceeds), the workspace is wiped again, the rule rebuilt, "completed all stages", wiped — forever.

**Insight.** The **single-dispatch** local flow (#843/#874) already converges and ships: `runLocalWorkflowGate` (`orchestrator.ts:2641`) runs the real acceptance gate (empty-diff → `verifyRunner` typecheck+lint+**test** → outcome-eval); on FAIL it `emitWorkerExit('error')` → the state machine re-dispatches with the failure fed back (`priorGateFailureByIssue`), workspace preserved; on PASS the agent has shipped (push+PR via the local prompt) → PR-merge auto-dones the row. The **staged** path reimplemented dispatch and lost this contract. This spec gives the staged settle the **same** gate + retry-or-ship contract — not a second convergence engine.

**Goal.** A staged local unit on a simple item **converges**: accumulate work across preserved-workspace retries until its acceptance command passes, then ship (PR → auto-done); on repeated failure escalate to `needs-human` after a bounded number of attempts. Never an infinite hollow-success/wipe/stuck-lane loop.

**Out of scope.** Non-local/primary staged units (keep `success→in_review` human-review semantics). The single-dispatch path (#843) — unchanged. Improving the local model itself.

## Decisions made

- **D1 — Real acceptance gate at staged settle (Approach A: reuse `runLocalWorkflowGate`).** For a local staged unit, `settleWorkflowSuccess` routes through the same `runLocalWorkflowGate` the single-dispatch path uses (empty-diff → `verifyRunner` → outcome-eval), replacing the empty-diff-only sub-check. The #886 empty-diff halt is subsumed (it is step 0 of the gate). _Why:_ one convergence contract, not two; `verifyRunner` is the authoritative real test signal.
- **D2 — Configurable acceptance command, default repo gate.** The staged workflow decl gains an optional `acceptance` field (a shell command run in the workspace). When set, the gate runs it and gates on exit code; when unset, it uses `verifyRunner` (the project's typecheck+lint+test — the default repo gate). _Why:_ portable to adopter projects (no hardcoded command); authoritative (real exit code); default requires no config.
- **D3 — On gate FAIL: preserve + converge, don't wipe.** Route the failure through the single-dispatch retry seam (`emitWorkerExit('error')` + stash the reason in `priorGateFailureByIssue` so the next prompt gets the failure) INSTEAD of `cleanWorkspaceWithGuard`+`persistLane('success')`. The unit re-dispatches as a within-run retry → #890 preserves the workspace → work accumulates. Bounded to N attempts (config, default e.g. 5) → then the `needs-human` terminal (D5). _Why:_ mirrors the proven single-dispatch convergence loop; #890 makes the preserved workspace accumulate.
- **D4 — On gate PASS: ship deterministically.** An orchestrator-side `shipWorkspace(identifier, issue)`: commit the worktree's changes, create/push a branch, `gh pr create` (reusing the `pr-manager` gh-create pattern, `pr-manager.ts:130`). Then the existing `cleanWorkspaceWithGuard` "branch pushed + PR exists" path (`orchestrator.ts:1797-1829`) preserves/records it and the PR-merge auto-dones the row — the loop stops. _Why:_ weak local models skip push+PR unless forced (LESSONS.md #874 needed a driver-level completion loop); an orchestrator-side ship is deterministic. Rejected alternative: an agent-driven ship stage (unreliable).
- **D5 — Lane lifecycle for autonomous local units.** The local staged retry uses a re-claimable transition (not stuck at `in_review`); the bounded-retry-exhausted `needs-human` terminal marks the row so the tick STOPS re-selecting it (`blocked`/needs-human, not `in-progress`). Non-local/primary units keep `success→in_review`. _Why:_ `success→in_review` assumes a human reviewer that an autonomous local loop does not have.
- **D6 — Scope guard.** Enforcement is gated on the SAME locality predicate the #886 gate uses (`isLocalEndpointBackend` of the last stage's backend). Non-local staged, primary, and single-dispatch paths are byte-identical.

## Technical design

**Settle (`orchestrator.ts` `settleWorkflowSuccess`, ~3300-3351).** Replace the inline empty-diff sub-gate with a call to `runLocalWorkflowGate(issue, workspacePath, lastBackendName)` (extended to honor a per-workflow `acceptance` command override — D2). Branch on the result:

- `{ ok: false }` → **do NOT** `cleanWorkspaceWithGuard`; stash `priorGateFailureByIssue.set(issueId, reason)`; drive the unit's retry (reuse the staged unit-retry / `emitWorkerExit('error')`-equivalent so the tick re-dispatches). Track attempt count; at the bound → `settleWorkflowTerminal` (needs-human, D5) which already cleans + escalates.
- `{ ok: true }` → `shipWorkspace(...)` (D4); then the existing success finalize (`cleanWorkspaceWithGuard` → PR path) + `persistLane` per D5.

**Acceptance command (D2).** Extend the workflow decl schema (`StagedWorkflowDecl`) with optional `acceptance?: string`. Thread it to the gate; when present, the gate runs it (in-workspace, captured exit code) as the mechanical step in place of / in addition to `verifyRunner`. When absent, `verifyRunner` unchanged.

**Ship (`shipWorkspace`, D4).** New private method: `git -C <ws> add -A && commit` (if uncommitted), create a branch `orchestrator/<identifier>`, `git push -u origin`, `gh pr create` via the existing gh seam. Guarded/fail-safe (a ship failure → block + retry, never a silent success). Returns the branch so `cleanWorkspaceWithGuard` finds it.

**Lane (D5).** Add the local-autonomous transitions to the lane map / guard so a failed local staged unit can be re-claimed for retry and a terminal needs-human stops re-dispatch. Keep the non-local `success→in_review` mapping intact (branch on locality).

**Retry bound.** Config `routing`/workflow field `maxLocalStageRetries` (default 5). Reuse existing escalation machinery for the terminal.

## Integration Points

- **Entry Points.** No new CLI/MCP. Internal: `settleWorkflowSuccess` gate routing; new `shipWorkspace`; `StagedWorkflowDecl.acceptance` config field; lane-map extension.
- **Registrations Required.** The `acceptance` field must be added to the workflow-decl Zod schema (config validation) so it is accepted (mirrors the config-surface gap noted for routing.policy). No barrel export changes.
- **Documentation Updates.** The multi-backend/staged-workflow guide: document the settle acceptance gate, the `acceptance` field, the convergent-retry + ship contract, and the local-vs-nonlocal lane lifecycle. Update `settleWorkflowSuccess` / lane-persistence doc comments.
- **Architectural Decisions.** D1 (unify staged settle with the single-dispatch gate) and D5 (autonomous-local lane lifecycle: the orchestrator MAY drive a local unit to a terminal without human PR review) each warrant an ADR — they redefine the staged completion + lane-terminal contract.
- **Knowledge Impact.** Concepts: "staged acceptance gate", "convergent preserved-workspace retry", "deterministic orchestrator-side ship". Relationship: real-verification-gate → convergence; ship-on-pass → auto-done → loop-stop.

## Success Criteria

- **SC1** A local staged unit whose acceptance command FAILS → workspace preserved + re-dispatched with the failure reason fed into the next prompt (NOT wiped, NOT hollow-success, NO `cleanWorkspaceWithGuard`). (unit test with injected gate/diff/workspace seams)
- **SC2** Across preserved retries the workspace diff accumulates until the gate passes (no reset between attempts). (integration test / live)
- **SC3** On gate PASS → `shipWorkspace` commits+pushes a branch and creates a PR; `cleanWorkspaceWithGuard` takes its "branch pushed + PR exists" path. (unit test spying ship + clean-guard)
- **SC4** Bounded retries exhausted → `needs-human` terminal; the tick STOPS re-dispatching the row (lane not stuck re-selecting). (test)
- **SC5** No regression: non-local/primary staged + single-dispatch paths byte-identical; the #886 empty-diff halt still fires (subsumed by the gate); all existing orchestrator tests green.
- **SC6** (live) qwen3.6 pilot on `no-only-tests`: rule → +test → +integration-count across preserved retries until `pnpm --filter @harness-engineering/eslint-plugin test` passes, a PR opens, the unit terminates — no infinite loop.

## Implementation Order

### Phase 1: Gate + convergent retry

Route local `settleWorkflowSuccess` through `runLocalWorkflowGate`; on fail → preserve (no clean) + retry with fed-back reason + bounded attempt count; add the `acceptance` decl field + schema. Failing tests first (SC1/SC2/SC5-regression). <!-- complexity: high -->

### Phase 2: Deterministic ship on pass

`shipWorkspace` (commit+branch+push+`gh pr create`); wire it into the gate-pass branch; confirm `cleanWorkspaceWithGuard` PR path. Failing tests first (SC3). <!-- complexity: medium -->

### Phase 3: Lane lifecycle + needs-human terminal + docs

Autonomous-local lane transitions (re-claimable retry; terminal stops re-dispatch); bounded-exhaustion → needs-human; ADRs (D1, D5); guide + doc-comment updates; `@harness-engineering/orchestrator` minor changeset. Failing tests first (SC4). <!-- complexity: medium -->
