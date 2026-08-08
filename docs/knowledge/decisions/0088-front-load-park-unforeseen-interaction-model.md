---
number: 0088
title: The front-load / park-unforeseen interaction model for the -fleet family
date: 2026-08-07
status: accepted
tier: large
source: docs/changes/roadmap-fleet/proposal.md
---

## Context

A `-fleet` skill runs a batch of work items autonomously and hands the human a set of artifacts
to review in bulk. The whole value proposition is moving the human from "present at every
per-item decision" to "confirm the batch once, review the output once." That only holds if the
skill has a disciplined answer to the unavoidable question: **when may a batch pause for a human,
and when must it decide for itself?**

Two failure modes bound the design. Pause too eagerly — surface every small choice — and the
fleet is no better than driving each item by hand; the human is back in the loop constantly.
Guess too eagerly — silently resolve genuinely-ambiguous choices to keep moving — and the batch
produces PRs built on unstated, possibly-wrong assumptions that the reviewer cannot see and
cannot trust. The reference run that proved this pattern kept rework low precisely because it
front-loaded the genuinely-ambiguous decisions and let everything else flow.

This interaction model is not specific to `roadmap-fleet`. Every `-fleet` member (intake, decide,
build, land) faces the same pause-vs-decide question, so the model must be stated once and
referenced, not re-derived per skill.

## Decision

The `-fleet` family adopts a **front-load, autonomous-default, park-unforeseen** interaction
model, and **this ADR is its canonical statement** — other family members reference this ADR
rather than restating the model.

1. **Front-load every _known_ fork into one up-front batched round.** A triage/selection pass
   detects the decision forks that are visible before execution (ambiguities in the issue/spec
   text). All of them are presented to the human together, as multiple-choice questions with
   recommended defaults, in the **single guaranteed human touchpoint before review** — the same
   round that confirms the batch scope and the proposed concurrency.

2. **Run autonomously on recommended-option defaults thereafter.** After that gate the batch
   does not pause per item. Anything routine is decided on the recommended default without
   asking.

3. **Park — never guess — an _unforeseen_ mid-flight fork.** If an item encounters a genuinely
   new decision fork that was not surfaced up front and that materially changes the outcome, that
   **one item parks and reports** the fork. Parking is per-item: the rest of the batch continues
   uninterrupted. The parked fork is surfaced to the human in the final report; it is never
   silently guessed into an artifact.

4. **Every output carries an "assumptions made" note.** Each artifact records the
   recommended-option defaults taken during autonomous execution, so bulk review is grounded —
   a reviewer can see exactly what was assumed without re-deriving it.

## Consequences

- **Positive:** the human's attention is spent once, on the genuinely-ambiguous decisions,
  instead of on routine confirmations; wrong-guess rework is minimized because ambiguous items are
  resolved before work starts; no single item's fork ever stalls the batch; the "assumptions made"
  note makes deferred bulk review trustworthy; stating the model once keeps every `-fleet` member
  consistent.
- **Negative / tradeoffs:** fork **detection** is heuristic — a fork mistaken for "routine" is
  decided on a default rather than asked, which is why the assumptions note (surfacing what was
  assumed) and the park path (catching the material unforeseen forks) are both mandatory backstops;
  parking trades throughput for correctness on the affected item (it waits for a human) rather than
  guessing to finish.
- **Reversibility:** high — the model is interaction policy expressed in skill prose, tunable per
  member (e.g. how aggressively forks are detected) without changing execution architecture.
  Superseding it requires a replacement ADR the whole family adopts.

## Alternatives Considered

- **Pause on every decision (fully interactive).** Rejected — it defeats the fleet's purpose;
  the human becomes the per-item bottleneck the family exists to remove.
- **Fully autonomous, guess everything (no parking).** Rejected — genuinely-ambiguous forks get
  silently resolved into artifacts, producing unstated assumptions a bulk reviewer cannot detect
  and rework churn the reference run specifically avoided.
- **Per-item interactive checkpoints scattered through execution.** Rejected — spreads the human
  touchpoints across the run instead of batching them, so the human can never step away; the model
  deliberately collapses all known forks into one gate.
- **Restate the model independently in each `-fleet` skill.** Rejected — guarantees drift across
  the family; a single canonical ADR that the others reference keeps them aligned.

## References

- Source proposal: `docs/changes/roadmap-fleet/proposal.md`.
- Companion: [`0087-subagent-fanout-vs-workflow-primitive.md`](0087-subagent-fanout-vs-workflow-primitive.md) — the execution architecture the model runs on.
- First instance: `agents/skills/claude-code/roadmap-fleet/SKILL.md` (CONFIRM gate, DISPATCH fork-parking, REPORT assumptions note).
- Family overview: `docs/guides/features-overview.md` (the `-fleet` family section).
