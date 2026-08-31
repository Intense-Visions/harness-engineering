---
number: 0093
title: Fleet scheduling depth is a lossy key
date: 2026-08-18
status: accepted
tier: medium
source: 'design routing of bug-backlog issues #1305, #1319, #1312'
---

> **Amended 2026-08-31 (decision-blocked issue #1313, folded per `fleet-command` Wave 3 CONFIRM fork F1).**
> Decision item 4 and the accompanying Context/Consequences notes were added to model
> the third member class — depth **knowable only by paying for the work** (e.g.
> `craft-fleet`) — by extending the probe contract's `fidelity` dimension with a
> `sampled` value. The ADR is accepted at the same time (`proposed` → `accepted`) on the
> human's explicit F1 answer.

## Context

The conductor (ADR 0091) sizes and sheds lanes by each member's reported **depth** — the
count of items its SELECT enumerates. Depth drives two scarce decisions: which lanes are shed
when the global leaf-slot budget is oversubscribed, and how the remaining slots are allocated.
Depth is only sound as a scheduling key if it is a **comparable, honest, dedup'd count**
produced the same way by every member. It is none of these today, and three routed issues —
all split from #1259 — show it being gamed in three compounding directions.

- **Unmeasurability is rewarded (#1305).** The shed order drops the lowest-depth lanes first,
  but the rule reads "unknown is not sheddable by depth." A member that reports an honest small
  number becomes shed-eligible; a member that reports **nothing** — recorded as
  queue-depth-unknown per ADR 0091 property 4 — is protected. The observed instance keeps
  craft-fleet, the most expensive member, precisely because it reported no number, and sheds
  members that answered honestly. The incentive runs backwards: measure yourself and you can be
  cut; stay dark and you are safe.

- **Replicated findings inflate depth into a fake fleet (#1319).** One systemic pattern
  replicated across the tree reports as raw item count: 29 security warnings that were a single
  fix applied to ~10 packages surfaced as depth 29, winning slots against members reporting
  honest, irreducible work. Depth measured before collapse rewards breadth of symptom over
  quantity of work.

- **A structurally-unprobeable member is permanently unknown (#1312).** Probing is allowed only
  through a member's **gate-free** path (ADR 0091). That contract is unspecified: craft-fleet's
  `--report-only` ambiguously "presents a CONFIRM surface," which the gate-must-never-fire-during-SELECT
  rule forbids, and ideate-fleet has **no** `--report-only` at all — it declares `--dry-run`, so
  it is permanently unprobeable and its unknown-depth fork fires every run. Combined with #1305,
  unprobeable is not a temporary gap but **permanent protection**: the member that cannot be
  measured can never be shed.

The three defects **compound**. A member that is unprobeable (#1312) is permanently unknown,
unknown is protected from shedding (#1305), and any member whose findings replicate can inflate
its way to the front of the honest queue (#1319). Left alone, the scheduler selects hardest for
exactly the members it should scrutinize most: the expensive, the dark, and the duplicative.

**A third member class exists between "cheaply exact" and "legitimately unknown" (#1313).**
`craft-fleet`'s queue **is** the expensive work — eleven LLM critique sweeps over ~5,000 files —
and its human gate needs verbatim findings that cannot exist until SELECT has already run. So its
depth is neither cheaply probeable **nor** genuinely unknowable: it is **knowable only by paying
for (a slice of) the work**. Under the plain contract below it has only two bad options — report
`unknown` (and, pre-amendment, be protected; post-amendment, be shed-first despite having real,
estimable work) or run the entire sweep just to answer the probe. Neither is right: a member whose
depth is measurable by sampling should neither hide as dark nor pay full price to be counted.

## Decision

The fleet family adopts a **depth-reporting contract** that makes depth a comparable key and
removes the incentives above. Depth stops being "whatever a member happens to count."

1. **Every member implements a testable, gate-free `--report-only`.** Its contract is stated as
   three checkable obligations, not prose intent: it **must not emit a decision prompt** (no
   CONFIRM, no `emit_interaction` surface), **must not block on input**, and **must not mutate**
   (no writes, no filings, no branches). This is the only path the conductor probes. `--dry-run`
   and any other ambiguous alias is not a substitute; ideate-fleet gains a conforming
   `--report-only`, and every member is audited against the three obligations.

2. **`--report-only` returns a comparable `plannedBatchSize`, collapsed by fix-identity.** Depth
   is reported as the count of **distinct fixes**, not raw items — findings that share a
   fix-identity collapse to one before the number is emitted. Where the raw count still carries
   signal, the member reports the pair **(items / distinct-fixes)**; the scheduler keys on
   distinct-fixes. A single pattern across ten packages reports as size 1, not 29.

3. **Unknown and unprobeable are shed-first, not protected.** The shed rule inverts: an
   unmeasured or non-conforming lane is **unschedulable by default** and sheds before any lane
   that reported an honest number. A member that cannot produce a conforming `plannedBatchSize`
   runs only on an **explicit human call** at CONFIRM, never by silently surviving the shed. Dark
   is the weakest position, not the safest.

4. **The probe contract carries a `fidelity` dimension; a pay-to-know member reports
   `fidelity: sampled` (#1313).** The gate-free probe returns `{ceiling, plannedBatchSize,
fidelity}`, where `fidelity` is `exact` for a member that can enumerate its distinct fixes
   cheaply and **`sampled`** for the third class — a member whose depth is knowable only by paying
   for the work (e.g. `craft-fleet`). A `sampled` member probes a **bounded slice**, extrapolates a
   `plannedBatchSize` (still collapsed by fix-identity per item 2), and marks the estimate
   `sampled`. Crucially, **a `sampled` report is a conforming report, not `unknown`**: it
   participates in scheduling and is **sheddable by its extrapolated depth** like any honest number,
   so the expensive member is neither protected-by-darkness (#1305) nor forced to run its whole
   sweep to be counted — it pays for a slice, not the batch. The `sampled` label travels with the
   number so the conductor and the human can see that the depth is an extrapolation rather than an
   exact count and weigh a shed/keep decision accordingly. Reporting `unknown` when a member could
   have sampled is itself non-conforming and is treated as shed-first per item 3; sampling is the
   honest floor for a measurable-by-sampling member. (This subsumes #1313's "sampled probe" option;
   its "authorize by participation" and "opt-in only" alternatives are considered and rejected
   below.)

The contract is enforced where it is cheap to check: `--report-only` conformance is a member-level
test, and the conductor treats a missing or non-conforming report as unknown → shed-first rather
than as an unprobeable exception to route around.

## Consequences

- **Positive:** depth becomes a key you cannot win by hiding, replicating, or refusing to
  implement a probe. Honest reporting is the dominant strategy; the expensive-and-dark member is
  the first shed, not the last. The `--report-only` contract gives the conductor's gate-free
  probe (ADR 0091) a real, uniform surface instead of a per-member guess, and it is testable, so
  drift is caught at the member, not discovered during a live run.
- **Negative / tradeoffs:** every member must now implement a conforming `--report-only` and a
  fix-identity collapse — real work for members that only had `--dry-run` or raw counts, and a
  new obligation on every future member. Fix-identity is a heuristic: an over-eager collapse
  understates genuine work, so the (items / distinct-fixes) pair is retained where the raw count
  still informs. Shed-first-on-unknown means a member whose probe regresses to non-conforming is
  dropped rather than run — loud and safe, but it can shed a member that would have had real work.
- **On the `sampled` fidelity class (#1313):** the third class costs a bounded slice of its own
  expensive work to answer the probe (real, but far below running the full sweep), and its
  `plannedBatchSize` is an extrapolation — an over- or under-estimate can misorder a shed/keep
  decision at the margin. The `sampled` label is what keeps that honest: the conductor and human
  treat a sampled depth as an estimate, not a census, and the member is still fully sheddable, so
  the failure mode is a bounded mis-ranking rather than the permanent protection the plain contract
  produced.
- **Reversibility:** high — the shed order, the collapse rule, and the report shape are
  scheduling policy expressed in skill prose plus a per-member flag and test. Tightening the
  collapse, changing the pair format, or re-tuning the shed threshold is a prose-and-test change,
  not an architecture change. What is **not** cheaply reversible is the inversion itself: making
  unknown shed-first is the load-bearing incentive fix, and reverting it restores all three gamed
  behaviors at once.

## Alternatives Considered

- **Keep unknown protected; fix only the probes.** Rejected — even with perfect probes, the
  first member to legitimately lack a gate-free path re-opens permanent protection. The incentive,
  not the probe coverage, is the defect; unknown must be the weakest position structurally.
- **Report raw item count and let the conductor dedup at report time.** Rejected — dedup at
  report time is too late to fix **scheduling**; the inflated depth has already won the slots.
  Collapse must happen before the number is reported, at the member that knows fix-identity.
- **Make `--report-only` optional and infer depth from a member's normal SELECT.** Rejected — a
  normal SELECT is not gate-free and can fire CONFIRM during the conductor's probe, the exact
  violation ADR 0091 forbids. A dedicated, testable gate-free surface is the only safe probe.
- **A central registry of every member's depth semantics owned by the conductor.** Rejected —
  it re-centralizes knowledge each member holds best (its own fix-identity), and drifts silently
  the moment a member changes. The contract lives with the member and is enforced by the member's
  own test.
- **Authorize the pay-to-know member by participation, not magnitude (#1313 option 2).** Rejected —
  authorizing `craft-fleet` at CONFIRM purely because it opted in, without any depth number, re-creates
  a member the scheduler cannot compare or shed against honest numbers — the same darkness this ADR
  removes, merely relabelled "participating."
- **Make the pay-to-know member opt-in only and never auto-schedule it (#1313 option 3).** Rejected —
  it permanently exempts the single most expensive member from the scheduling discipline the rest of
  the family lives under; a bounded `sampled` probe gives the conductor a comparable number at a
  bounded cost, which is strictly better than exempting the member from measurement.

## References

- Resolves: #1305 (unknown is a protected status), #1319 (replicated findings inflate depth),
  #1312 (`--report-only` gate-free probe contract unspecified; ideate-fleet unprobeable),
  #1313 (craft-fleet is an unmodeled member class — depth knowable only by paying for the work;
  folded via the `fidelity: sampled` extension in Decision item 4).
- Refines: [`0091-fleet-command-conductor-tier-authority-model.md`](0091-fleet-command-conductor-tier-authority-model.md) — the global leaf-slot budget, the shed order, and the gate-free probing rule (property 4) this contract makes honest.
- Companion: [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md) — the CONFIRM round where an unmeasured member is scheduled only on an explicit human call.
- Family overview: `docs/reference/fleet-family.md` (the `-fleet` spine, gate-free probing, and the conductor tier).
