# Per-Phase Backend Routing (finish Spec B Phase 2)

**Keywords:** backend-routing, staged-workflow, cognitive-mode, thinking-vs-coder, per-phase, BackendRouter, local-pilot

## Overview and Goals

**Problem.** The orchestrator pilot dispatches **one `runner.runSession` per item** (`packages/orchestrator/src/orchestrator.ts:2440-2470`), so a single backend — with a single thinking setting — drives the entire workflow. But the phases have opposite needs: **design** (`harness-brainstorming`, `harness-planning`) needs a reasoning model with thinking **on**; **execution** (`harness-execution`, `harness-verification`, ship) needs a fast coder with thinking **off**. Running design on a thinking-off coder is the wrong setting for design — the established "reasoner designs, coder builds" finding. Today we cannot split them within one dispatch.

**Goals.**

1. Route **design** stages to a thinking/reasoning backend and **execution** stages to a coder backend, keyed on the stage's cognitive mode.
2. **Reuse and finish** the already-scaffolded machinery rather than build a parallel one: the staged-workflow engine (`executeWorkflow`), the `BackendRouter` (Spec B, resolves by `skill`/`mode`/`tier`/`default`), and the explicit stub at `packages/orchestrator/src/workflow/execute-workflow.ts:71` — _"Phase 1 stub: resolve the single backend for a stage (Phase 2 replaces with route())."_
3. Bridge design→execution via the staged engine's **shared workspace** + persisted artifacts (`proposal.md`, plan, `handoff.json`) — no shared conversation.
4. **Graceful degradation:** unstaged workflows and single-backend configs behave byte-identically to today.

**On-strategy.** `STRATEGY.md#tracks` lists "**per-skill / per-cognitive-mode backend routing**" as a current capability — design=thinking-mode → reasoner is exactly that.

**Out of scope.** Cross-machine handoff; the config-only thinking fixes (`routing.intelligence.sel/pesl → reasoning`, `workflowGates: primary`, model choice) which need no code; a new parallel `phaseBackends` staging mechanism (explicitly rejected in Decisions).

## Decisions made

- **D1 — Finish the staged engine, don't add a parallel mechanism.** Wire the stubbed per-stage backend resolver (`execute-workflow.ts:71`) instead of adding a separate `phaseBackends` staging path to the single-dispatch flow. _Why:_ the codebase already committed to this ("Phase 2 replaces with route()"); a second staging mechanism would duplicate/drift against the staged engine.
- **D2 — Route by `cognitiveMode` through the existing `BackendRouter`.** Stages already carry `cognitiveMode`/`routingHint` (seeded at `execute-workflow.ts:156-161`); `ResolutionSource` already includes `'mode'` (`packages/types/src/orchestrator.ts:821`). _Why:_ on-strategy, minimal new surface.
- **D3 — Config surface = extend the existing Spec B `routing` (`mode`/`skills`, `RoutingValue`), not a new field.** `RoutingConfig` already has a `mode` section (`packages/types/src/orchestrator.ts:762`). _Why:_ one canonical routing model.
- **D4 — Handoff = the staged engine's shared workspace + `proposal.md`/plan + `handoff.json`.** Extend `HandoffSchema` (`packages/core/src/state/types.ts:13`) only if a spec/plan _path_ turns out to be needed (artifacts are in the shared workspace). _Why:_ reuse; avoid schema churn.
- **D5 — Graceful degradation is a hard requirement.** Unstaged workflows and single-backend configs are byte-identical to today.
- **D6 — Local-first scope.** Ship a staged decl for the local pipeline; the Claude single-dispatch path is unchanged.

## Technical design

**The stub to finish.** `packages/orchestrator/src/workflow/execute-workflow.ts:71-72` — `resolveStageBackend(step)` currently returns a single backend. Wire it to resolve per stage via the `BackendRouter`: build a routing request from the step (its `cognitiveMode`, `skill`, `routingHint` — already assembled at `execute-workflow.ts:147-161`), call `route()`, and derive the backend from `decision.backendName`. The engine then dispatches that stage via `makeRunner(backend).runSession` (`execute-workflow.ts:55-70`) — backend-agnostic, so local/ollama works.

**Staged workflow declaration.** Add a `StagedWorkflowDecl` (`packages/types/src/orchestrator.ts:1126`, declared in `WorkflowConfig.workflows`) for the local pipeline:

- design stages: `{ skill: harness-brainstorming, cognitiveMode: thinking }`, `{ skill: harness-planning, cognitiveMode: thinking }`
- execution stages: `{ skill: harness-execution }`, `{ skill: harness-verification }`
- all pinned to one `coherenceUnit` (shared escalation floor, D2 of the staged spec).

**Routing config.** `routing.mode.thinking → <reasoning backend>`; `routing.default`/execution → `<coder backend>`. Backends stay in `agent.backends` (e.g. `local-reason: qwen3:32b, disableReasoning:false` and `local: qwen3-coder:30b`).

