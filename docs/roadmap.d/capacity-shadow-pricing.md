---
slug: "capacity-shadow-pricing"
milestone: "Fleet Family — Batch Orchestration"
order: 137
---

### Shadow prices on shared capacity instead of static quotas

- **Status:** planned
- **Spec:** —
- **Summary:** `unified-work-admission-control` enforces a declared allocation between competing consumers of review attention, compute and merge slots. Static allocations have a known failure mode at scale: they are wrong most of the time, because demand shifts faster than anyone re-declares quotas, and the cost of misallocation is invisible — nobody sees the high-value work queued behind a reserved-but-idle share. The economic instrument is the shadow price: let each capacity pool carry a price that rises with contention, let intents carry budgets derived from their expected value (`value-per-spend-routing` supplies the valuation), and let dispatch order fall out of willingness-to-pay rather than static rank. Large schedulers converged on this shape for the same reason markets exist — prices aggregate dispersed information about scarcity that no central declaration keeps current. Scope guard stated plainly: this is priority arbitration *inside* declared bounds, not a replacement for them — safety gates, trust tiers and the human-attention floor for inbound work are never priced, and the admission controller's declared allocation remains the outer constraint the market clears within.
- **Blockers:** Depends on `unified-work-admission-control` and `value-per-spend-routing`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1569
