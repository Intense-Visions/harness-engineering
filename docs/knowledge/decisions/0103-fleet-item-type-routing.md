---
number: 0103
title: Item-type routing for build-shaped fleet members
date: 2026-08-26
status: accepted
tier: medium
source: docs/changes/fleet-item-type-routing/proposal.md
---

## Context

The build-shaped `-fleet` members — `roadmap-fleet` and `security-fleet` — run a single hardcoded
per-item pipeline: `harness-brainstorming → harness-autopilot`
(`roadmap-fleet/SKILL.md:88`, `security-fleet/SKILL.md:114`). That pipeline is the design-first
path: brainstorming authors a spec, autopilot executes it phase by phase. It is correct for a new
feature that needs design decisions, and wrong for a bug with a known or investigable root cause.

A bug does not need a spec; it needs a diagnosis. Forced through the build pipeline it acquires
design ceremony it does not need, then stalls in autopilot, which has no `## Implementation Order`
to parse (`harness-autopilot/SKILL.md:406`). The harness already owns the correct pipeline for this
case — `harness-debugging` — and already routes to it from `bug-fleet` and `cicd-fleet`. It even
already owns the classification rubric that decides feature-vs-bug: `harness-router/SKILL.md:37-57`
maps `full-exploration → brainstorming`, `diagnostic → debugging`. But that rubric drives an
interactive single dispatch and is consumed by no fleet.

So the build-shaped members lack an awareness the rest of the system already has: **which pipeline
an item needs depends on the item's type, and the machinery to decide and to execute both paths
already exists.** The question this ADR settles is how the fleets acquire that awareness without
each inventing its own divergent rubric.

## Decision

Build-shaped `-fleet` members **classify each item by type and route it to the matching pipeline**,
against a rubric stated **once** for the family. This ADR is the canonical statement; members
reference it rather than restating it.

1. **One canonical rubric in `docs/reference/fleet-family.md`.** The routing rubric lives in the
   shared spine document. The two build-fleets reference it; neither carries a copy that can drift
   from the other — consistent with how ADR 0087 and ADR 0088 codify family policy as a referenced
   canonical statement.

2. **A three-way target map.** Only three routes are load-bearing for autonomous, per-item-loop-free
   fleets:
   - `bug` / diagnostic → `harness-debugging`
   - `spec-ready` (an approved spec already exists) → `harness-autopilot`
   - `new-feature` / ambiguous → `harness-brainstorming → harness-autopilot`

   The router's other two scopes (`quick-fix → tdd`, `guided-change → planning`) are deliberately
   **not** ported: they presuppose an interactive human loop the fleets do not have, and porting
   them would be speculative surface with no stated requirement.

3. **Classify at SELECT, surface in CONFIRM, execute in DISPATCH, verify per-route in VERIFY.**
   Classification is a per-item property set in SELECT by a **metadata-first, rubric-fallback** rule
   (explicit issue label / roadmap kind → spec presence → router rubric by judgment). It is shown to
   the human in the one CONFIRM gate as an **overridable** decision, executed as the routed pipeline
   in DISPATCH, and checked in VERIFY against **route-dependent** artifacts — a plan directory for
   feature/spec-ready routes, a reproducing test plus `stages=[debugging]` provenance for the bug
   route (a debugging run leaves no `plans/` directory, so a route-blind VERIFY would reject every
   correctly-debugged item).

`bug-fleet`, `cicd-fleet`, and the non-build members are unchanged: they already run the correct
per-item pipeline for their queue.

## Consequences

- **Positive:** a bug tracked as a roadmap row or a bounded vulnerability is diagnosed by the skill
  built for it instead of stalling in a design pipeline; the routing decision is visible and
  correctable at the existing CONFIRM gate before any lane fans out; the rubric exists once, so the
  two fleets cannot drift; the change reuses `harness-debugging`, `harness-autopilot`, and the
  router's rubric rather than adding machinery.
- **Negative / tradeoffs:** VERIFY becomes route-aware — the artifact it requires now depends on the
  route taken, which is a small amount of added conditional discipline that must stay in sync with
  the route set (the alternative, a route-blind artifact check, silently rejects correctly-debugged
  items). Classification via the fallback rubric is heuristic; the CONFIRM override is the backstop
  that keeps a misclassification from wasting a lane.
- **Reversibility:** high — the routing is interaction/dispatch policy expressed in skill prose and
  one shared-doc section, tunable per member without changing execution architecture. Superseding it
  requires a replacement ADR the build-shaped members adopt.

## Alternatives Considered

- **Point the fleets at `harness-router`'s rubric directly.** Rejected — the router maps two scopes
  (`quick-fix → tdd`, `guided-change → planning`) this decision deliberately drops, so a fleet would
  reference the table then override half of it, and it couples autonomous fleets to an interactive,
  human-confirmed skill's internals.
- **Centralize routing in `harness-roadmap-pilot` and have fleets delegate per item.** Rejected —
  fleets do not call roadmap-pilot per item (they invoke the pipeline directly), and `security-fleet`
  does not use roadmap-pilot at all; this rearchitects the fleet → skill call path for a
  doc-and-dispatch-level problem.
- **Restate the rubric independently in each build-fleet.** Rejected — guarantees drift across the
  family, the exact failure a single canonical statement exists to prevent.
- **Keep the single hardcoded pipeline and let autopilot fall back to debugging internally.**
  Rejected — autopilot has no such fallback and the spec-first assumption is why roadmap-fleet
  prepends brainstorming; teaching autopilot to detect and re-route bugs mid-run pushes routing into
  the wrong layer.

## References

- Source proposal: `docs/changes/fleet-item-type-routing/proposal.md`.
- Canonical rubric: `docs/reference/fleet-family.md` (§Item-type routing).
- Companions: [`0087-subagent-fanout-vs-workflow-primitive.md`](0087-subagent-fanout-vs-workflow-primitive.md) and [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md) — the family policies this one sits beside.
- Reused rubric source: `agents/skills/claude-code/harness-router/SKILL.md` (scope-classification table).
- First instances: `agents/skills/claude-code/roadmap-fleet/SKILL.md` and `agents/skills/claude-code/security-fleet/SKILL.md` (SELECT classification, DISPATCH routed pipeline, VERIFY route-aware artifact).
