---
number: 0029
title: Per-skill and per-cognitive-mode routing axes
date: 2026-05-26
status: accepted
tier: medium
source: docs/changes/granular-task-routing/proposal.md
---

## Context

Pre-Spec-B orchestrator routing keyed on a small fixed set of use cases: scope tier (`quick-fix`, `guided-change`, `full-exploration`, `diagnostic`), intelligence layer (`sel`, `pesl`), and isolation tier. Every skill at the same scope tier dispatched to the same backend. Two emerging needs broke this assumption:

1. **Cost insurance.** Cloud LLM rate caps and pricing pressure require selectively re-routing specific skills (e.g., `harness-debugging`, `harness-soundness-review`) to local backends without rerouting all skills at the same tier.
2. **Task fitness.** Skills carry wildly different cognitive demands. An adversarial reviewer benefits from a cheap fast model; a constructive architect benefits from a more capable model. The orchestrator already labels skills with `cognitive_mode` in skill.yaml; that label can drive routing if the schema admits a per-mode axis.

The pre-Spec-B schema could express neither.

## Decision

Extend `RoutingUseCase` and `RoutingConfig` with two new axes:

- **Per-skill:** `RoutingUseCase` gains `{ kind: 'skill'; skillName: string; cognitiveMode?: string }`; `RoutingConfig.skills?: Record<string, RoutingValue>` maps skill names to backend names or fallback chains.
- **Per-cognitive-mode:** `RoutingUseCase` gains `{ kind: 'mode'; cognitiveMode: string }`; `RoutingConfig.modes?: Record<string, RoutingValue>` maps cognitive-mode identifiers to backend names or fallback chains.

Both axes are optional. Configs that omit `routing.skills` and `routing.modes` continue to behave identically to pre-Spec-B (S1 in spec § Success Criteria).

## Consequences

**Positive:**

- Operators can pin individual skills to specific backends (cost insurance) without affecting other skills at the same scope tier.
- Cognitive mode (6 standard values) provides a coarser semantic layer that handles common cases ("all reviewer work goes cheap") without per-skill config bloat.
- Hybrid coverage: per-skill handles the precise case, per-mode handles the cross-cutting case, operators pick the granularity per route.

**Negative:**

- Two new axes increase the routing-schema surface; operators must understand the resolution order (see ADR 0030) to predict which axis wins for a given dispatch.
- Skill catalog must be enumerable at orchestrator startup for validation warnings (spec assumption line 40).

**Neutral:**

- Validation extension: every name referenced under `routing.skills.*` and `routing.modes.*` must exist in `agent.backends` (hard error); unknown skill names produce a startup warning (decision D10).
- LMLM (Spec A) composes cleanly: routing entries reference backend names, LMLM auto-populates the model within each backend. Spec B requires no LMLM-specific code (spec § Integration with LMLM).
