---
slug: "normal-accidents-coupling-audit"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 154
---

### Normal-accidents audit — interactive complexity × tight coupling of the orchestration system itself

- **Status:** planned
- **Spec:** —
- **Summary:** Perrow's Normal Accidents gives a two-axis diagnosis of when systems produce accidents no component failure explains: interactive complexity (components interact in unplanned, unexpected ways) crossed with tight coupling (failures propagate faster than intervention) — systems in the high/high quadrant have 'normal' accidents, meaning structurally inevitable, and the mitigation is moving on the axes, not adding components (each added safety device raises interactive complexity and can worsen the quadrant). The dependency-percolation item audits the *code*; nothing audits the *orchestration system itself* — and this roadmap has spent six rounds adding interacting components to it: governors reading detectors feeding admission control gating fleets writing markers consumed by governors. That is interactive complexity by construction, and pieces of it are tightly coupled (synchronous gate chains, shared budget pools). Build the audit: map the orchestration system's own interaction graph (which mechanisms read/write which signals and stores), score interaction unexpectedness (interactions present in telemetry but absent from design docs are the dangerous kind), measure coupling tightness (propagation speed vs. intervention latency per path), place the system on the Perrow quadrant, and — the actionable half — rank the specific decoupling moves (async boundaries, buffers, circuit breakers between mechanisms) that shift it leftward. The uncomfortable, honest purpose: this roadmap is its own biggest source of the risk this item measures.
- **Blockers:** Depends on `dependency-percolation-margin` and `model-check-the-orchestration-protocol`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1669
