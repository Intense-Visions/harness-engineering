---
number: 0118
title: At queue depth <=1 the "never shed the lander" rule wins; pr-fleet's single-PR guidance is advisory under the conductor
date: 2026-08-31
status: proposed
tier: medium
source: 'decision-blocked issue #1316'
---

## Context

Two rules in the `-fleet` family contradict each other at queue depth 1:

- **`fleet-command`'s wave shape says the lander is never shed.** The land stage is
  terminal and always scheduled so that whatever the run built actually gets landed
  (ADR 0091; `docs/reference/fleet-family.md`, the conveyor's terminal land wave).
- **`pr-fleet`'s own "When to Use" says NOT for a single PR** — its overhead (worktree
  fan-out, review-assist subagents) only pays off across a batch; for one PR you review
  and land it directly.

There is **no tiebreak**. A run with exactly one open PR satisfies one rule only by
violating the other: schedule the lander (violating pr-fleet's single-PR guidance) or
honor the single-PR guidance (violating never-shed-the-lander).

The first `fleet-command` run avoided noticing this **by luck**. The PR queue emptied
mid-SELECT — PR #1256 merged while sibling probes were still running — so the lane was
recorded as _unscheduled for empty queue_ rather than _shed_, which happens to satisfy
both rules at once. A depth of **exactly 1 at authorization time** would have hit the
contradiction squarely, and the conductor would have had no stated rule to resolve it.

The two rules are not actually in conflict once their **motivations** are separated.
`pr-fleet`'s single-PR guidance is an **efficiency** rule — don't stand up a fleet's
machinery for one item. The conductor's never-shed-the-lander is a **completeness** rule —
the run must land whatever it built, terminally, regardless of batch size. When a member's
efficiency guidance is read as binding on the conductor, a completeness guarantee gets
sacrificed to an efficiency heuristic. The fix is to state which motivation governs when
the conductor is the caller.

## Decision

**At queue depth <=1, "never shed the lander" wins: the conductor always schedules
`pr-fleet` in the terminal land wave regardless of depth, and `pr-fleet`'s own
"NOT for a single PR" guidance is advisory — it applies to direct human invocation, not
to invocation by the conductor.**

Rationale: the conductor's reason for scheduling the lander last is **completeness**
(land whatever the upstream waves built), not per-invocation efficiency. A member's
efficiency-motivated guidance does not bind the caller whose contract is completeness. For
a **direct human** `pr-fleet` invocation the single-PR guidance still holds — a human with
one PR should just review and land it rather than spin up the fleet.

Separately, and as a **mechanical follow-up routed to build (not the architectural core of
this ADR)**: `pr-fleet` SELECT should read each PR's `mergeStateStatus` and
`reviewDecision` so an **unlandable** single-PR queue surfaces at CONFIRM rather than at
the terminal wave. Depth alone does not distinguish "one PR ready to land" from "one PR
that cannot land" (blocked, behind base, awaiting required review); reading merge/review
state at SELECT lets the conductor present that distinction in the once-only round instead
of discovering it after every upstream wave has run.

**Assumptions made (recommended-option defaults):** the recommended default from #1316 —
"never shed" wins and the member's single-PR guidance is advisory under the conductor — is
adopted as decided; the `mergeStateStatus`/`reviewDecision` SELECT read is scoped **out**
of this ADR's decision and recorded as a build follow-up (it is a SELECT enhancement, not
a scheduling-rule decision), so this ADR does not block on it.

## Consequences

- **Positive:** the latent contradiction is removed; the conductor has a stated rule and
  always honors the completeness guarantee — a single built-and-ready PR is never stranded
  because a member's efficiency heuristic shed the lander. The member's standalone guidance
  stays valid for the human-invocation case it was written for.
- **Negative / tradeoffs:** the conductor may spin up `pr-fleet`'s machinery for a single
  PR that then turns out to be **unlandable**, paying fan-out cost for no landing. That
  waste is exactly what the separate `mergeStateStatus`/`reviewDecision` SELECT read
  mitigates by surfacing unlandability at CONFIRM — so this ADR names that follow-up even
  though it does not decide it.
- **Reversibility:** high. The tiebreak is a one-line scheduling rule plus the
  advisory-scoping of the member's guidance; re-tuning it (e.g. shedding the lander at
  depth 0 only, or making the guidance bind under some conductor mode) is a prose-and-test
  change, not an architecture change.

## Alternatives Considered

- **Let merge order / luck decide (the status quo).** Rejected — the first run passed only
  because the queue emptied mid-SELECT; a depth-exactly-1 run has no rule and would resolve
  the contradiction arbitrarily, differently across runs.
- **Honor `pr-fleet`'s single-PR guidance and shed the lander at depth 1.** Rejected — it
  sacrifices the conductor's completeness guarantee (land whatever was built) to a member's
  efficiency heuristic; a single ready PR would be left unlanded at the end of a run.
- **Fold the merge/review-state read into this decision as a hard prerequisite.** Rejected
  — it couples a clean scheduling-rule decision to a SELECT-enhancement build task. The
  tiebreak stands on its own; the state read is a separately-routed improvement to _what
  SELECT reads_, not to _whether the lander is scheduled_.

## References

- Refines: [`0091-fleet-command-conductor-tier-authority-model.md`](0091-fleet-command-conductor-tier-authority-model.md) — the wave shape and the never-shed-the-lander terminal land wave this ADR gives a depth-<=1 tiebreak.
- Related: [`0089-pr-fleet-land-stage-human-merge-gate.md`](0089-pr-fleet-land-stage-human-merge-gate.md) — the pr-fleet land stage whose single-PR guidance this ADR scopes to direct human invocation; [`0093-fleet-scheduling-depth-lossy-key.md`](0093-fleet-scheduling-depth-lossy-key.md) — depth as a scheduling key.
- Resolves: #1316 (pr-fleet's scheduling rules conflict at queue depth <=1 with no tiebreak).
- Related: #1294 (base-freshness) and #1295 (pr-fleet first-run report), which bear on what pr-fleet SELECT should read.
- Family overview: `docs/reference/fleet-family.md` (the `-fleet` spine and the terminal land wave).
