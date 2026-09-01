# Plan — Taguchi continuous quality loss (#1673)

## Problem

Thresholded gates emit binary verdicts and discard the distance to the threshold
— the leading indicator that predicts future failures. We want to record the
continuous loss underneath the verdict, emission-only, without changing any
admission decision.

## Approach

Extend the existing gate-result envelope with the raw measurement, add a pure
loss primitive in core, dogfood emission from this repo's own thresholded checks,
and surface the result in the CI report. No parallel schema; no decision changes.

### 1. Types — the envelope field (`packages/types/src/ci.ts`)

- `GateBound = 'upper' | 'lower'` — `upper` = ceiling (measured ≤ target:
  complexity, latency); `lower` = floor (measured ≥ target: coverage).
- `GateMeasurement = { gate, measured, target, bound, unit? }` — the raw facts a
  consumer needs to reconstruct the loss.
- `CICheckResult.measurements?: GateMeasurement[]` — optional, additive; absent
  when a check took no thresholded numeric measurement.
- Export all three from the types barrel.

### 2. Core — the pure loss primitive (`packages/core/src/gate-loss/`)

- `computeGateLoss(m)` → `GateLoss` (`margin`, `proximity`, `loss = proximity²`,
  `degraded?`). `margin` upper = `target - measured`, lower = `measured - target`.
  `proximity` upper = `measured/target`, lower = `target/measured` (both 1 at the
  threshold). Clamp to `MAX_PROXIMITY` and flag `degraded` on divide-by-zero /
  non-finite; never `NaN`/`Infinity`.
- `computeGateLosses(batch)`.
- `accumulateLoss(losses)` → `{ totalLoss, count, meanLoss, perGate }`.
- `detectLossAlarm({ previous, current, allVerdictsGreen, riseThreshold? })` →
  fires only when green AND rising ≥ threshold (default 25%).
- `index.ts` barrel (auto-discovered by `scripts/generate-core-barrel.mjs`; run
  `pnpm run generate:barrels`).

### 3. Dogfood emission (`packages/core/src/ci/check-orchestrator.ts`)

- Introduce internal `CheckContribution = { issues, measurements }`.
- `runTraceabilityCheck` → emit a `lower`-bound coverage measurement for EVERY
  feature (green ones included) when `minCoverage > 0`.
- `runPerfCheck` → emit `upper`-bound complexity/coupling measurements for
  violations.
- `runSingleCheck` collects measurements and attaches them to `CICheckResult`
  only when non-empty (byte-identical output otherwise). Status/exitCode logic
  untouched.

### 4. Surface (`packages/core/src/ci/report-formatter.ts`)

- `formatLossPanel(checks)` — computes losses + accumulation and renders a table;
  returns `''` when no measurements (report unchanged for metric-less runs).

### 5. Tests (`packages/core/tests/gate-loss/`)

- `compute.test.ts` — upper/lower monotonicity, loss==1 at threshold, breach>1,
  robustness (never NaN/Infinity, degraded flags).
- `accumulate.test.ts` — rollup + alarm semantics + the acceptance drift fixture
  (rising loss under all-green + alarm fires before failure).
- `report-panel.test.ts` — panel absent without measurements; present with.

## Verification

- `pnpm run generate:barrels`; build types + core + cli; `tsc --noEmit` core.
- `vitest run tests/gate-loss` and `tests/ci` (existing orchestrator/formatter
  tests must stay green — proves no admission-decision change).

## Closing keyword

`Refs #1673` — emission + loss + accumulation + alarm + dogfood land; outcome-data
calibration and the persisted cross-period telemetry store/dashboard trend panel
are tracked follow-ups.
