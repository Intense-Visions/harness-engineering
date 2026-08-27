---
slug: "aimd-concurrency-control"
milestone: "Fleet Family — Batch Orchestration"
order: 139
---

### AIMD congestion control for fleet concurrency

- **Status:** planned
- **Spec:** —
- **Summary:** The internet's congestion control discovers available capacity with no global knowledge: additive increase while the path is clean, multiplicative decrease on loss, and the equilibrium is both efficient and fair across flows. Fleet concurrency today is a static cap — wrong in both directions, idle when capacity is free and thrashing when it isn't. Replace it with AIMD per lane: each fleet lane probes upward (+1 agent per clean interval) and backs off multiplicatively on a 'loss' signal — merge conflict, CI queue saturation, provider rate-limit, verification-latency blowup, or a cavitation/turbulence warning from the sibling detectors. This is the online controller that complements the offline model: the scalability-law fit describes the capacity curve, AIMD finds the operating point without needing the model to be right, and disagreement between them is itself a signal. Fairness falls out for free: multiple lanes AIMD-sharing one capacity pool converge toward equal shares without central arbitration, and weighted variants implement the admission controller's declared priorities. Guard the known failure mode: loss signals must be debounced and classified (a flaky CI failure is not congestion), or the controller oscillates on noise.
- **Blockers:** Depends on `rate-limit-aware-fan-out-governor` and `scalability-law-fit-for-fleet-concurrency`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1606
