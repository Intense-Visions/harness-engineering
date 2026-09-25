---
number: 0132
title: 'The stats primitive is safety-agnostic: consumers pass an already-filtered eligible set, and exploration varies cost, never safety'
date: 2026-09-24
status: accepted
tier: medium
source: docs/changes/stats-explore-exploit/proposal.md
---

## Context

> **Retrospective record.** This ADR documents spec decision D7 of
> `docs/changes/stats-explore-exploit/proposal.md`, approved with the spec and shipped in
> Phases 2–3 of its autopilot run. The hot-path throw carve-outs below were refined by the
> Phase 2 and Phase 3 reviews (commits `037479deb`, `e35024c14`, `fd2436db4`); the code at
> `c3d2fae98` is recorded as authoritative.

An explore/exploit bandit deliberately picks arms that are not the current best. Every
consumer it will serve already enforces safety rules the bandit must never relax: the
adaptive router's monotonic escalation floor
(`packages/orchestrator/src/agent/escalation-state.ts`), privacy floors and sensitive-path
vetoes, per-run budgets, and fleet slot caps. Goal G3 of the spec is "never let exploration
touch safety", and `STRATEGY.md#our-approach` requires constraints to stay machine-checkable:
exploration may vary cost, but every gate still fires on an explored arm.

The instrument also runs on a dispatch hot path (one `choose` and one `append` per routed
unit), where an exception means a lost dispatch, and it is consumed by processes that may
append to one ledger concurrently (orchestrator, CLI, fleet lanes).

## Decision

1. **The primitive never sees safety.** `choose(eligible, config, rng)`
   (`packages/stats/src/bandit/policy.ts:13`) receives an `eligible: ArmState[]` the consumer
   has already filtered. Floors, vetoes, budgets, and escalation state stay in the consumer
   that owns them; the package has no hook, callback, or config field for any of them.
   Exploration therefore varies which eligible arm is tried — its cost — and nothing else.
2. **An empty eligible set is a consumer bug, not a runtime condition to degrade through.**
   `choose` throws `NoEligibleArmsError` (`policy.ts:16`, `bandit/errors.ts:8`) and returns no
   choice (SC3). Returning `undefined` or a sentinel arm would let a mis-filtered consumer
   dispatch to nothing, silently.
3. **Nothing else on the hot path throws.** The only throws are the consumer-bug carve-outs:
   - `NoEligibleArmsError` (above);
   - config validation at construction — `InvalidBanditConfigError` from
     `resolveBanditConfig` (`bandit/config.ts:71`: `policy` in `{scoutFraction, thompson}`,
     `scoutFraction` in `[0, 1]`, `halfLifeDays > 0`, `minEffectiveN >= 0`, positive prior)
     and `InvalidSprtConfigError` from `validateSprtConfig` / `waldBounds`
     (`sprt/config.ts`: `alpha`, `beta`, `p0`, `p1` in `(0, 1)`, `p0 ≠ p1`,
     `alpha + beta < 1` so that `A > B`, `maxN` a positive integer when present);
   - `InvalidSprtObservationError` when `observe()` receives anything other than `0`, `1`,
     `true`, or `false` (`sprt/sprt.ts:111`, `sprt/errors.ts:25`) — counting `0.5` or `'1'`
     as a failure would bias the test toward `accept` with no signal, and the state is left
     untouched.

   Everything else degrades and reports: `append` IO failures go to the optional `onError`
   callback and lose one pull, never a dispatch (`bandit/ledger.ts:127-137`); a `fold` read
   failure other than ENOENT goes to `onError` and folds empty with `readError: true`
   (`ledger.ts:56-66`); a missing ledger is an empty ledger; a malformed line is skipped and
   counted (`ledger-parse.ts`, SC9); a torn final line from a concurrent writer is malformed,
   never a crash (A6).

4. **Every choice is explainable at a gate.** `Choice.reason` is one printable line
   (`policy.ts:97,104,126`) and `mode` says whether the pick was `explore` or `exploit`, so a
   human gate or report can show why an explored arm was tried without the bandit having any
   say in whether the gate passes (G2).

### Alternatives Considered

- **Package-level veto or floor hooks** (`isEligible(arm)` callback, `minTier` config).
  Rejected: safety rules would then live in two places and drift; a consumer that forgot the
  hook would get the unsafe default. The consumer already has the eligible set; passing it is
  cheaper than a callback.
- **Degrade through an empty set** (return the best-known arm, or `undefined`). Rejected: an
  empty set means the consumer's filter removed everything — dispatching anyway is exactly the
  safety leak D7 exists to prevent.
- **Coerce out-of-domain observations** (`x >= 0.5` → success). Rejected by the Phase 3
  review: silent coercion turned bugs into biased verdicts.
- **Throw on ledger IO failures.** Rejected: a full disk or EACCES on `.harness/metrics/`
  would take the dispatch path down with it; the ledger is evidence, not the decision.

## Consequences

### Positive

- Safety is enforced exactly once, in the consumer that already owns it; the bandit cannot
  weaken it and needs no per-consumer safety configuration.
- The hot path is total except for programmer errors that surface at construction or on the
  first bad call in tests, where they belong.
- Reports and human gates can print `mode` + `reason` verbatim, so exploration is visible
  without being overridable from inside the primitive.

### Negative / trade-offs

- Consumers must filter before calling; a consumer that forgets gets `NoEligibleArmsError` at
  worst, or a wider-than-intended eligible set at best. The contract is documented in
  `packages/stats/README.md` and the concept doc but is not machine-checked across the
  package boundary.
- `onError`-and-continue means a consumer that omits `onError` loses evidence silently; the
  `readError` flag and `malformed` count on `FoldResult` are the only signals.

### Neutral

- Untrusted-signal learning-rate caps (row #1559) remain a consumer concern — down-weight
  `outcome` before recording (A5).
- The carve-out list is closed: adding a new hot-path throw is a contract change to this ADR,
  not a local decision.

## References

- Spec: `docs/changes/stats-explore-exploit/proposal.md` — G2, G3; Decisions D7, D8, D9;
  "Policies"; "Error handling"; SC2, SC3, SC9; Assumptions A5, A6.
- `packages/stats/src/bandit/policy.ts:13-26` (`choose` over an eligible set; empty-set
  throw), `:97,104,126` (one-line reasons).
- `packages/stats/src/bandit/errors.ts:8-18` (`NoEligibleArmsError`, `InvalidBanditConfigError`).
- `packages/stats/src/bandit/config.ts:31-72` (table-driven construction guards, `037479deb`).
- `packages/stats/src/bandit/ledger.ts:56-66,127-137` (IO to `onError`; `readError`,
  `e35024c14`).
- `packages/stats/src/bandit/ledger-parse.ts` (malformed-line definition, `3cb77fb86`).
- `packages/stats/src/sprt/config.ts:18-41` (SPRT construction guards, `54eeddbdc`,
  `e3a53b307`); `packages/stats/src/sprt/sprt.ts:101-121` (`observe` carve-out, sticky
  verdict); `packages/stats/src/sprt/errors.ts:25-32` (`InvalidSprtObservationError`,
  `fd2436db4`).
- `packages/orchestrator/src/agent/escalation-state.ts` (a consumer-owned floor the bandit
  must not relax).
- Concept doc: `docs/knowledge/stats/explore-exploit.md`. Companion decision: ADR 0131
  (`0131-stats-leaf-package-home-for-statistical-instruments.md`).
