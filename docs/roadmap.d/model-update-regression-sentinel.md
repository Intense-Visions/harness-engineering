---
slug: "model-update-regression-sentinel"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 139
---

### Model-update regression sentinel — supplier change-control for the underlying model

- **Status:** planned
- **Spec:** —
- **Summary:** The underlying model is the harness's most load-bearing dependency and the only one with no change control: versions update silently, behavior shifts (tool-call fidelity, verdict distributions, latency, cost, refusal patterns), and every installation discovers the shift through a broken workflow. Treat the model as a vendored dependency. Maintain a pinned sentinel suite of representative tasks (tool-loop execution, judge verdicts on fixed cases, structured-output conformance, latency/cost probes); re-run it whenever the resolved model version changes (and on schedule as a canary against unannounced changes); diff the results against the pinned baseline; and produce the changelog the supplier didn't write. Material drift gates routing — the router holds or falls back until a human reviews the drift report. Distinct from `bandit-allocation-with-sequential-stopping` (allocation among models) and `judge-calibration-against-realized-outcomes` (judge quality): this is upstream change detection. Every firing is a trust event: the harness noticed the model changed before the team did.
- **Blockers:** Depends on `bandit-allocation-with-sequential-stopping` and `judge-calibration-against-realized-outcomes`
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1617
