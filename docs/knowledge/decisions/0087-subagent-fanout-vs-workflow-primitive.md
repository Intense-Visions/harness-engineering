---
number: 0087
title: Subagent worktree fan-out (vs the Workflow primitive) for -fleet execution
date: 2026-08-07
status: accepted
tier: large
source: docs/changes/roadmap-fleet/proposal.md
---

## Context

The `-fleet` family of skills executes a batch of independent work items autonomously
and returns a set of reviewable artifacts (for `roadmap-fleet`, merge-ready PRs). Each item
runs the **real** per-item harness pipeline — `harness-brainstorming` then `harness-autopilot`
in autonomous mode — so the batch must dispatch many pipelines concurrently, isolate them from
one another, collect their results, and verify each independently.

There are two credible ways to drive that fan-out:

1. **Model-driven subagent fan-out.** The skill instructs the orchestrating agent to spawn
   worktree-isolated subagents, one per item, each briefed to run the per-item pipeline; the
   orchestrator collects branches and verifies them. This is prose in a `SKILL.md` — portable
   to any platform that can run the skill, and identical to the fan-out precedent already
   shipped by `harness-audit` (parallel worktree-isolated agents, one per dimension).

2. **A deterministic `Workflow` primitive.** A first-class, engine-executed workflow object
   with declared steps, typed inputs/outputs, resumable checkpoints, and deterministic
   scheduling. Theoretically cleaner: resumable after a crash, replayable, and inspectable as a
   value rather than as instructions the model must follow.

The pattern this skill codifies was proven by executing roughly ten candidates by hand in a
single session, using subagent fan-out with a concurrency cap — it produced verified,
merge-ready PRs. The `Workflow` primitive does not yet exist as a stable, portable authoring
surface.

## Decision

**v1 executes `-fleet` fan-out via model-driven subagent worktree isolation.** The skill body
instructs the orchestrator to spawn one worktree-isolated subagent per confirmed item, cap
concurrency at the machine-storm limit (~2–3), collect returned branches, and verify each
independently. Selection and ordering reuse `harness-roadmap-pilot`'s impact scoring rather
than an ad-hoc ranker, and execution reuses the existing worktree-isolation primitive that
`harness-audit` already relies on for its parallel agents.

The `Workflow` primitive is **named as the future upgrade** for deterministic, resumable
execution — but is explicitly deferred. When it exists as a stable, portable authoring surface,
`-fleet` execution can migrate to it behind the same five-phase contract, because the phase
boundaries (SELECT → CONFIRM → DISPATCH → VERIFY → REPORT) are engine-agnostic.

## Consequences

- **Positive:** ships the proven pattern now, on a portable authoring surface (a `SKILL.md`)
  that runs anywhere the skill runs; reuses two already-vetted primitives (roadmap-pilot
  scoring, worktree-isolated fan-out) instead of building new machinery; the fan-out precedent
  and its guardrails are already exercised by `harness-audit`.
- **Negative / tradeoffs:** model-driven fan-out is **not deterministically resumable** — a
  crash mid-batch is recovered by re-running SELECT/VERIFY over the surviving branches, not by
  replaying a checkpointed workflow; scheduling and concurrency are enforced by prose discipline
  (the governor) rather than by an engine; there is no typed step contract the runtime can check.
- **Reversibility:** high. The five-phase contract is engine-agnostic, so a later migration to
  the `Workflow` primitive is an execution-layer swap that leaves the skill's interface, its
  verification invariants, and its interaction model unchanged. Superseding this ADR requires the
  `Workflow` primitive to exist as a stable, portable surface plus a migration of the first
  `-fleet` instance.

## Alternatives Considered

- **Build the `Workflow` primitive first, then author `-fleet` on top of it.** Rejected for v1 —
  it blocks a proven, shippable pattern on unbuilt engine machinery, and the primitive is heavier
  to author and less portable than skill prose. Named as the future upgrade instead.
- **Ad-hoc ranking instead of roadmap-pilot scoring for selection.** Rejected — selection would
  be unprincipled and irreproducible; reusing the roadmap system's own impact scoring makes the
  batch order defensible.
- **Unbounded concurrency.** Rejected — beyond ~3 concurrent build agents the compound load
  produces flaky failures indistinguishable from real ones (the machine-storm limit observed in
  the reference run). The governor is a hard part of the fan-out design, not a tuning knob.

## References

- Source proposal: `docs/changes/roadmap-fleet/proposal.md`.
- Fan-out prior art: `agents/skills/claude-code/harness-audit/SKILL.md` (parallel worktree-isolated agents, one per unit of work).
- Reused primitives: `harness-roadmap-pilot` (impact scoring), the worktree-isolation fan-out primitive.
- Companion: [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md) — the shared `-fleet` interaction model.
- Skill: `agents/skills/claude-code/roadmap-fleet/SKILL.md`.
