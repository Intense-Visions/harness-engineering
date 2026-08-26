---
slug: "rate-limit-aware-fan-out-governor"
milestone: "Parallel Execution & State"
order: 100
---

### Make fan-out rate-limit aware, not just slot aware

- **Status:** planned
- **Spec:** —
- **Summary:** Fleet concurrency is governed by compute slots (`min(16, CPUs - 2)` per workflow, with `fleet-command` holding each lane to a share of a global pool) but not by the API budgets the leaves actually consume. Measured during a 90-day org analysis: GitHub **code search is capped at 10 requests per minute**, and secondary rate limits fired repeatedly under modest parallelism — 10-way fan-out on the commits API produced silent under-fetching that returned wrong answers rather than errors (287 of 430 repositories read as zero). A slot-governed fleet whose leaves are API-bound will therefore degrade into throttling and, worse, into quietly incomplete results. Build: per-resource budgets alongside slot budgets, backoff shared across a fleet rather than per-leaf, and a hard rule that a truncated or throttled fetch fails the leaf instead of returning partial data. Pairs with `standardize-parallel-execution`; the failure mode is correctness, not just speed.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1532
