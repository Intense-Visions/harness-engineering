---
number: 0043
title: Roadmap state-transition rules live in core, not skill markdown
date: 2026-06-24
status: accepted
tier: medium
source: docs/changes/brainstorm-auto-promote/proposal.md
---

## Context

The promotion behavior — which roadmap states may transition where, when to refuse, what
fields to write versus preserve, how to rank typo suggestions — is a set of business rules.
Those rules must hold identically across every caller: `harness-brainstorming` today,
autopilot and the dashboard later, and across both roadmap storage modes (file-backed and
file-less).

The tempting place to put "what the skill does on each outcome" is the skill's SKILL.md
prose: a table of `if backlog then …, if in-progress then refuse …`. But markdown is
untestable, unreusable, and drifts independently across the four platform variants. Putting
the decision logic there would force every future caller to reimplement — and subtly
diverge from — the same state machine.

## Decision

The state-transition rules live in `@harness-engineering/core` as the pure function
`promoteFeature(roadmap, args) → { result, nextRoadmap }`
(`packages/core/src/roadmap/promote.ts`). It is IO-free, fully unit-tested against the D2
state matrix, D4 idempotency cases, and D5 field-write policy, and exported from the core
roadmap barrel.

Every caller orchestrates; none decides:

- The file-mode MCP handler parses the roadmap, calls `promoteFeature`, and serializes the
  returned `nextRoadmap` on success.
- The file-less MCP handler builds an in-memory roadmap from the tracker, calls the same
  `promoteFeature`, and translates the single changed row into a `RoadmapTrackerClient.update`.
- The brainstorming SKILL.md only maps the returned envelope to a human message and decides
  whether to commit or STOP — it contains no state-transition logic.

This mirrors the harness thesis: business rules that hold across callers are encoded as
tested code (constraints-as-code), and markdown orchestrates rather than decides.

## Consequences

- **Positive:** one tested source of truth. File and file-less modes cannot diverge on the
  rules because they call the same function.
- **Positive:** future callers (autopilot, dashboard) consume `promoteFeature` directly;
  they inherit the rules for free instead of re-encoding them.
- **Positive:** the rules are exercised by exhaustive table tests, not validated by reading
  prose.
- **Negative:** a thin translation layer is required in each handler (file write vs. tracker
  update). Acceptable — translation is mechanical and the decision logic is not duplicated.
- **Boundary:** the pure core returns only results it can produce; IO failures (`write-failed`)
  are added by the MCP handler, which owns parse/serialize/write. See
  [ADR 0042](0042-roadmap-action-structured-envelopes.md) for the envelope shape.
