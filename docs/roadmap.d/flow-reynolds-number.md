---
slug: "flow-reynolds-number"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 141
---

### A Reynolds number for development flow — predicting the laminar–turbulent transition

- **Status:** planned
- **Spec:** —
- **Summary:** Fluid flow transitions from laminar to turbulent when one dimensionless ratio — inertia over viscosity — crosses a critical value; the transition is sharp, and operating near it is the danger zone. Development flow has the same phenomenology: below some load, merges flow orderly; above it, conflict cascades, rework eddies, and revert chains appear abruptly. Define the analog: Re = (change velocity × coupling density) / verification viscosity, where all three inputs are already measurable — merge rate, import-graph density over the touched surface, and gate latency/depth. Turbulence has observable proxies too: conflict rate, rework rate, revert chains, re-review loops. The deliverable is not the metaphor but the fitted threshold: compute Re continuously per repo/surface, fit the critical value empirically from observed turbulence onsets across telemetry history, and expose distance-to-transition as a first-class signal the concurrency governors consume — raise viscosity (batching, gating) or reduce coupling before the transition, not after. Guard against the known failure mode of composite indices: Re is only kept if it predicts turbulence onset out-of-sample better than its strongest single component.
- **Blockers:** Depends on `feedback-control-for-governors` and `queueing-model-for-pipeline-capacity`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1610