**Handoff.** Stages share `workspacePath`; design stages write `proposal.md` + the plan; execution stages read them plus `priorOutputs`. `handoff.json` carries `phase`/`summary`/`decisions` across stages.

**Validation.** Extend `validateWorkflowConfig` to require routed backend names exist in `agent.backends` — mirroring the existing `workflowGates` validation.

## Integration Points

- **Entry Points.** No new CLI/MCP surface. Extends the staged-workflow engine + `routing` config. New: an optional staged workflow decl for the local pipeline + `routing.mode` entries.
- **Registrations Required.** None beyond the config/decl (config-driven; no barrel/route registration).
- **Documentation Updates.** `docs/guides/multi-backend-routing.md` — add a per-cognitive-mode / per-phase routing section. A note in `harness.orchestrator.local.md` on the staged design/execution split.
- **Architectural Decisions.** **D1** (finish the staged engine vs. a parallel staging mechanism) warrants a standalone ADR — it settles _the_ routing-architecture direction. **D2** (route by `cognitiveMode`) may fold into the same ADR.
- **Knowledge Impact.** Concept: "per-phase / per-cognitive-mode backend routing." Relationship: `design-phase → thinking-tier`, `execution-phase → coder-tier`.

## Success Criteria

- **SC1** A staged workflow whose design stages carry `cognitiveMode: thinking` dispatches those stages to `routing.mode.thinking`'s backend and execution stages to the default backend — verified via a unit test on the un-stubbed `resolveStageBackend` + `route()`.
- **SC2** The execution stage (a fresh backend session) reads the design output (`proposal.md`/plan) from the shared workspace and completes — staged integration test asserting the exec stage sees prior artifacts.
- **SC3** Unstaged workflows and single-backend configs behave byte-identically to today — the existing single-dispatch tests stay green (no regression).
- **SC4** A routed backend name absent from `agent.backends` fails `validateWorkflowConfig` with a clear error.
- **SC5** `handoff.json` carries `phase`/`summary`/`decisions` across the design→execution boundary.
- **SC6** The routing telemetry (`RoutingDecision`) records `resolutionPath` source `'mode'` for the routed stages.

## Implementation Order

1. **Verify staged-path local readiness** — confirm `executeWorkflow` runs the local pipeline end-to-end via `runSession` (the local `harness skill run` flow) — and write a _failing_ test for per-stage routing by `cognitiveMode`.
2. **Un-stub `resolveStageBackend`** → resolve per stage via `BackendRouter.route()` using `cognitiveMode`/`skill`/`routingHint`; add validation that routed backend names exist.
3. **Add the local staged workflow decl** + `routing.mode` config (design→reasoner, exec→coder).
4. **Handoff wiring** — confirm the execution stage reads the shared-workspace artifacts; extend `HandoffSchema` only if a spec/plan path is required.
5. **Stage-specific prompts** (design vs execution) only if the default stage template is insufficient.
6. **Docs + ADR + tests**, including the graceful-degradation regression tests (SC3).

## Reconciliation (verified against the current tree during planning)

This spec was drafted against the `execute-workflow.ts:71` stub comment ("Phase 2 replaces
with `route()`"). Planning verified the **actual** code and found that comment **stale** —
several items were already shipped:

- **Steps 1–2 (un-stub `resolveStageBackend`; validate routed backend names) — ALREADY SHIPPED.**
  Per-stage routing already runs through `ctx.adaptiveRouter.route(buildStageRequest(...))`
  (`execute-workflow.ts:347-386`); `resolveStageBackend` is now only the identity fallback when
  no router is present. Routed-backend-name validation already exists (`config.ts`
  `crossFieldRoutingIssues`, `backend-router.ts` `validateReferences`, over `routing.modes`).
- **Step 3 (routing config/types) — TYPE ALREADY SHIPPED as `routing.modes` (plural).** `route()`
  already consults it and `StagedWorkflowDecl` + its Zod schema exist. What was missing was a
  **concrete decl + `routing.modes.thinking` entry** in the config artifacts, not new types.

**What was actually built** (the genuine remaining gaps): the **local-aware stage prompt** (the
Phase-0 finding — the staged prompt lacked the local `harness skill run --autonomous` indirection;
required a `renderStagePrompt` seam change + an `isLocalBackend` resolver), **staged-decl
`cognitiveMode` routing-coverage validation** (SC4′), the **concrete local staged decl +
`routing.modes.thinking`** in both config copies, and **docs + ADR 0074 + SC1–SC6 tests** including
the SC3 graceful-degradation regression pins. `HandoffSchema` needed no change (the `priorOutputs`
text channel already bridges prior-stage artifacts). The design phase routes to a **local reasoner**
(fully-local, correct thinking) per the approved Task-9 decision.
