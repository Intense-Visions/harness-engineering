---
slug: "adoption-funnel-telemetry"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 140
---

### Adoption-funnel telemetry — instrument the on-ramp itself

- **Status:** planned
- **Spec:** —
- **Summary:** The minimal init tier built a fast on-ramp; nothing measures it. Adopter ramp is a funnel like any product funnel — install → first init → first gate run → first verified PR → steady state — and today every stall is invisible: which gate, which config step, which permission prompt loses people is unknown, so onboarding improves by anecdote. Instrument the funnel: local-first telemetry (opt-in, anonymized, aggregate) records per-stage timestamps and stall points; time-to-first-verified-PR becomes the on-ramp's north-star metric; and per-gate/per-config stall distributions feed directly back into init-tier design the way the rest of the system already improves from its own evidence. The self-referential payoff: the harness applies its own telemetry discipline to its own adoption, which is also a credibility statement to adopters — measured, denominated, stability-checked funnel metrics in the project's own dashboard.
- **Blockers:** Depends on `denominator-declaration-in-metric-outputs`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1604
