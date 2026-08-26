---
slug: "queueing-model-for-pipeline-capacity"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 123
---

### Run the delivery pipeline as a queueing system with a utilisation target

- **Status:** planned
- **Spec:** —
- **Summary:** The pipeline is a queueing network — intake, decomposition, execution, verification, review, merge, release — and queueing theory makes hard, non-obvious predictions about it. Kingman's formula: wait time explodes non-linearly as any stage's utilisation approaches 100%, multiplied by variance in arrival and service times. The practical consequences run against engineering intuition: a review stage at 95% utilisation is not efficient, it is a latency bomb; large batch-size variance (one-line fixes mixed with thousand-line features in the same queue) inflates everyone's wait; and adding capacity at a non-bottleneck stage does nothing. Measured evidence already on hand: a consumer whose merge stage ran fine while its release stage sat at zero throughput accumulated 138 units of unshipped inventory — a classic unbalanced-line failure. Build: model each stage with arrival rate, service time and its variance from telemetry the harness already has; report utilisation and predicted-vs-observed wait per stage; flag any stage above a declared utilisation target (queueing practice says ~80%); and size batches to cut service-time variance. This reframes `team-level-capacity-governor` from a static allocator into a control loop with a law behind it.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1555
