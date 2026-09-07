---
number: 0125
title: 'Silently-corruptible evidence is a scheduling constraint — the exclusive wave'
date: 2026-09-07
status: proposed
tier: large
relates:
  - '0091-fleet-command-conductor-tier-authority-model'
source: 'docs/changes/conductor-member-wiring/proposal.md'
---

## Context

`fleet-command` schedules its members into waves derived from a fixed dependency shape, and deconflicts them before dispatch with a **contention map** over four collision classes — generated artifacts, allocated sequences, same-region source edits, and duplicate filings (ADR 0091). Every one of those four is a **shared write surface**. Each is detectable by looking at what the lanes write, and each resolves with an ordering, a serialization, or a dedup at report time.

`perf-fleet` fits none of them. Its verification bar is a measured before/after, and its SELECT admits a target only with a measured budget violation recorded (`agents/skills/claude-code/perf-fleet/SKILL.md:7`). Its evidence is therefore a **measurement**, and a measurement is corrupted by machine load rather than by another lane's writes. Nothing in the contention map can see that, because nothing about it appears in a diff.

**Load-sensitive evidence is not new in this repository.** `.husky/pre-push:84-85` already caps turbo at two packages at a time, for a stated reason:

> Without this, filesystem/sqlite/HTTP-heavy tests flake under compound parallel load (Phase 2 raises this cap after test isolation).

So the repository already spends throughput to protect evidence from load, and this ADR claims **no novelty for the observation**. What is new is the failure mode.

## Decision

**Evidence whose corruption under load is _silent_ rather than _exposable_ is a first-class scheduling constraint, and the instrument that matches it is an exclusive wave — not a load cap.** `fleet-command` therefore schedules `perf-fleet` alone in wave 5, and **an exclusive wave is not a valid target for a serialization deferral**.

The distinction that carries the decision is failure mode, not novelty:

- A contended **test** fails **loudly**. The flake is visible in the run, a rerun exposes it, and the family already treats "prove the failure is outside your diff, then rerun once" as routine. The corruption announces itself, so a **throughput cap** that merely reduces its frequency is a sufficient instrument — which is exactly what pre-push uses.
- A contended **benchmark succeeds with a plausible wrong number**. Nothing in the artifact distinguishes a clean 40ms from a contended 40ms. `perf-fleet` would gate a fix on corrupted evidence and report it as verified — the precise failure its Iron Law exists to prevent, arriving through the one door the Iron Law cannot watch. No downstream verification recovers from it, because there is nothing to recover: the artifact is well-formed and wrong.

The pre-push cap's own parenthetical strengthens rather than weakens this. That cap is explicitly **temporary** — to be relaxed once test isolation lands. A throughput cap is the right instrument for corruption that is exposable and that better isolation will eventually stop producing. Measurement fidelity does not become safe with better isolation: a co-scheduled lane saturating the machine corrupts a benchmark no matter how cleanly the two lanes are isolated from each other. A **barrier**, not a cap, is the instrument that matches.

Wave-separation is already this family's mechanism for "these must not run together" — the contention map's _allocated sequences_ class prescribes "Serialize the writers into different waves." This decision applies an established mechanism to a class the map does not yet name.

### Second consequence — an exclusive wave is not a valid deferral target

The contention map's deferral rule pushes a serialized lane into a later wave, bounded by a stop. That stop was previously phrased against **the terminal lander's wave**. Moving the lander from wave 5 to wave 6 nominally opens a wave of headroom, but the wave it opens admits one named member by construction. The stop is therefore re-phrased against the **first non-admitting wave** — today wave 5 — so deferral behaviour is unchanged by the renumber.

This **amends the deferral bound stated in ADR 0091** ("Deferrals are bounded: a deferral that would reach the terminal lander's wave sheds its lane with a reason instead"). ADR 0091's body is deliberately left as the historical record of the decision as taken; this is an amendment to one clause, not a supersession of the authority model, so `supersedes:` is not set.

The rule as it now stands is index-free by design: it names a property of the wave (does this wave admit the lane?) rather than an index, so it survives the next renumber without another edit.

### Rejected — a measurement quiet-lock

Schedule `perf-fleet` in wave 2 and let its measurement steps acquire a lock that pauses other lanes' fan-out. Rejected on two grounds that actually distinguish it from an exclusive wave: a lock held by a crashed lane **deadlocks the run**, where a wave barrier cannot; and nothing would record whether the quiet window was in fact quiet, where a wave assignment is **recorded in the run plan and visible at CONFIRM**.

An earlier draft also objected that a lock adds cross-lane blocking to a "coordinator, never dictator" tier. That objection is **withdrawn**: the conductor already blocks lanes via wave barriers, serialization, and slot admission. An exclusive wave _is_ cross-lane blocking — coarser, and planned rather than dynamic.

### Rejected — CI-side measurement

Measure on CI runners so local concurrency is irrelevant. Rejected because per-measurement round-trip latency is minutes, which makes a measure → remediate → re-measure loop impractical inside a lane. Whether shared CI runners have better or worse benchmark variance than a quiet workstation is **not established here and is recorded as an open question**, not used as a reason. Revisit if benchmark stability proves inadequate even when `perf-fleet` runs alone.

## Consequences

**Positive.**

- `perf-fleet`'s measurements are protected structurally rather than by luck, and the protection is visible in the run plan at CONFIRM rather than assumed.
- The precedent generalizes with a stated admission test — _does contention here produce a plausible wrong answer, or an exposable failure?_ — so a future member with silently-corruptible evidence inherits an exclusive wave on a rule rather than on taste.
- The deferral stop is now phrased against a property — _the first non-admitting wave_ — rather than against a wave index, so the **rule** survives a future renumber without editing. The **prose does not, and claiming otherwise would be the trap**: the shipped text hedges the current index with a `today wave 5` parenthetical (or a bare `(5)`) at roughly a dozen sites across `SKILL.md`, `skill.yaml` and the four generated command artifacts, and a renumber must sweep every one of them. Naming that sweep here is what makes the hedge safe — an unswept parenthetical leaves a stale index sitting inside a normative Gate, which reads as authoritative and is wrong.

**Negative.**

- A run that schedules `perf-fleet` is **one wave longer**, and that lane holds the full slot pool alone. This is the throughput the decision spends on fidelity, and it is accepted.
- Shed ordering is **cost-blind**. `perf-fleet` is now the most expensive lane in a run — it holds a wave of its own — and depth-ordered shedding cannot see that: a shallow-but-cheap sweep and a shallow-but-wave-exclusive one are ordered identically today. Recorded as a follow-up, not solved here.

**Neutral.**

- `perf-fleet` remains **sheddable**. The trust gate and the terminal lander are never shed because dropping them costs the run its evidence base or its reviewable terminal state; neither applies here. A shed `perf-fleet` empties wave 5, and the existing rule already covers that — a wave with no scheduled members is skipped, not renumbered and not a barrier.
- The exclusivity is **dispatch-time-enforced and recorded as an assumption**, not a verified check. No artifact records which lanes were in fan-out during a wave, exactly as none records a lane's peak concurrency. The run report states wave 5 as exclusive and names `perf-fleet` as the only lane scheduled there; that is a claim about the plan, not a measurement of occupancy.

**Open.**

- Whether `perf-fleet` running alone on a developer workstation is quiet enough for stable benchmarks. This decision removes conductor-induced contention; it does not make the machine idle.
- Whether shared CI runners have better or worse benchmark variance than a quiet workstation. Unmeasured, and deliberately not used as a reason to reject CI-side measurement.
