# Plan — Budget governor for unattended dispatch (#1525)

## Problem

Fleets currently run only while an operator is at the desk: of 1,866 commits in 90
days, just 24 (1.3%) landed at a weekend, and the hour histogram collapses after
18:00. All the observed 57x-median throughput comes from ~50 of 168 hours because
dispatch is operator-triggered, not scheduled. Enabling naive 168-hour scheduling
would need ~3.4x the quota. Before unattended operation is safe to turn on, the
orchestrator needs a **spend envelope** that stops dispatch cleanly at a lane
boundary when the budget is reached — never mid-write — with per-fleet allocation
and an operator-visible remaining-budget signal.

## Approach — smallest coherent slice

Land the governor primitive + envelope enforcement on the real dispatch path +
the remaining-budget signal. Denominate the envelope in **total tokens**
(input + output) — the unit the orchestrator already accrues in `tokenTotals` —
so envelope accounting reconciles with burn attribution without a separate cost
model. Governor is **off** when no `agent.budget` is configured (unbounded,
pre-#1525 behaviour).

## Tasks

1. **Governor primitive** — `packages/orchestrator/src/core/budget-governor.ts`.
   Pure module over a `BudgetState { periodStartMs, spentTokens, perFleetSpent }`:
   `createBudgetState`, `recordBudgetSpend` (rolls an elapsed window, immutable),
   `isGlobalEnvelopeExhausted`, `isFleetAllocationExhausted`, `canAffordDispatch`,
   `getBudgetStatus` (remaining-budget signal), `fleetKeyForIssue` (label
   attribution), `rollBudgetPeriod`, `periodLengthMs`.

2. **Config surface** — add `AgentBudgetConfig` + `budget?` to `AgentConfig`
   (`packages/types/src/orchestrator.ts`), export via the types barrel, and add a
   strict `AgentBudgetSchema` validated in `validateWorkflowConfig`
   (`packages/orchestrator/src/workflow/{schema,config}.ts`).

3. **State wiring** — add `budget: BudgetState | null` to `OrchestratorState`;
   initialise from config in `createEmptyState`; deep-clone in the state machine's
   `cloneState`.

4. **Dispatch enforcement (WIRED)** — in the `applyEvent` tick dispatch loop
   (`state-machine.ts`), consult the governor BEFORE each lane: global exhaustion
   `break`s the whole loop (clean stop, in-flight lanes untouched); a single
   fleet's exhaustion `continue`s (skip that fleet, siblings proceed). The retry
   dispatch path uses `canDispatch(..., budgetOptions)`.

5. **Accrual** — in `accrueUsage`, record `usage.totalTokens` against the envelope,
   attributed to the lane's fleet.

6. **Remaining-budget signal** — surface `getBudgetStatus(...)` as `budget` in
   `Orchestrator.getSnapshot()` (feeds `GET /api/state`, TUI, dashboard).

7. **Docs** — document `agent.budget`, clean-stop semantics, and the
   remaining-budget signal in `docs/guides/orchestrator-api.md`; regenerate
   `docs/reference/*`.

8. **Tests** — governor unit behaviour, a WIRED integration proving
   `applyEvent(tick)` stops dispatch at the envelope while leaving an in-flight
   lane running (plus per-fleet contention and the accrual path), and config
   validation.

## Wiring (live call site)

`applyEvent` → `handleTick` tick dispatch loop
(`packages/orchestrator/src/core/state-machine.ts`) calls
`isGlobalEnvelopeExhausted` / `isFleetAllocationExhausted` before dispatching each
eligible lane; the retry path calls `canDispatch(..., dispatchBudgetOptions(...))`
(`packages/orchestrator/src/core/concurrency.ts`). Adopters set
`agent.budget.{period, envelopeTokens, perFleet}`.

## Scope / deferral

`Refs #1525`. Delivers the governor primitive, envelope enforcement on the live
dispatch path, per-fleet allocation, and the remaining-budget signal. Deferred
(follow-ups, not needed for safe-to-enable): the thin cron scheduler primitive
(#1405), burn-attribution reconciliation to a dollar cost model, and dashboard
UI rendering of the `budget` snapshot field.
