---
number: 0065
title: Separated failure mechanisms for workflow-stage retry, floor feed, and terminal
date: 2026-07-11
status: accepted
tier: medium
source: docs/changes/split-routing/proposal.md
---

## Context

Split-routing runs a coherence unit as a multi-stage workflow on one shared
worktree, with each stage routed by the AMR at its own required tier. When a
`pass-required` stage fails its quality gate, three distinct things must happen —
and the **rev-1 design conflated them** (the "C3 bug" that prompted the rev-2
revision):

- The engine wanted to **retry a failed stage once at a bumped tier**. Rev-1 tried
  to drive that bump through `EscalationState` — i.e. call `recordOutcome(unit,
tier, false)` enough times to climb the cumulative floor, then re-route. But the
  escalation threshold is `2` by default, so a single failure does **not** climb;
  and even where it did, the retry decision was then coupled to the cumulative
  unit history rather than to _this stage's_ outcome. A stage's own retry could
  fire or not depending on unrelated prior-stage failures — non-local, surprising,
  and untestable in isolation.
- The **cumulative unit floor** (D10 vertical escalation) is a genuinely separate
  concern: a unit that keeps producing quality failures should have _later_ stages
  resolve at a higher tier. That must be fed by real quality outcomes, once per
  failed attempt, independent of whether the engine chose to retry.
- The **terminal decision** (give up, escalate to a human) is a third concern: if
  the one engine retry also fails, the unit terminally fails.

Collapsing these onto one mechanism (`recordOutcome`'s threshold climb) made the
retry cap, the floor climb, and the terminal trigger interdependent and
non-deterministic.

## Decision

Separate the three mechanisms (D8) so each has a single, independently testable
driver:

- **(a) Engine-owned retry, cap = 1, at an engine-computed bumped tier.**
  `runStageWithRetry` loops `attempt 0..1`. Attempt 0 routes normally. On a
  `pass-required` gate failure it retries **exactly once** at
  `floor = nextTier(attempt-0 decision.tierRequired)`, threaded into `route()` via
  the new optional `RoutingRequest.floor` (see ADR-linked Option A). A second
  failure returns `outcome:'fail'` with `attempt === 1` — no third attempt. The
  retry decision is driven **solely by this stage's own `outcome`**, never by the
  cumulative floor.
- **(b) Independent cumulative-floor feed.** After **each** attempt the engine
  calls `recordOutcome(unit, tier, ok)` with the real quality outcome
  (`ok = gate !== 'pass-required' || passed`). This climbs the unit floor per
  `EscalationState`'s threshold **independently** of the engine's own retry, so a
  _later_ stage inherits a raised floor. Advisory/absent gates always report
  `ok=true` (they never climb).
- **(c) Terminal trigger.** If the single engine retry also fails (or a stage
  errors/times out), the stage carries a non-`pass` outcome and
  `executeWorkflow` drives `finalizeWorkflowTerminal(unit, runs, failingStep)`
  exactly once (running/claimed delete + `persistLaneSafe('abandon')` + one
  `needs-human` + `cleanWorkspace`), preserving the D6/SC5 single-exit invariant.

`RoutingRequest.floor` is additive/optional: when absent, `route()` is behaviorally
identical to before (the escalation floor is `max-by-rank(unitFloor, 'fast') ===
unitFloor`), so all pre-existing AMR routing paths are unaffected (SC8).

## Consequences

- The engine retry is deterministic and unit-local: a stage failing both attempts
  always terminates at `attempt 1`, regardless of prior-stage history. Provable in
  isolation (SC6-a).
- The cumulative floor still climbs on repeated quality failure, but now as a
  _separate_ signal that affects downstream stages — not the current stage's retry.
- `nextTier` reuses the guarded `TIER_RANK`/`RANK_TIER` tables from
  `@harness-engineering/intelligence`; `derive-tier.ts` stays the single tier-order
  authority (byte-unchanged — SC8).
- The one router-touching change (the additive `req.floor` honor) is isolated to a
  single auditable commit so the SC8 byte-unchanged scope is a clean two-file diff.

## Links

- Spec: `docs/changes/split-routing/proposal.md` (rev-2, D8/D10/D12, SC6/SC7/SC8)
- Plan: `docs/changes/split-routing/plans/2026-07-11-phase-3-failure-escalation-plan.md`
- Engine: `packages/orchestrator/src/workflow/execute-workflow.ts`
  (`runStageWithRetry`, `nextTier`)
- Related: ADR 0066 (mid-workflow error is terminal — D10)
