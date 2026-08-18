---
number: 0092
title: Probe/evidence freshness and reconciliation for the fleet-command conductor
date: 2026-08-18
status: proposed
tier: medium
source: 'design routing of bug-backlog issues #1306, #1315, #1314'
---

## Context

The conductor (ADR 0091) gathers evidence at SELECT — cheap gate-free probes of each fleet's queue
depth and classification, and reads of the shared inputs those probes rest on — and then uses that
evidence to authorize acts that happen later: a human CONFIRM, a derived wave schedule, and the
first dispatch of each lane. Three routed issues, all split from #1259, are the same bug seen at
three points along that gap: **evidence that was true when it was gathered is used to authorize an
act after it stopped being true.**

- **Probe vs lane (#1306).** Nothing reconciles a lane's own SELECT against the probe that
  scheduled it. A probe reporting "depth 1" and a lane finding a different depth-1 item agree on the
  count while disagreeing on the item — a semantic mismatch a count match hides. And because member
  CONFIRM is once-only (ADR 0088), a human decision that rested on a probe diagnosis later overturned
  by the lane is never revisited.
- **Probe staleness (#1315).** Probe results decay across the ~10-minute SELECT sweep and the
  hours-long, human-paced CONFIRM. Observed in one run: a PR merged mid-SELECT took a queue 1→0, and
  the open-issue backlog moved 99→105 — yet nothing stamps a probe with the state it observed or
  re-reads the cheap depths before the first lane dispatches against them.
- **Shared-input degradation (#1314).** A single stale shared input — a 128 MB `graph.json` last
  built weeks earlier — independently degraded test-fleet, bug-fleet, and cleanup-fleet rankings in
  one run. One run-level fact with one remedy (rebuild the graph) surfaced as N per-member footnotes
  the human had to correlate by hand.

Left unaddressed, the conductor keeps acting confidently on evidence that has quietly expired, and a
correlated degradation of a shared input is diagnosed N times instead of once.

## Decision

The conductor adopts a **probe-provenance and reconciliation contract**. It extends the run-plan /
park interaction model (ADR 0088) and sits inside the conductor's SELECT and VERIFY phases (ADR 0091) — it adds no member gate and answers none.

1. **Stamp every probe with the state it observed.** Each probe records the repo **SHA plus a
   timestamp**, the queue depth, and the per-item classification it read. The stamp is provenance,
   carried forward as part of the probe's evidence — the same discipline the family already applies
   to the resolved toolchain paths and `harness --version`. A scheduling decision derived from a
   probe inherits that probe's stamp.

2. **Reconcile each lane's SELECT against its probe.** When a lane runs its own SELECT, it emits a
   **diff against the probe stamp** — items **added, removed, or reclassified**. The conductor reads
   that diff at VERIFY rather than trusting either side. A **material** divergence parks a run-level
   fork; an immaterial one is recorded and flows.

3. **Re-validate the cheap depths after authorization, before first dispatch.** Between the human's
   authorization and the first lane launch — the widest evidence-to-act gap in the run — the
   conductor cheaply re-reads only the **cheap-to-re-read** depths and compares them to their stamps.
   Material movement parks a run-level fork before any lane spends a slot on a stale premise.

4. **Check shared-input freshness once, at run level.** SELECT gains a **shared-input health check**
   over the inputs many lanes read in common — the graph, the roadmap aggregate, the perf baselines,
   the telemetry store — reading each one's freshness **once**. A stale input surfaces as a **single
   run-level fork carrying its remedy** (e.g. "rebuild the graph"), never as per-member footnotes the
   human must correlate.

5. **A bounded reaffirm exception to once-only CONFIRM.** When the specific evidence an _already
   answered_ fork rested on is overturned — by a lane reconciliation (2), a re-validation (3), or a
   freshness check (4) — the conductor opens **one** narrow round: "the evidence your answer rested on
   was overturned — reaffirm or revise?", presenting only that fork and the delta.

**What "material divergence" means, precisely.** A divergence is material iff it would change an act
already authorized or a schedule already derived: a reclassification that **crosses a gate, severity,
or dependency boundary**; a count change that **empties or fills a DAG wave**; or a shared-input
staleness that **reranks** a batch. Same items, same classes, same order — a count match with
identical semantic membership — is immaterial: recorded, not parked. The bar is deliberately
outcome-relative, so churn that does not change a decision does not manufacture a fork.

**How the once-only CONFIRM budget is preserved.** The reaffirm round in (5) is **not a second
CONFIRM** and does not reopen the batch. It fires **only on a concrete overturn of that fork's own
supporting evidence**, never speculatively; it presents **only the affected fork** with its delta,
never the run plan; and it is capped at **one reaffirm per answered fork per run** with no re-loop.
The conductor still never pre-answers, defaults, or summarizes a member gate — reaffirm is the
narrowest possible correction to a decision the human already made on evidence that has since failed,
not a new authority.

## Consequences

- **Positive:** the conductor stops acting on stale evidence at all three points; a correlated
  shared-input degradation is diagnosed **once with one remedy** instead of as N footnotes; a probe's
  semantic content — not just its count — is reconciled against ground truth; and a human decision
  survives the discovery that its premise was wrong, via a bounded reaffirm rather than a silent
  proceed.
- **Negative / tradeoffs:** SELECT costs more (stamping, a freshness pass, a pre-dispatch re-read),
  and the run produces **more forks** — a re-validation or a reconciliation can park the run just
  before dispatch. This is the intended trade: a parked fork on live evidence is cheaper than a batch
  of PRs built on an expired premise. The reaffirm round adds a possible late human touchpoint, held
  to the narrowest firing conditions above so it cannot regress into per-item interactivity.
- **Neutral / degradation by design:** the freshness check is over a **named set of shared inputs**,
  so a project that reads none of them, or keeps them fresh, sees the check return clean and the fork
  never fire — the contract's cost shrinks toward zero as staleness disappears, and never resists
  that improvement. Reconciliation diffs that are always immaterial cost only the diff.

## Alternatives Considered

- **Re-run every probe immediately before dispatch.** Rejected — it pays full probe cost twice and
  still races the dispatch it precedes. Stamping plus a cheap re-read of only the cheap depths closes
  the widest gap at a fraction of the cost.
- **Trust the count; skip semantic reconciliation.** Rejected — this is exactly the #1306 failure: a
  count match over a different item is the mismatch that hides. The diff must be over membership and
  classification, not depth.
- **Leave shared-input staleness to each member's own SELECT.** Rejected — it reproduces #1314, N
  independent footnotes for one fact with one remedy, and no member can see that the degradation is
  shared. The correlation belongs to the tier, like cross-fleet dedup (ADR 0091, property 3).
- **Fully relax once-only CONFIRM into re-confirmable gates.** Rejected — it reintroduces the
  per-item interactivity ADR 0088 exists to remove. The bounded, overturn-triggered, one-shot
  reaffirm gets the correctness without surrendering the budget.
- **Fail the run on any stale evidence.** Rejected — most staleness is immaterial; halting on it
  would make the conductor unusable. Park only material divergence; record the rest.

## References

- Resolves #1306 (probe/lane reconciliation; reaffirm on overturned CONFIRM evidence), #1315 (probe
  staleness; SHA+timestamp stamping and pre-dispatch re-validation), #1314 (shared-input degradation
  surfaced as one run-level fork with remedy). All three split from #1259.
- Companion: [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md) — the front-load / park model this contract extends; the run-level fork is a park, and the reaffirm is its bounded exception.
- Companion: [`0091-fleet-command-conductor-tier-authority-model.md`](0091-fleet-command-conductor-tier-authority-model.md) — the conductor whose SELECT gains the freshness and reconciliation checks and whose gate-batching the reaffirm respects.
- Family overview: `docs/reference/fleet-family.md` — the shared five-phase spine and the runtime-precondition discipline (stale-scanner evidence) this contract generalizes to probe and shared-input evidence.
