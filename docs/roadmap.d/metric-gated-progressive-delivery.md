---
slug: "metric-gated-progressive-delivery"
milestone: "Full-lifecycle reach"
order: 8
---

### Metric-gated progressive delivery — automated canary rollout as the shipping gate

- **Status:** planned
- **Spec:** —
- **Summary:** The roadmap's production story is reactive: closed-loop remediation responds to signals after full exposure. The field-standard preventive half is progressive delivery — every change reaches a small exposure slice first, promotion to wider exposure is gated on measured health metrics against the baseline, and regression triggers automatic halt and rollback with the evidence attached. Integrate it as the terminal pipeline stage: rollout policies per deployable (slice sequence, promotion metrics, guardrail thresholds, bake times), automated promotion/halt decisions from the same telemetry discipline the rest of the roadmap builds, and the halt evidence packet flowing back into the pipeline as a first-class failure (feeding remediation, the near-miss ledger, and failure-magnitude accounting). Prefer integrating the established rollout controllers where the adopter's platform has one, with the harness supplying policy, verdicts, and evidence handling rather than reinventing traffic shaping. Unattended landing at scale is only defensible when exposure is also incremental — this is the item that makes 'agents ship to production' a bounded-blast-radius claim instead of a hope.
- **Blockers:** Depends on `closed-loop-remediation-on-production-signal`, `failure-magnitude-scaling`, and `near-miss-ledger-and-leading-indicators`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1644
