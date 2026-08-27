---
slug: "metrology-calibration-chains"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 146
---

### Metrology discipline — calibration chains and golden references for every instrument

- **Status:** planned
- **Spec:** —
- **Summary:** Physical science never trusts an instrument that is not traceable to a reference standard on a recalibration schedule; this roadmap has been adding instruments for rounds with no golden references, no traceability, no recalibration cadence. Build the metrology layer: every measurement instrument (detectors, judges, estimators, scores) registers a golden-reference fixture set with known answers, a measured accuracy against it, a recalibration schedule, and a traceability record (which reference version validated which instrument version). An instrument whose calibration is expired or failing is marked untrusted and its outputs carry that flag downstream — an uncalibrated number renders with its status, never as bare truth. This is what makes the Goodhart sentinel enforceable and what keeps instrument drift (model updates change judge behavior; codebase drift changes detector baselines) from silently corrupting every downstream decision.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1645
