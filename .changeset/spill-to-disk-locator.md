---
'@harness-engineering/core': minor
---

feat(state): spill-to-disk with a followup-readable locator for large tool output (#1398)

Add a spill backend to `packages/core` session/state handling. `spillIfNeeded`
offloads tool output over a configurable byte threshold (default 30 KB, overridable
via the `thresholdBytes` option or `HARNESS_SPILL_THRESHOLD_BYTES`) to a `spill/`
subdirectory of the resolved state area and returns a stable, followup-readable
locator (`harness-spill:<repo-relative-path>`); output under the threshold passes
through inline unchanged. `readSpill` recovers the full content by locator and
`searchSpill` greps it line-by-line, so fleet workers and autopilot sessions can
offload large test logs, full diffs, or grep/glob overflow and reference them by
locator instead of losing the tail or blowing the context budget.
