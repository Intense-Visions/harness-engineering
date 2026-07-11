# Split-Routing — Workflow Stage-Execution Engine (AMR Phase 4b)

**Status:** Draft · **Tier:** Large · **Domain:** orchestrator
**Keywords:** workflow, stage-execution, split-routing, coherence-unit, per-stage-routing, AMR, opt-in, additive

## Overview

Adaptive Model Routing (AMR, [#796](../adaptive-model-routing/proposal.md)) routes **one dispatch** to the cheapest capable backend by task complexity. Its D6/SC4 promise — **split-routing**, where a single unit of work fans its internal stages to different models (mechanical checks → free, security review → strong, style → fast) — was deferred because **the orchestrator has no stage-execution engine and nothing emits multi-stage workflows**: `WorkflowStep` (`packages/types/src/workflow.ts:4-23`) has no `model` field, the per-stage `model` in `workflow/schema.ts` is validated but has **zero runtime consumers**, and no skill emits a `Workflow` artifact.

This spec builds that engine: a **general, opt-in workflow stage-execution engine** in the orchestrator that runs an ordered `Workflow`'s stages as sequential sub-runs on a shared worktree, **routing each stage independently via `AdaptiveRouter.route()` with a shared `coherenceUnit`** (coherence-pinning — one escalation floor across the whole unit, D6). It ships with a **first real producer** (a declarative staged-workflow input the orchestrator executes) so the engine is proven end-to-end (SC4), not a speculative abstraction with no consumer.

It is **strictly additive and doubly opt-in**: a unit runs staged only when a `Workflow` is declared for it **and** `routing.policy` is set. Absent either, dispatch is **byte-identical** to today's single-agent path (`dispatchIssue`, `packages/orchestrator/src/orchestrator.ts:1841-2096`).

## Why now

1. **AMR's split-routing (SC4) is unfulfillable without an execution substrate** — the routing engine exists, the per-stage seam (`RoutingRequest.coherenceUnit`, `orchestrator.ts:1964-1966`) exists, but nothing calls `route()` per stage. This is the missing consumer.
2. **The value is real and measured by AMR's own thesis** — a code-review-shaped unit today runs entirely on one tier; splitting mechanical/security/style stages across tiers is the dominant cost-vs-quality win the AMR spec is grounded in.
3. **The primitives already exist** — worktree-per-unit (`workspace/manager.ts:89-142`), the stateless per-dispatch agent runner (`agent/runner.ts`), `coherenceUnit`-keyed `EscalationState` (`agent/escalation-state.ts`, already multi-stage-ready), and immutable state cloning (`core/state-machine.ts:41-54`). The engine composes them; it does not reinvent dispatch.

## Non-goals

- **Parallel stages.** v1 runs stages **sequentially** (artifacts flow forward on one worktree). Parallel/DAG stages are a follow-up — sequential is the sound floor and matches the "coherence unit" model.
- **Rich producers (staged code-review dimensions, autopilot-as-workflow).** v1 ships ONE minimal declarative producer to prove the engine. Wiring `code-review`'s dimensions or the autopilot phase sequence as workflows is a follow-up that becomes trivial once the substrate exists (see Decision D7).
- **A new backend transport / touching `AdaptiveRouter` or `BackendRouter` internals** (D2 from AMR holds — the engine _calls_ `route()`, never modifies it).
- **Changing single-agent dispatch.** Non-workflow units use the exact path they use today, unchanged.
- **Per-dimension review-agent model tiering.** The `code-review` pipeline's dimensions (`packages/core/src/review/fan-out.ts`) are a _separate_ concern with its own home and mechanism: those agents are currently **synchronous heuristic analyzers** (no LLM, no model), and `core/review` already owns a purpose-built `model-tier-resolver.ts` for its anticipated "Phase 8 model tiering." Crucially, `core` **cannot import `orchestrator`** (layer boundary), so AMR's `AdaptiveRouter` cannot drive review dimensions — review tiering must use `core/review`'s own resolver and first requires converting heuristic agents to LLM-backed ones. That is a distinct, larger effort owned by the review pipeline, explicitly **out of 4b's scope** (see D9).

## Assumptions

- **Runtime:** Node.js ≥ 18.x; engine hosted in the orchestrator process (matches AMR).
- **Shared worktree:** all stages of a unit operate on the **one** worktree created for the unit (`ensureWorkspace(issue.identifier)`), so intermediate artifacts pass forward as files on disk — no cross-worktree copying.
- **One coherence unit per unit of work:** `coherenceUnit = issue.id` across all stages (matches AMR's dispatch seam), so the escalation floor climbs once per unit and is visible to every stage.
- **AMR is the routing authority:** stage backends come only from `AdaptiveRouter.route()`; with no `routing.policy`, there is no per-stage routing (the engine still runs stages, but each resolves through identity routing exactly as a single dispatch would).

## Backward compatibility (doubly opt-in, default-off)

- **No `Workflow` declared for a unit** → `dispatchIssue` takes its existing single-agent path, byte-identical. The engine is only entered when a workflow is present.
- **`Workflow` declared but no `routing.policy`** → stages still run sequentially, but each stage resolves through identity routing (no `AdaptiveRouter`), so no behavior change vs. how those stages would route without AMR.
- **Neither** → nothing in this feature executes; `RunningEntry`/state-machine shapes gain only optional fields.
- The default-off AMR gate (`orchestrator.ts:1959-1963`) is unchanged and still governs whether routing is active.

## Decisions

| #      | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Rationale                                                                                                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **General sequential stage-execution engine in the orchestrator, reusing existing primitives.** `executeWorkflow(workflow, coherenceUnit)` runs stages in order on the unit's single worktree; each stage builds a `RoutingUseCase` (stage's `cognitiveMode` from the skill catalog) + `RoutingRequest{ coherenceUnit }`, calls `AdaptiveRouter.route()`, spawns the runner at the resolved backend, streams events, records the stage outcome, then advances.                                                                                                                                                                                                                                                                                                                                                       | The substrate the AMR spec always intended. Reuses worktree/runner/state/escalation rather than reinventing dispatch — small, composable, testable.                                                                                |
| **D2** | **Coherence-pinning: one `coherenceUnit` (= `issue.id`) across all stages.** Each stage routes independently (different `cognitiveMode` → potentially different tier/backend), but the escalation floor is shared: a quality failure in any stage climbs the floor for **all remaining stages** (D10 from AMR).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | This is the definition of a coherence unit (D6). Shared floor prevents cross-stage thrashing and makes escalation coherent for the whole unit.                                                                                     |
| **D3** | **Ship a first real producer: a declarative staged `Workflow` the orchestrator executes.** Extend `WorkflowStep` with a runtime-populated `model?` and add a stage list to the unit's workflow input; the orchestrator detects a workflow-bearing unit and routes it to `executeWorkflow`. A concrete multi-stage fixture is wired end-to-end and SC4-tested.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | An engine with no producer is speculative over-engineering (YAGNI). A minimal real producer proves the whole path and pins SC4; it does not commit us to a specific rich producer prematurely.                                     |
| **D4** | **Sequential artifact passing via the shared worktree + a stage-outputs map.** Each stage's `produces` output lands on the worktree; the next stage's prompt context includes prior stage outputs (`WorkflowStep.expects`). No artifact store beyond the worktree in v1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Simplest sound model; the worktree already persists across stages. Avoids inventing an artifact-versioning subsystem.                                                                                                              |
| **D5** | **Doubly opt-in, strictly additive (byte-identical when off).** The engine runs only when a `Workflow` is declared AND is entered from the existing `dispatchIssue` seam; all new type/state fields are optional. Non-workflow dispatch is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Same adopter-portability guarantee as AMR (D11). Zero risk to existing single-agent flows.                                                                                                                                         |
| **D6** | **Atomic unit lifecycle: one claim, one lane entry, one completion — aggregating stage outcomes.** The unit holds one claim (`orchestrator.ts:1852`), one lane (`persistLaneSafe`, keyed by `issue.id`), and emits **one** `emitWorkerExit` after the last stage (or on a stage's terminal failure). Per-stage progress lives on `RunningEntry` (new optional fields), not as separate claims.                                                                                                                                                                                                                                                                                                                                                                                                                       | Preserves the single-unit atomicity + lane invariants the exploration flagged as the riskiest coupling. A workflow is still ONE unit of accountability.                                                                            |
| **D7** | **v1 producer is minimal-declarative; rich producers are follow-ups.** Staged `code-review` (dimensions as stages) and autopilot-as-workflow are explicitly out of v1 and become thin adapters onto the engine once it lands.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Avoids over-integrating into `review-ci`/host-agent paths before the substrate is proven. Keeps the PR reviewable and the abstraction honest.                                                                                      |
| **D8** | **Stage failure → escalate-then-continue-or-fail, capped.** A stage whose gate fails records a quality-fail (climbs the shared floor) and **retries that stage once at the raised tier**; if it fails again at `strong`, the whole unit terminally fails to a human (reusing AMR's `finalizeRoutingTerminal`/needs-human path). Non-gate stages that error follow the existing transport-retry budget.                                                                                                                                                                                                                                                                                                                                                                                                               | Makes D10 escalation _live within a unit_ (the very quality-fan-in AMR deferred). Bounded + capped ⇒ no loops; hard-fail-to-human on exhaustion.                                                                                   |
| **D9** | **Split-routing is homed in the orchestrator (where AMR lives), not the review pipeline.** Investigation of `packages/core/src/review/fan-out.ts` + `model-tier-resolver.ts` found the review pipeline already anticipates per-dimension tiering ("Phase 8"), but (a) its agents are synchronous heuristics with no model today, and (b) `core` cannot import `orchestrator`, so AMR cannot drive them. 4b therefore delivers split-routing for **AMR-routed dispatch stages** (the orchestrator's domain); review-dimension tiering remains `core/review`'s separate future work. The engine's producer is a **real declarative staged-workflow input** (an operator/caller declares stages for a unit) — a usable API, not a throwaway fixture — with richer auto-producers (autopilot-as-workflow) deferred (D7). | Picks the correct layer and avoids a speculative cross-layer coupling. Delivers real, usable split-routing (declare a staged workflow → each stage AMR-routed) without rewriting the review pipeline or inverting the layer graph. |

## Technical Design

### Type changes (`packages/types`)

```ts
// workflow.ts — additive
export interface WorkflowStep {
  skill: string;
  produces: string;
  expects?: string;
  gate?: 'pass-required' | 'advisory';
  cognitiveMode?: string; // NEW: drives per-stage RoutingUseCase (D2)
  model?: string | string[]; // NEW: runtime-populated by routing (declarative default optional)
}

// A unit's optional staged plan. Absent ⇒ single-agent dispatch (D5).
export interface WorkflowExecutionPlan {
  coherenceUnit: string; // = issue.id
  stages: WorkflowStep[];
}

// Per-stage runtime record (lives on RunningEntry).
export interface StageRun {
  index: number;
  step: WorkflowStep;
  decision?: RoutingDecision; // resolved backend + tier + cost (AMR enrichment)
  outcome?: 'pass' | 'fail' | 'error';
  tier?: CapabilityTier;
  durationMs?: number;
}
```

`RunningEntry` (`packages/orchestrator/src/types/internal.ts:98-125`) gains optional `workflow?: WorkflowExecutionPlan`, `currentStageIndex?: number`, `stageRuns?: StageRun[]` — all optional, so non-workflow units are unchanged.

### The engine (`packages/orchestrator/src/workflow/execute-workflow.ts`, new)

```ts
async function executeWorkflow(ctx, plan: WorkflowExecutionPlan): Promise<WorkerExit> {
  const outcomes: StageRun[] = [];
  for (const [index, step] of plan.stages.entries()) {
    const useCase = buildStageUseCase(step); // { kind:'skill', skillName, cognitiveMode }
    const req: RoutingRequest = {
      useCase,
      coherenceUnit: plan.coherenceUnit,
      taskText: stageText(step, outcomes),
    };
    const { decision, def } = ctx.adaptiveRouter
      ? await ctx.adaptiveRouter.route(req) // per-stage routing (D2)
      : ctx.identityResolve(useCase); // no policy → identity (D5)
    const result = await ctx.runStage(step, def, ctx.worktree, priorOutputs(outcomes)); // reuse runner + worktree
    const ok = step.gate !== 'pass-required' || result.passed;
    ctx.adaptiveRouter?.recordOutcome(plan.coherenceUnit, decision.tierRequired, ok); // shared floor (D2)
    outcomes.push({
      index,
      step,
      decision,
      outcome: ok ? 'pass' : 'fail',
      tier: decision.tierRequired,
    });
    if (!ok) {
      const escalated = await ctx.retryStageAtRaisedTier(step, plan.coherenceUnit, outcomes); // D8
      if (!escalated.ok) return terminalFailToHuman(plan.coherenceUnit, step); // D8 cap
    }
  }
  return aggregateSuccess(outcomes); // one emitWorkerExit (D6)
}
```

Entered from `dispatchIssue` (`orchestrator.ts:1841`): after workspace + claim, `if (workflowFor(issue)) return this.executeWorkflow(...)` else the existing single-agent path. The claim, lane, and a single `emitWorkerExit` wrap the whole workflow (D6).

### Reused primitives (no reinvention)

- **Worktree:** `WorkspaceManager.ensureWorkspace` once per unit; all stages share it (`workspace/manager.ts:89-142`).
- **Runner:** `AgentRunner` per stage (per-dispatch construction is already the pattern — `agent/runner.ts`).
- **Routing:** `AdaptiveRouter.route()` unchanged (`agent/adaptive-router.ts:117-148`); called per stage with shared `coherenceUnit`.
- **Escalation:** `EscalationState.recordOutcome/floorFor` unchanged — already `coherenceUnit`-keyed (`agent/escalation-state.ts`).
- **Terminal fail:** AMR's `finalizeRoutingTerminal` + needs-human queue for D8 exhaustion.

## Integration Points

- **Entry Points:** new `executeWorkflow` branch inside `dispatchIssue`; new `packages/orchestrator/src/workflow/execute-workflow.ts`; optional `workflow` on the dispatch input.
- **Registrations Required:** barrel exports for the new types (`pnpm generate:barrels`); no new CLI command in v1 (the producer is declarative input).
- **Documentation Updates:** AGENTS.md orchestrator section (staged dispatch); the AMR spec's "Deferred follow-ups" 4b entry → "landed".
- **Architectural Decisions:** D1 (engine reuses primitives), D6 (atomic unit lifecycle over stages), and D7 (minimal producer, rich producers deferred) each warrant an ADR — they are the load-bearing long-term calls.
- **Knowledge Impact:** "workflow stage", "coherence unit", "split-routing" enter the graph as first-class execution concepts.

## Success Criteria

### Functional

- **SC1** — A declared 3-stage workflow runs all stages sequentially on one worktree, in order, producing one completion.
- **SC2** — With `routing.policy` set, each stage routes independently: a `strong`-tagged stage and a `fast`-tagged stage in the same unit resolve to different tiers/backends (SC4 from AMR, now live).
- **SC3** — All stages of a unit share one `coherenceUnit`; a quality failure in stage N raises the escalation floor for stages > N (verified: stage N+1 resolves at ≥ the raised tier).

### Safety / Invariants

- **SC4** — With no workflow declared, `dispatchIssue` is byte-identical to today (single-agent path); with a workflow but no `routing.policy`, stages resolve via identity routing (no `AdaptiveRouter`) — both regression-tested.
- **SC5** — One claim, one lane entry, one `emitWorkerExit` per workflow unit regardless of stage count (D6); no orphaned `running`/`claimed` state on stage failure.
- **SC6** — A `pass-required` stage that fails at `strong` after the escalation retry terminally fails the unit to a human exactly once (no retry loop — reuses AMR's terminal path); `advisory` stages never fail the unit.

### Non-regression

- **SC7** — `AdaptiveRouter`/`BackendRouter` byte-unchanged (D2); existing single-dispatch + AMR tests pass unchanged.

## Implementation Order

**Phase 1 — Types + engine skeleton (substrate, ~3d).** `WorkflowStep.cognitiveMode/model`, `WorkflowExecutionPlan`, `StageRun`; `executeWorkflow` running stages sequentially on the shared worktree via the existing runner (no routing yet); barrels. Prove SC1.

**Phase 2 — Per-stage routing + coherence-pinning (~3d).** Call `AdaptiveRouter.route()` per stage with shared `coherenceUnit`; populate `StageRun.decision`; `recordOutcome` on the shared floor. Prove SC2/SC3.

**Phase 3 — Failure/escalation + atomic lifecycle (~3d).** D8 stage-fail escalate-retry-or-terminal; D6 single claim/lane/exit aggregation; reuse `finalizeRoutingTerminal`. Prove SC5/SC6.

**Phase 4 — Opt-in gate + first producer + docs (~2d).** The `dispatchIssue` detection branch (workflow present → engine, else unchanged); the minimal declarative producer + an end-to-end SC2 fixture; default-off/identity regression tests (SC4); docs + ADRs. Prove SC4/SC7.

**Total:** ~11 working days. Phases 1–3 are the engine; Phase 4 wires it in opt-in and proves the whole path with a real producer. Parallel stages and rich producers (staged code-review, autopilot-as-workflow) are follow-ups on this substrate.
