---
'@harness-engineering/dashboard': minor
---

Add a curated five-signal dashboard panel as the default landing view. A new `/s/signals` page (with `/` redirecting to it) renders five signals — `pr-merged-without-multi-persona-review`, `coverage-trend-down-30d`, `complexity-trend-up-30d`, `baseline-auto-update-count`, and `eval-fail-rate` — each with current value, 30-day trend, threshold status, and a sparkline. Backed by a `SignalProvider` registry, a shared `SignalTimelineStore` (hybrid derive-now + cache to `.harness/signals/timeline.json`), and a `GET /api/signals` route that isolates per-signal failures via `Promise.allSettled`. `eval-fail-rate` consumes `harness:outcome-eval` verdicts through the knowledge graph's `execution_outcome` nodes with zero code coupling (documented in ADR 0037). Implements roadmap #534; signals documented in `docs/standard/signals.md`.
