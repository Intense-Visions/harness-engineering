---
'@harness-engineering/orchestrator': minor
'@harness-engineering/intelligence': minor
'@harness-engineering/types': minor
'@harness-engineering/cli': patch
---

feat(adaptive-model-routing): D8 hard budget cap — force `fast` / surface to a steward at the cap

Turns the AMR budget from a purely soft, single-step degrade into a cap that
actually bites at 100% of `capUsd`, while staying **opt-in / default-off** (no
`routing.policy.budget` ⇒ dispatch is byte-identical).

- **Hard floor (`degrade`/`pause`):** at/above `capUsd`, the tier is forced all the
  way to `fast` (not just one step). Sound because it only ever routes _cheaper_
  than the existing soft clamp, and it sits **below** the D5 blast-radius veto, so a
  security-forced `strong` task still stays `strong`. `pause` behaves as `degrade`
  here — true blocking admission remains deferred.
- **`human` mode:** at/above the cap, `AdaptiveRouter.route()` throws a fail-closed
  `RoutingError('budget-exhausted')` **before** selecting a backend (an un-routed
  dispatch spends nothing). The dispatch boundary surfaces the unit once to a
  steward as `routing:budget-exhausted` and drives it terminal — no auto-retry into
  the same cap (mirrors the `privacy-no-match` terminal path). Raise `capUsd` via
  `PUT /api/v1/routing/policy` and re-queue to resume.
- **Observability:** `RoutingBudgetStatus` gains an `exhausted` flag; `harness
routing status` shows an `EXHAUSTED` state once spend crosses the cap.

Behavior change to note in release notes: existing `budget` policies that were
only ever degrading one step will now force `fast` (or surface to a steward, for
`human`) once spend reaches the cap. It remains a lagging cap under concurrency —
not an admission gate.
