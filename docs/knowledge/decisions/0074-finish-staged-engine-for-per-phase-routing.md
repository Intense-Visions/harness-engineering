---
number: 0074
title: Finish the staged engine for per-phase backend routing
date: 2026-07-17
status: accepted
tier: integration
source: docs/changes/phase-backend-routing/proposal.md
---

## Context

Spec B Phase 2 set out to route a staged local workflow's **design** stages to a
reasoning backend and its **execution** stages to a coder backend. The spec was
written against an older tree; by the time this work began, most of the machinery
was already shipped:

- Per-stage routing already runs through `ctx.adaptiveRouter.route(buildStageRequest(...))`
  (`packages/orchestrator/src/workflow/execute-workflow.ts`); `resolveStageBackend`
  is now only the identity fallback when no `adaptiveRouter` is present.
- `buildStageRequest` already seeds `cognitiveMode`/`routingHint` from the step, and
  `BackendRouter.route()` already consults `routing.modes.<mode>`.
- `routing.modes` (plural) is the type; `StagedWorkflowDecl` + its schema exist.
- Routed-backend-name existence is validated in two places
  (`crossFieldRoutingIssues`, `BackendRouter.validateReferences`).

The genuine remaining gaps were narrower than the spec's literal task list:

1. **The stage prompt was Claude-shaped.** `renderStagePromptFactory` rendered only
   `STAGE_PROMPT_TEMPLATE` ("Perform the '{{ skill }}' step"), which assumes the
   agent has `/harness:*` slash commands and harness MCP tools. A local-endpoint
   backend (`local`/`pi`/`ollama`) has neither — it must obtain the real skill over
   bash via `harness skill run <skill> --autonomous`.
2. **A staged decl could declare a `cognitiveMode` with no `routing.modes` mapping**
   and silently fall through to `routing.default`, defeating the design/execution
   split with no error.
3. **No concrete local staged decl / `routing.modes.thinking` config artifact**
   existed to exercise the path.

## Decision

**D1 — Finish and adopt the staged engine + `BackendRouter.route()` per stage** as
the single per-phase routing model, rather than building a parallel `phaseBackends`
mechanism. There is one canonical routing path (`route()` keyed on the stage's
`RoutingUseCase`), and per-phase routing is expressed entirely through existing
surfaces: a staged decl tags each stage's `cognitiveMode`, and `routing.modes`
maps a mode to a backend.

**D2 — Route by `cognitiveMode` through `routing.modes`.** Design stages carry
`cognitiveMode: thinking` and resolve to `routing.modes.thinking`; execution stages
carry no `cognitiveMode` and resolve to `routing.default`.

To make D1/D2 real for a local backend, the stage-prompt renderer became
backend-locality-aware: a new optional `isLocalBackend` param on the
`renderStagePrompt` seam plus a `ctx.isLocalBackend(backend)` resolver
(name → `BackendDef` → `isLocalEndpointBackend`) select a local-indirection
template (`LOCAL_STAGE_PROMPT_TEMPLATE`) for local-endpoint stages, else the
byte-identical default. `validateWorkflowConfig` now rejects a staged-decl stage
whose `cognitiveMode` has no `routing.modes`/`routing.skills` mapping.

## Consequences

- One canonical routing model — no second `phaseBackends` code path to keep in sync.
- A local backend routed into a staged workflow now runs the real skills over the
  `harness skill run --autonomous` indirection instead of being told to "perform the
  skill" it cannot invoke.
- A misconfigured staged decl (cognitiveMode with no mapping) fails at config-load
  with a clear error, instead of silently falling back to `routing.default`.
- **Graceful degradation (SC3) is preserved:** unstaged workflows and
  single-backend configs behave byte-identically. The `renderStagePrompt` seam kept
  its optional shape and its "no renderer ⇒ bare skill name" fallback; an absent
  `isLocalBackend` resolver ⇒ non-local ⇒ default template. No existing
  single-dispatch/workflow test changed an assertion.

## Alternatives rejected

- **A parallel `phaseBackends` staging path.** A separate per-phase backend map
  bolted onto dispatch would duplicate the routing logic `route()` already owns,
  fork validation/telemetry, and create two ways to express the same intent.
  Rejected in favor of finishing the one staged engine (D1).
- **A new HandoffSchema field for prior-stage artifacts.** The shared-workspace +
  `priorOutputs` text channel already threads prior-stage output into the next
  stage's prompt; no schema change was needed (D4).
