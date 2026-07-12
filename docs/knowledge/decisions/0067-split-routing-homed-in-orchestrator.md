---
number: 0067
title: Split-routing is homed in the orchestrator (not core/review)
date: 2026-07-11
status: accepted
tier: medium
source: docs/changes/split-routing/proposal.md
---

## Context

Split-routing runs a coherence unit as a multi-stage workflow, routing each stage
independently through the Adaptive Model Router (AMR) at its own required tier. A
recurring question during design was **where this lives**: alongside the
synchronous `core/review` dimension agents, or in the orchestrator where AMR
already lives.

Two structural facts settle it:

- The `core/review` dimension agents (`fan-out.ts:22-45`) are **synchronous
  heuristics with no model** — they score a diff along fixed dimensions without
  ever dispatching an agent or spending a token. Staged routing, by contrast, is
  fundamentally about **dispatching a real per-stage agent through the AMR** and
  settling the unit's lifecycle. It is not a review dimension.
- The layer rule forbids `core` from importing `orchestrator`. The AMR
  (`AdaptiveRouter`, `EscalationState`, the backend factory), the dispatch state
  machine, the recorder, and the workspace manager all live in the orchestrator.
  Homing split-routing in `core` would require re-implementing or inverting all of
  that machinery across the layer boundary — a large, cycle-risking duplication.

## Decision

Split-routing is **homed in the orchestrator**, where AMR and the dispatch state
machine already live. The stage-execution engine (`workflow/execute-workflow.ts`)
is a pure, orchestrator-side module that consumes a narrow `WorkflowEngineContext`
seam; the orchestrator composes the **real** context (`buildWorkflowContext`) from
its own machinery — a real `AgentRunner` per stage via the backend factory, the
unit's one reused worktree, the real `AdaptiveRouter` (or identity fallback), a
per-stage recorder, and the two terminal settle seams.

Crucially, the engine module **never imports `orchestrator.ts`** (a layer cycle);
the context is built from a dependency bag the orchestrator passes in. This keeps
the engine unit-testable against a fake context while the orchestrator owns the
live wiring behind the doubly-opt-in `>= 2`-stage gate.

The workflow engine is the orchestrator-side path along which staged _review_ can
later be built (a review dimension could become a workflow stage), but that is a
future consumer — the home decision is independent of it.

## Consequences

- The engine reuses AMR, the recorder, the backend factory, and the dispatch state
  machine directly (same-layer), with no cross-layer duplication.
- `core` stays free of orchestrator dependencies; the layer rule holds.
- The dependency-bag seam (`buildWorkflowContext(deps)`) is the single boundary the
  layer-cycle guard (`check-deps`) enforces: the engine and its context import only
  same-layer siblings (`agent/runner`, `agent/orchestrator-backend-factory` types,
  `core/stream-recorder`), never `orchestrator.ts`.
- Any future staged-review consumer builds on this orchestrator-side engine rather
  than re-homing it.

## Links

- Spec: `docs/changes/split-routing/proposal.md` (rev-2)
- Plan: `docs/changes/split-routing/plans/2026-07-11-phase-4-optin-producer-wiring-plan.md`
- Related: ADR 0068 (per-stage session ownership), ADR 0065 (separated failure
  mechanisms), ADR 0066 (mid-workflow error is terminal)
