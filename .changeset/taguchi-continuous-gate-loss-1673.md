---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
---

feat(gate-loss): emit continuous distance-to-threshold ("loss") alongside binary
gate verdicts, so "passed barely" and "passed comfortably" are distinguishable
(#1673).

Adds `GateBound`/`GateMeasurement` to `types` and an optional additive
`CICheckResult.measurements` field (absent when empty, so metric-less checks
serialize byte-identically). Adds a pure `gate-loss` module to `core`:
`computeGateLoss` (signed margin, normalized proximity, quadratic
`loss = proximity²` comparable across gates, robust — never `NaN`/`Infinity`),
`accumulateLoss` (per change/surface/period rollup; degraded points excluded),
and `detectLossAlarm` (fires on rising loss while every binary verdict stays
green — the leading indicator). Dogfoods emission from this repo's own
traceability (coverage, emitted even while green) and perf (complexity/coupling)
gates, and renders a continuous-loss panel in the CI report.

Emission/measurement only — no gate's pass/fail decision changed. Outcome-data
calibration and a persisted cross-period telemetry store/dashboard trend panel
are tracked follow-ups (`Refs #1673`).
