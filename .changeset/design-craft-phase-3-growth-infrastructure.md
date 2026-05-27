---
'@harness-engineering/cli': minor
---

design-craft Phase 3 increment: ship the growth-infrastructure half of ADR 0020 (living catalog H pattern). Adds `packages/cli/src/design-craft/measurement/` with `recordTrigger`, `recordApply`, `recordCite`, and `getCatalogStats` (file-backed per-project counters under `.harness/design-craft/usage.json`) plus a CRITIQUE-recurrence signal feedback loop (`recordSignalEvent` + `proposeFromRecurringFindings`) that materialises candidate pattern proposals to `.harness/design-craft/proposals/` when a finding shape recurs ≥ N (default 5) times across ≥ 2 distinct projects. The hot path stays cheap (O(1) JSONL append per finding); aggregation runs out-of-band. `mcp__harness__design_craft` now wires every CRITIQUE / POLISH / BENCHMARK run into the counters and event log; tests inject `__recordMeasurement: false` to opt out.
