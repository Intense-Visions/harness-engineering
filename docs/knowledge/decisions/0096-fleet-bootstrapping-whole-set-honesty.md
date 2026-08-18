---
number: 0096
title: Fleet-family bootstrapping and whole-set honesty
date: 2026-08-18
status: proposed
tier: medium
source: 'design routing of bug-backlog issues #1317, #1318, #1311'
---

## Context

The `-fleet` family is designed to feed itself: members read each other's emissions across
shared seams — a member's SELECT draws on prior REPORT.md parked forks, on labels other members
wrote, on the queue an upstream stage triaged. That self-feeding is the family's strength once it
is warm. On a **first run**, or in a repo where a seam was never wired, every one of those seams is
empty, and three distinct failures hide inside that single condition — three facets of one theme:
**a self-feeding family must be honest about what it could not read.**

- **Empty and absent look identical downstream but mean opposite things (#1317).** In an observed
  `adr-fleet` run, two of its three SELECT sources were structurally **unavailable**, not merely
  quiet: no `adr`/`decision` label exists in the repo, and zero prior fleet REPORT.md parked forks
  had ever been written. The fleet ran **single-sourced** off its one live seam and reported a
  clean intake — never disclosing that two-thirds of its designed intake was structurally absent.
  "Empty" is a fact about the project (no pending work on that seam); "absent" is a fact about the
  setup (this seam was never wired). Reporting absent as empty is a **false all-clear**: the human
  reads full coverage where the fleet actually had one eye open.

- **The route axis has no write target, and its vocabulary is incomplete (#1318).** `issue-fleet`'s
  Phase 5 says "record the routes via `gh`," but no per-fleet route labels exist, and the skill's
  own gates forbid inventing labels — so the recording step has nothing to write into and either
  no-ops or violates its own gate. Compounding it, the documented route list **excludes bug-fleet**,
  so a bug-shaped issue has no correct destination. A routing step that cannot name its
  destinations is not a routing step.

- **Action scope silently narrows whole-set operations (#1311).** A human scoped `issue-fleet` to
  untriaged issues, excluding 82 rows. Its highest-value result — `#972` duplicates `#1176` — lived
  in the **excluded** partition and was found only because that run happened to snapshot the full
  backlog first. Dedup, collision-detection, and cross-fleet filing-dedup are **whole-set**
  operations: scope limits what you **act on**, never what you **compare against**. A dedup set
  narrowed to the action scope cannot see the duplicate that straddles the boundary.

## Decision

The family adopts a **bootstrapping-and-honesty contract**, stated once in `fleet-family.md` and
inherited by every member, with three clauses.

1. **Distinguish absent from empty; report unavailable sources.** Each member's SELECT classifies
   every one of its designed sources as **available-and-populated**, **available-but-empty**, or
   **source-unavailable** (the seam is not wired — no such label exists, no prior artifact has ever
   been written). A run that draws on fewer than its full set of sources reports which sources were
   unavailable and that it ran degraded/single-sourced. `fleet-command` aggregates these into a
   **first-run readiness note** so the conductor surfaces "this family is cold" once, rather than
   letting each lane silently report a false all-clear. An absent seam is disclosed evidence, never
   a clean bill of health.

2. **Settle the route vocabulary, including bug-fleet — recommended default: ship the labels and
   record to the report.** Adopt a fixed route-label vocabulary as part of fleet-family install —
   `route:roadmap`, `route:adr`, `route:cicd`, `route:test`, `route:cleanup`, and **`route:bug`** —
   so `issue-fleet`'s route-recording step has a sanctioned destination to write into without
   inventing labels, **and** additionally records the routes in its report artifact. This resolves
   both halves of #1318: the `gh` write now has a target, and bug-shaped issues have a destination.
   The route-label set is a **taxonomy decision the human should ratify** (see below); the fallback,
   should the human decline new labels, is clause-2b: record routes in the report artifact only and
   strike the implied `gh` write from Phase 5. Either branch **must** include `route:bug`.

3. **Whole-set operations read the full set regardless of action scope.** `fleet-family.md` states
   once that any whole-set operation — dedup, collision-detection, cross-fleet filing-dedup — reads
   the **entire** set irrespective of the run's action scope, and each member's SELECT **snapshots
   the full set even when scoped**, then applies the scope only to what it acts on. Scope bounds
   action; it never bounds comparison.

## Consequences

- **Positive:** a cold or partially-wired family stops emitting false all-clears — the human learns
  a seam was never wired instead of reading it as "nothing pending"; the readiness note makes
  bootstrapping a visible, one-touch state rather than a silent degradation. `issue-fleet`'s routing
  step becomes executable and complete, bug-shaped issues acquire a destination, and the route axis
  gains a stable label vocabulary the rest of the family can read. Whole-set operations recover
  their highest-value cross-boundary results (the `#972`/`#1176` class) that a scoped dedup set
  drops.
- **Negative / tradeoffs:** clause 1 asks each member to enumerate and classify its sources rather
  than just consume whatever is present — a small authoring cost per member, and a source-taxonomy
  that must be kept current as seams are added. Clause 2's default adds six labels to the install
  surface (an install-time side effect and a taxonomy the human now owns). Clause 3 means a scoped
  run still pays to snapshot the full set, so a deliberately-narrow run is not as cheap as its scope
  suggests — accepted, because a dedup that silently misses cross-boundary duplicates is worse than
  a slightly more expensive snapshot.
- **Reversibility:** high — all three clauses are interaction/authoring policy in `fleet-family.md`
  and member SELECT prose plus, for the default, one label-set install step. The route vocabulary
  can be extended, and the label-vs-report-only branch reselected, without an architecture change.

## Alternatives Considered

- **Treat absent as empty (status quo).** Rejected — it is the false all-clear this ADR exists to
  end; the human cannot tell a wired-but-quiet seam from an unwired one, and single-sourced runs
  masquerade as fully-sourced.
- **Report-only routing, no route labels (clause-2b as default).** Retained as the fallback, not the
  default — it fixes the "nothing to write into" gate cleanly but leaves routes invisible to the
  rest of the family (labels are the seam other members read), so the recommended default ships the
  labels. Either way `route:bug` is added.
- **Narrow the dedup set to the action scope (accept scope as the comparison boundary).** Rejected —
  it is exactly the #1311 failure; the most valuable duplicates straddle the scope boundary, and a
  scope-narrowed comparison set cannot see them.
- **Per-member ad-hoc handling of each seam.** Rejected — the three facets are one theme; stating
  the contract once in `fleet-family.md` keeps members honest uniformly instead of each re-deriving
  absent-vs-empty and whole-set semantics differently.

## References

- Resolves `#1317` (absent-vs-empty seams / first-run readiness), `#1318` (route vocabulary +
  bug-fleet destination), `#1311` (whole-set operations vs action scope). All three "Split from
  #1259."
- Companion: [`0090-adr-fleet-decide-stage-batch-signoff.md`](0090-adr-fleet-decide-stage-batch-signoff.md)
  — the decide-stage member whose single-sourced run surfaced #1317.
- Companion: [`0091-fleet-command-conductor-tier-authority-model.md`](0091-fleet-command-conductor-tier-authority-model.md)
  — the conductor tier that aggregates the first-run readiness note across lanes.
- Family overview: `docs/reference/fleet-family.md` (the `-fleet` spine, its invariants, and the
  bootstrapping/honesty contract added here).

> **Human ratification required:** the route-label vocabulary (`route:roadmap`, `route:adr`,
> `route:cicd`, `route:test`, `route:cleanup`, `route:bug`) is a taxonomy decision. The recommended
> default installs these labels; sign-off should confirm the label set (names and membership) before
> it becomes install-time state.
