---
slug: "context-replay-budget-per-fleet-leaf"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 92
---

### Enforce a context-replay budget per fleet leaf

- **Status:** planned
- **Spec:** —
- **Summary:** Measured local usage across 698 sessions and 321,281 messages: output 120,970,128 tokens against **cache-read 35,989,246,864 — a 298:1 ratio**. Cache creation to cache read is 1:27, so caching itself is healthy; the volume is the problem. The workload is overwhelmingly context *replay*, not generation, which means efficiency work targeted at output tokens addresses 0.3% of spend. Every fresh fleet leaf pays a new context load, so fan-out width multiplies the dominant cost term. Build: a declared context budget per leaf, enforced at dispatch and failing loudly rather than silently spending; batching of queue items per leaf to amortise the load; and routing leaves through `code_outline` / `code_unfold` / `find_context_for` instead of raw file reads. Complements `context-surface-attribution-report-with-exact-token-counts` (#1274), which measures the always-loaded static surface — this item governs the dynamic replay volume that dwarfs it.
- **Blockers:** Depends on cost-per-merged-pr-attribution for a before/after signal
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1524
