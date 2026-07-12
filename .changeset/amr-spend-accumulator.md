---
'@harness-engineering/orchestrator': minor
---

Make the AMR budget clamp (D8) live. `AdaptiveRouter` now keeps a monotonic
spend accumulator — the sum of `estCostUsd` over every routing decision — and
`route()` reads it before deriving a tier, so `deriveRequiredTier`'s budget
clamp fires as spend accrues. Previously the router's `budgetState` was an
un-wired `{ spentUsd: 0 }` stub, so a `routing.policy.budget` had no effect at all.

This is a **soft degrade signal, not a hard ceiling**, and only affects
orchestrators with a `budget` set (opt-in):

- **Lagging under concurrency.** The clamp reads spend accrued from prior
  dispatches; a burst of concurrent dispatches can overshoot `capUsd` before the
  clamp engages. It nudges routing cheaper as spend climbs — it does not gate
  admission.
- **Single-step degrade.** Budget pressure lowers the tier by exactly one step
  and never below the D5 blast-radius veto floor (a sensitive-path task stays
  `strong` regardless of overspend).
- **Monotonic** (deliberately not the bounded `projectTelemetry` ring-sum) so a
  long run can't evict early spend and un-clamp. Persists across `setPolicy`, so
  lowering `capUsd` mid-run clamps immediately and irreversibly.

With no budget the accumulator still advances but the clamp no-ops (routing
unchanged). New `AdaptiveRouter.getSpentUsd()` returns the effective spend.
