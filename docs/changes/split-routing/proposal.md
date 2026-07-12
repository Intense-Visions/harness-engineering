# Split-Routing — Workflow Stage-Execution Engine (AMR Phase 4b)

**Status:** Draft (rev. 2 — post-feasibility-review) · **Tier:** Large · **Domain:** orchestrator
**Keywords:** workflow, stage-execution, split-routing, coherence-unit, per-stage-routing, AMR, opt-in, additive

## Overview

Adaptive Model Routing (AMR, [#796](../adaptive-model-routing/proposal.md)) routes **one dispatch** to the cheapest capable backend by task complexity. Its D6/SC4 promise — **split-routing**, where a single unit of work fans its internal stages to different models — was deferred because **the orchestrator has no stage-execution engine and nothing emits multi-stage workflows** (`WorkflowStep`, `packages/types/src/workflow.ts:4-23`, has no runtime consumer; no skill emits a `Workflow`).

This spec builds that engine: a **general, opt-in workflow stage-execution engine** in the orchestrator that runs an ordered workflow's stages as sequential sub-runs on a shared worktree, **routing each stage independently via `AdaptiveRouter.route()` with a shared `coherenceUnit`** (coherence-pinning). It ships with a **real declarative producer** (an operator/caller declares stages for a unit) so it is proven end-to-end (SC2), not a speculative abstraction.

It is **strictly additive**. Staged _execution_ is **single opt-in**: a unit runs staged when — and only when — a **≥2-stage** workflow is declared for it (the `workflowFor` predicate reads only `config.workflows`). Absent a declared ≥2-stage workflow, dispatch is **behaviorally identical** to today's single-agent path (`dispatchIssue`). Per-stage _tier routing_ is a second, independent opt-in: when `routing.policy` is set each stage routes via `AdaptiveRouter.route()` at its own required tier; absent a policy, stages use the identity/default chain (`adaptiveRouter: null`), still on a shared `coherenceUnit`. (An earlier draft described this as "doubly opt-in"; the shipped gate keys staged execution on the workflow declaration alone — the policy governs tiering, not whether staging runs.)

> **Rev-2 note:** rev-1's feasibility review found three state-layer integration bugs (per-stage session/recorder/abort keying, mid-workflow retry wiping the worktree, and wrong escalation math). This revision resolves them explicitly — they are the load-bearing design content, so they are decisions here, not implementation details.

## Why now

1. **AMR's split-routing (SC4) is unfulfillable without an execution substrate** — the routing engine + the per-stage seam (`RoutingRequest.coherenceUnit`, `orchestrator.ts:1964-1966`) exist, but nothing calls `route()` per stage.
2. **The value is real** — routing a unit's mechanical/creative/verification stages to different tiers is the dominant cost-vs-quality win the AMR thesis is grounded in; per-stage _cost capture_ makes it measurable.
3. **The primitives exist** — worktree-per-unit (`workspace/manager.ts:89-142`), the stateless per-run `AgentRunner` (`agent/runner.ts`), `coherenceUnit`-keyed `EscalationState`, immutable state cloning. The engine composes them.

## Non-goals

- **Parallel stages.** v1 is sequential (artifacts flow forward on one worktree). Parallel/DAG stages are a follow-up.
- **Rich auto-producers (autopilot-as-workflow; a staged code-review producer).** v1 ships the declarative producer; auto-producers are follow-ups on the substrate (D7).
- **Mid-workflow _resume_ across process restart.** A workflow is one atomic unit; if the process dies mid-workflow, the next attempt **restarts from stage 0 on a fresh worktree** (D11) — no partial-resume, no persisted stage cursor. Re-running completed stages is acceptable (idempotent) and explicitly not optimized in v1.
- **Stage-local transport retry.** A transport/runner error mid-workflow **terminally fails the unit** (D10) rather than re-running from stage 0 (which would wipe the shared worktree and destroy prior stages). Preserving-and-resuming a failed stage in place is a follow-up.
- **Touching `AdaptiveRouter`/`BackendRouter` internals** (AMR D2 holds — the engine _calls_ `route()`).
- **Changing single-agent dispatch.** Non-workflow (and ≤1-stage) units use today's path unchanged.
- **Per-dimension review-agent model tiering.** See D9 — that is `core/review`'s separate future concern (its agents are synchronous heuristics with no model; `core` cannot import `orchestrator`).

## Assumptions

- Node.js ≥ 18.x; engine hosted in the orchestrator process.
- **Shared worktree:** all stages of a unit run on the one worktree from `ensureWorkspace(issue.identifier)`; artifacts pass forward as files. `ensureWorkspace` wipes+recreates per _attempt_ (`manager.ts:93-118`), so a whole-unit retry restarts the whole workflow (D11).
- **One coherence unit:** `coherenceUnit = issue.id` across all stages; the escalation floor is unit-scoped.
- **AMR is the routing authority:** stage backends come from `AdaptiveRouter.route()`; with no `routing.policy`, each stage resolves via identity routing (no `AdaptiveRouter`).

## Backward compatibility (doubly opt-in, additive)

- **No ≥2-stage workflow declared** → `dispatchIssue` takes its existing single-agent path. `workflowFor(issue)` is a **cheap pure predicate** with no side effects on the non-workflow path, so behavior is unchanged (SC4). A **0-stage** workflow is a config-validation error; a **1-stage** workflow falls back to single dispatch (D13).
- **Workflow declared but no `routing.policy`** → stages run sequentially, each resolving via identity routing (no `AdaptiveRouter`) — same backend each stage would get without AMR.
- **Neither** → nothing executes; new type/state fields are optional.

## Decisions

| #       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Rationale                                                                                                                                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | **General sequential stage-execution engine in the orchestrator, reusing existing primitives.** `executeWorkflow(ctx, plan)` runs stages in order on the unit's single worktree.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | The substrate AMR intended; composes worktree/runner/router/escalation rather than reinventing dispatch.                                                                                                              |
| **D2**  | **Coherence-pinning: one `coherenceUnit` (=`issue.id`) across all stages.** Each stage routes independently; the escalation floor is shared and _cumulative_ across stages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Definition of a coherence unit (D6 from AMR); shared floor keeps cross-stage escalation coherent.                                                                                                                     |
| **D3**  | **The engine owns per-stage session/recorder/abort/token state directly (C1 fix).** It calls `runner.runSession` per stage itself — NOT `runAgentInBackgroundTask` (which writes issue-keyed `session`/recorder/abort at `orchestrator.ts:2020-2150`). Each stage gets its own session object, its own `startRecording`/`finishRecording` keyed by `(issueId, stageIndex)`, and its own abort handle held in `StageRun`; the engine summarizes into the one `RunningEntry` (current stage, aggregate phase) at stage boundaries. **`StageRun` carries per-stage `tokens` + `sessionId`** so split-routing's cost is attributable per stage.                                                                                                                                                        | rev-1 keyed session/recorder/abort 1:1 to the issue — N stages would clobber recordings, lose per-stage tokens, and race `stopIssue`'s single abort controller. Per-stage cost capture is the point of split-routing. |
| **D4**  | **Sequential artifact passing via the shared worktree + a stage-outputs map.** Each stage's `produces` lands on the worktree; the next stage's context includes prior outputs (`expects`). No artifact store beyond the worktree.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Simplest sound model; the worktree persists across stages.                                                                                                                                                            |
| **D5**  | **Doubly opt-in + `≥2`-stage gate; behaviorally identical when off.** Enter `executeWorkflow` only when a ≥2-stage workflow is declared. `workflowFor` is a pure predicate. All new type/state fields optional.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Adopter-portability (AMR D11). ≤1 stage has no split to route, so it uses the unchanged path (D13).                                                                                                                   |
| **D6**  | **Atomic unit lifecycle: one claim, one lane, one `emitWorkerExit` — inside a `try/finally` (I1 fix).** The whole `executeWorkflow` body is wrapped so that **every** exit path (all stages pass, a stage terminally fails, or the engine loop itself throws) drives **exactly one** terminal transition (`emitWorkerExit` on success, `finalizeRoutingTerminal` on failure). No stage calls the issue-level `emitWorkerExit`.                                                                                                                                                                                                                                                                                                                                                                     | Preserves single-unit atomicity + lane invariants; the `try/finally` closes the orphaned-`running`/`claimed` hole rev-1 left (reconciliation only clears claimed-not-running, `state-machine.ts:293-303`).            |
| **D7**  | **v1 producer is the declarative staged-workflow API; rich auto-producers are follow-ups.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Avoids over-integration before the substrate is proven; keeps the PR reviewable.                                                                                                                                      |
| **D8**  | **Three separated failure mechanisms (C3/S4 fix): (a) engine-owned per-stage retry cap = 1; (b) floor-climb feed; (c) terminal-fail trigger.** A `pass-required` stage that fails is retried **once by the engine at an explicitly-bumped tier** (the engine computes `nextTier(decision.tierRequired)` and passes it as the stage's required floor — it does NOT rely on `recordOutcome`'s threshold climb). Independently, the engine calls `recordOutcome(coherenceUnit, tier, false)` on each quality failure to feed the **cumulative** unit floor (which climbs per `EscalationState`'s threshold, `escalation-state.ts:23,57-90`) so _later_ stages inherit escalation. If the single engine-retry also fails, the unit terminally fails to a human. `advisory` stages never fail the unit. | rev-1 conflated the engine's per-stage retry with `recordOutcome`'s threshold climb (one failure doesn't climb a `threshold=2` ladder). Separating them makes escalation correct and bounded.                         |
| **D9**  | **Split-routing is homed in the orchestrator (where AMR lives), not the review pipeline.** `core/review`'s dimension agents are synchronous heuristics with no model (`fan-out.ts:22-45`), and `core` cannot import `orchestrator` (`harness.config.json` layers: "Core layer cannot import from higher layers"), so AMR cannot drive them; review-dimension tiering is `core/review`'s separate future work using its own `model-tier-resolver`. **Note:** the _other_ way to tier review is to dispatch review dimensions as orchestrator **workflow stages** — which is exactly what a future D7 staged-review producer would be. So this engine is the orchestrator-side path to staged review later; "core owns review tiering" is true only for the _in-process_ `core/review` agents.       | Correct layer, no cross-layer coupling, no review rewrite.                                                                                                                                                            |
| **D10** | **A mid-workflow transport/runner error terminally fails the unit (C2 fix).** It does NOT re-enter the whole-issue retry budget (`enqueueRetry`, `state-machine.ts:508`), which re-runs from stage 0 and wipes the worktree (`ensureWorkspace`), destroying completed-stage artifacts. The engine catches the stage error and calls `finalizeRoutingTerminal` + a `needs-human` escalation.                                                                                                                                                                                                                                                                                                                                                                                                        | The existing retry model is per-_dispatch_, not per-_stage_; reusing it would silently violate D4's artifact-forward contract. Stage-local retry-in-place is a follow-up.                                             |
| **D11** | **Restart = restart-from-stage-0 on a fresh worktree.** `RunningEntry`/`currentStageIndex` are in-memory (`OrchestratorState`, `internal.ts:98`); a process death mid-workflow re-runs the whole workflow on the next attempt (idempotent). No persisted stage cursor in v1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Matches the existing single-dispatch restart semantics; partial-resume is a follow-up (a non-goal).                                                                                                                   |
| **D12** | **Per-stage wall-clock deadline.** Each stage runs under a configurable per-stage timeout (in addition to the runner's `maxTurns`); a stage that exceeds it is treated as a stage failure → D8 (retry once) → terminal. Issue-grain stall detection (`state-machine.ts:736`) is bypassed for workflow units (the engine owns per-stage liveness).                                                                                                                                                                                                                                                                                                                                                                                                                                                  | A single long-lived running entry would otherwise let one hung stage hang the whole unit with no bound (I3).                                                                                                          |
| **D13** | **0-stage workflow = validation error; 1-stage workflow = single dispatch.** `workflowFor` only returns a plan for `stages.length ≥ 2`; a declared 0-stage workflow fails config validation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | A 0-stage "success" would mark an issue done having done nothing; a 1-stage workflow is behaviorally single dispatch and should take the proven path (I4).                                                            |

## Technical Design

### Type changes (`packages/types`)

```ts
// workflow.ts — additive. NOTE: no `model?` on WorkflowStep — routing produces a
// RoutingDecision captured on StageRun; a WorkflowStep.model with no consumer would be
// the exact "validated, zero-consumer" anti-pattern this spec criticizes (S2/YAGNI).
export interface WorkflowStep {
  skill: string;
  produces: string;
  expects?: string;
  gate?: 'pass-required' | 'advisory';
  cognitiveMode?: string; // drives per-stage RoutingUseCase
  // Deterministic routing hint so a stage can force a tier for testing/fixtures (S3):
  // when present it seeds RoutingRequest.complexity/risk so the fixture's `strong` and
  // `fast` stages resolve differently without depending on live text classification.
  routingHint?: { complexity?: ComplexityVerdict; risk?: RoutingRisk };
}

export interface WorkflowExecutionPlan {
  coherenceUnit: string;
  stages: WorkflowStep[];
}

export interface StageRun {
  index: number;
  step: WorkflowStep;
  decision?: RoutingDecision; // resolved backend + tier + cost
  sessionId?: string; // C1: per-stage session, not the issue's
  tokens?: { input: number; output: number; total: number }; // C1: per-stage cost
  outcome?: 'pass' | 'fail' | 'error';
  tier?: CapabilityTier;
  attempt?: number; // 0 or 1 (D8 engine retry cap)
  durationMs?: number;
}
```

`RunningEntry` (`types/internal.ts:98-125`) gains optional `workflow?: WorkflowExecutionPlan`, `currentStageIndex?: number`, `stageRuns?: StageRun[]` — the engine owns these; non-workflow entries are unchanged. The per-stage `session`/abort live in `stageRuns[i]`, **not** the issue-level `session` field (C1).

### The engine (`packages/orchestrator/src/workflow/execute-workflow.ts`, new)

```ts
async function executeWorkflow(ctx, plan: WorkflowExecutionPlan): Promise<void> {
  const runs: StageRun[] = [];
  try {
    // D6/I1: exactly one terminal exit
    for (const [index, step] of plan.stages.entries()) {
      const run = await runStageWithRetry(ctx, plan.coherenceUnit, step, index, runs);
      runs.push(run);
      if (run.outcome === 'fail' || run.outcome === 'error') {
        return await ctx.finalizeWorkflowTerminal(plan.coherenceUnit, runs, step); // D8/D10
      }
    }
    return await ctx.emitWorkflowSuccess(plan.coherenceUnit, runs); // D6 one exit
  } catch (err) {
    // I1 safety net
    return await ctx.finalizeWorkflowTerminal(plan.coherenceUnit, runs, undefined, err);
  }
}

async function runStageWithRetry(ctx, unit, step, index, prior): Promise<StageRun> {
  for (let attempt = 0; attempt <= 1; attempt++) {
    // D8(a): engine retry cap = 1
    const floor = attempt === 0 ? undefined : ctx.nextTier(prior /*bumped tier*/);
    const req = buildStageRequest(step, unit, prior, floor); // seeds routingHint (S3)
    const { decision, def } = ctx.adaptiveRouter
      ? await ctx.adaptiveRouter.route(req)
      : ctx.identityResolve(req.useCase); // D5
    // C1/D3: engine owns the session, recorder (keyed by (unit,index,attempt)), abort, tokens.
    // D12: per-stage wall-clock deadline wraps runStageSession.
    const result = await ctx.runStageSession(unit, index, attempt, step, def, priorOutputs(prior));
    const ok = step.gate !== 'pass-required' || result.passed;
    ctx.adaptiveRouter?.recordOutcome(unit, decision.tierRequired, ok); // D8(b): cumulative floor
    if (ok || step.gate !== 'pass-required')
      return stageRun(index, step, decision, result, 'pass', attempt);
    if (attempt === 1) return stageRun(index, step, decision, result, 'fail', attempt); // D8(c)
    // else: loop once more at the bumped tier
  }
  /* unreachable */ return stageRun(index, step, undefined, undefined, 'error', 1);
}
```

- **Entered from `dispatchIssue`** after workspace + claim: `const plan = workflowFor(issue); if (plan) return this.executeWorkflow(ctx, plan);` else the unchanged single-agent path (D5/D13).
- **`runStageSession`** drives `AgentRunner.runSession` directly, holding a per-stage `LiveSession`, a per-stage recorder (`startRecording`/`finishRecording` keyed by `(issueId, index, attempt)`), and a per-stage `AbortController` in `stageRuns[index]` — never the issue-level fields (C1). It accrues tokens into `StageRun.tokens`.
- **`emitWorkflowSuccess`** performs the single terminal success transition (running.delete → completed.set → claimed.delete → cleanWorkspace), aggregating `stageRuns` into the completion record — one `emitWorkerExit`-equivalent (D6).
- **`finalizeWorkflowTerminal`** = AMR's `finalizeRoutingTerminal` pattern (running/claimed delete + `persistLaneSafe('abandon')` + `needs-human`) **plus `cleanWorkspace`** (S5) so a failed workflow doesn't leak its worktree.

### Reused primitives (unchanged)

Worktree (`ensureWorkspace`, one per unit), `AgentRunner.runSession` (per stage), `AdaptiveRouter.route()` (per stage, shared `coherenceUnit`), `EscalationState` (cumulative unit floor), `finalizeRoutingTerminal` pattern (terminal fail).

## Integration Points

- **Entry Points:** `executeWorkflow` branch in `dispatchIssue`; new `packages/orchestrator/src/workflow/execute-workflow.ts`; optional `workflow` on dispatch input; a `workflowFor` predicate + config validation (D13).
- **Registrations Required:** barrel exports for new types (`pnpm generate:barrels`).
- **Documentation Updates:** AGENTS.md orchestrator section; AMR spec "Deferred follow-ups" 4b → landed.
- **Architectural Decisions:** D3 (engine owns per-stage session state), D6 (atomic try/finally lifecycle), D8 (separated failure mechanisms), D9 (orchestrator homing), D10 (mid-workflow error = terminal) each warrant an ADR — they are the load-bearing calls the feasibility review surfaced.
- **Knowledge Impact:** "workflow stage", "coherence unit", "per-stage cost" enter the graph.

## Success Criteria

### Functional

- **SC1** — A declared 3-stage workflow runs all stages sequentially on one worktree, in order, producing one completion; each stage's `StageRun` carries its own `sessionId` + `tokens` (per-stage cost captured, D3).
- **SC2** — With `routing.policy` set and stages carrying distinct `routingHint`s, a `strong`-hinted stage and a `fast`-hinted stage in the same unit resolve to different tiers/backends (SC4 from AMR, deterministically — S3).
- **SC3** — The unit floor is **cumulative**: after `EscalationState.threshold` quality failures across the unit's stages, a subsequent stage resolves at ≥ the raised tier (matches `EscalationState` semantics — not "one failure climbs," which the ladder does not do, C3).

### Safety / Invariants

- **SC4** — With no ≥2-stage workflow, `dispatchIssue` is behaviorally identical (single-agent path; `workflowFor` is a pure no-side-effect predicate). A 1-stage workflow uses the single path; a 0-stage workflow is rejected at validation (D13).
- **SC5** — **Exactly one** claim, one lane entry, one terminal transition per workflow unit for **every** exit path — all-pass, stage terminal-fail, or an exception thrown inside the engine loop — with **no orphaned `running`/`claimed`** (the `try/finally`, D6/I1). Regression-tested by forcing a throw between stages.
- **SC6** — A `pass-required` stage that fails, is retried **once** at a bumped tier, and fails again → the unit terminally fails to a human exactly once (no loop; `cleanWorkspace` runs). A mid-workflow transport error → terminal, **without** re-running from stage 0 or wiping completed-stage artifacts (D10). `advisory` stages never fail the unit.
- **SC7** — A stage exceeding its per-stage deadline is treated as a stage failure (D12), not an unbounded hang.

### Non-regression

- **SC8** — `AdaptiveRouter`/`BackendRouter` byte-unchanged (AMR D2); existing single-dispatch + AMR tests pass unchanged.

## Implementation Order

**Phase 1 — Types + engine skeleton with per-stage session ownership (substrate, ~4d).** `WorkflowStep`(+`cognitiveMode`/`routingHint`, **no** `model`), `WorkflowExecutionPlan`, `StageRun`(+`sessionId`/`tokens`); `executeWorkflow` + `runStageSession` driving `AgentRunner.runSession` per stage with **engine-owned** per-stage session/recorder/abort/tokens (C1/D3); `try/finally` single-exit (D6/I1). Prove SC1 + SC5 (orphan-on-throw).

**Phase 2 — Per-stage routing + cumulative coherence-pinning (~3d).** Per-stage `route()` with shared `coherenceUnit` + `routingHint` seeding (S3); `recordOutcome` cumulative floor. Prove SC2/SC3.

**Phase 3 — Separated failure mechanisms + terminal semantics (~3d).** D8 engine retry-cap-1 at a bumped tier + floor feed + terminal; D10 mid-workflow-error terminal (no worktree wipe); D12 per-stage deadline; `finalizeWorkflowTerminal` (+`cleanWorkspace`, S5). Prove SC6/SC7.

**Phase 4 — Opt-in gate + declarative producer + docs (~2d).** `workflowFor` predicate + `≥2`-stage gate + 0-stage validation (D13); the declarative producer + an end-to-end SC2 fixture; behavioral-identity + restart-from-0 regression tests (SC4/D11); docs + ADRs. Prove SC4/SC8.

**Total:** ~12 working days. Phases 1–3 are the engine (with the state-layer integration the feasibility review surfaced made explicit); Phase 4 wires it in opt-in with a real producer. Parallel stages, stage-local retry-in-place, partial-resume, and rich auto-producers are follow-ups on this substrate.

## Deferred follow-ups

The engine, per-stage routing, cumulative escalation, terminal semantics, and the opt-in/default-off gate are **complete and tested** (SC1–SC8 proven through the real `WorkflowEngineContext`). What is deferred is the **operational prompt-richness layer** on top of that substrate:

- **Per-stage prompt rendering + D4 artifact-context threading are stubbed.** Today `runStageSession` passes the bare `step.skill` string as the stage prompt, and `priorOutputs(priorRuns)` returns `{}`. Stages therefore currently operate off the **shared worktree file-state** carried between stages (each stage sees the prior stage's file changes on the one worktree) with only a **skill-name prompt** — they do _not_ yet receive a rendered per-stage prompt or an in-memory `produces → expects` output payload. The real layer is: a `PromptRenderer` invocation per stage (rendering the stage's skill/template with issue + attempt context, as the single-agent path already does) plus `produces → expects` context threading so a downstream stage receives its upstream's declared outputs as structured context rather than relying solely on worktree diffs. This is the next layer of work; the routing/escalation/terminal machinery underneath it is done.
- **Parallel stages** — the engine runs stages strictly sequentially on one worktree. Fan-out/fan-in across a DAG of stages is a follow-up.
- **Stage-local retry-in-place** — the current retry cap-1 re-runs the failing stage at a bumped tier but does not support richer per-stage retry policies (e.g. distinct retry counts or per-stage backoff).
- **Partial-resume** — a re-dispatch restarts from stage 0 on a fresh worktree (D11); there is no persisted stage cursor to resume mid-workflow after an interruption.
- **Rich auto-producers** — the declarative `WorkflowConfig.workflows` producer is the v1 source; auto-deriving workflows from skill catalogs / issue shape is a follow-up.

None of these gaps affect the shipped invariants (SC4 byte-identity when off, SC5 single-exit, SC8 router non-regression). They are additive layers on the proven engine.
