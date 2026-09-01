# Taguchi continuous quality loss — emit distance-to-threshold alongside binary gate verdicts (#1673)

## Overview

Binary gate verdicts hide approach-to-failure by construction: coverage ≥ floor,
complexity ≤ limit, latency ≤ budget — every gate says `pass` right up until the
day it says `fail`, and in saying only `pass`/`fail` it discards the _distance to
the threshold_, which is exactly the leading indicator. Two changes that both
"pass" can carry very different real risk: a feature at 100% traceability coverage
and one at 81% (floor 80%) are indistinguishable to the verdict, yet the second is
one small regression from red.

Taguchi's insight (quality engineering) overturned step-function pass/fail: loss
is continuous — quadratic in the distance from target — not a cliff at the spec
limit. This change keeps the binary verdicts for admission (they are cheap to
reason about) but records the continuous loss underneath, so "passed barely" and
"passed comfortably" become distinguishable and a codebase drifting toward its
limits shows rising loss while every gate still passes green.

**Scope of this slice (emission/measurement only):** no gate's pass/fail decision
logic changes. We add the continuous measurement to the existing gate-result
envelope, a pure per-gate quadratic loss function, an accumulation rollup, and a
leading-indicator alarm — then dogfood emission from this repo's own gate stack.
Outcome-data calibration and a persisted cross-period telemetry store are called
out as follow-ups (see Non-goals), so this lands under `Refs #1673`.

## User-Visible Behavior

- **`CICheckResult` gains an optional `measurements` field** (in
  `@harness-engineering/types`): a thresholded check emits a `GateMeasurement`
  (`{ gate, measured, target, bound, unit? }`) alongside its binary `status`. The
  field is absent for checks with no numeric metric, so serialized reports for
  those checks are byte-identical to before.
- **The traceability check emits a coverage measurement for every feature** —
  including passing ones (`bound: 'lower'`, floor = `minCoverage`). This is the
  leading indicator: a feature drifting from 100% toward the floor shows rising
  loss while its verdict stays green. Emitted only when a floor is configured.
- **The perf check emits complexity/coupling measurements** for its violations
  (`bound: 'upper'`, target = the tier threshold).
- **A new pure core module `@harness-engineering/core` `gate-loss`** turns
  measurements into comparable loss:
  - `computeGateLoss(measurement)` → `margin` (signed slack in the gate's own
    units), `proximity` (normalized: 0 = far from limit, 1 = at the threshold,
    > 1 = breaching), and `loss = proximity²` (dimensionless, comparable across
    > gates). Robust: never returns `NaN`/`Infinity`; clamps and flags `degraded`
    > on divide-by-zero or non-finite input.
  - `accumulateLoss(losses)` → total / mean / per-gate rollup — the accumulated
    loss per change/surface/period.
  - `detectLossAlarm({ previous, current, allVerdictsGreen })` → fires when loss
    rises past a threshold (default 25%) _while every binary verdict is still
    green_ — the "all green, but accumulated loss up 40% this month" sentence.
- **The CI markdown report renders a continuous-loss panel** beside the pass/fail
  table when any check emitted measurements, showing per-gate measured/target/
  margin/loss and the accumulated loss.

## Success Criteria

1. Thresholded checks emit `measurements` with **no change to any admission
   decision** — `status`/`exitCode` are computed exactly as before; the field is
   purely additive and absent when empty. (Existing CI orchestrator tests unchanged
   and green.)
2. A fixture drifting toward a limit shows **rising accumulated loss while all
   verdicts stay green, and the alarm fires before the first failure** (covered by
   `tests/gate-loss/accumulate.test.ts` → "acceptance: a fixture drifting toward
   its limit").
3. Loss is a well-defined, comparable, quadratic function of distance-to-threshold
   for both `upper` and `lower` bounds, robust to degenerate inputs (never
   `NaN`/`Infinity`).

## Non-goals / follow-ups (remainder of #1673 → tracked, not in this slice)

- **Outcome-data calibration** (acceptance criterion 3: "beats the uncalibrated
  quadratic on held-out prediction … or the negative result is published"). This
  requires an outcome-labelled dataset to fit per-gate loss coefficients against;
  the quadratic default ships now as the honest, defensible prior. Calibration is
  a research follow-up.
- **Persisted cross-period telemetry store + dashboard trend panel.** This slice
  computes accumulation and the alarm as pure functions and surfaces them in the
  CI report; wiring a durable per-period store and a dashboard loss-trend panel is
  a follow-up.
- **Feeding downstream consumers** (`gate-cavitation-detection`,
  `nnt-gate-effectiveness`, `goodhart-sentinel`) — those consume the new
  measurement/loss primitive once they land.

## Wiring (integration points)

- `packages/types/src/ci.ts` — `GateBound`, `GateMeasurement`,
  `CICheckResult.measurements?`.
- `packages/core/src/gate-loss/` — pure loss primitive (compute / accumulate /
  alarm) + barrel (auto-discovered by `generate-core-barrel`).
- `packages/core/src/ci/check-orchestrator.ts` — traceability + perf emit
  measurements; `runSingleCheck` attaches them additively.
- `packages/core/src/ci/report-formatter.ts` — loss panel.
