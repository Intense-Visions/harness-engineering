---
slug: "failure-magnitude-scaling"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 144
---

### Failure magnitude-frequency scaling — Gutenberg-Richter monitoring on the incident stream

- **Status:** planned
- **Spec:** —
- **Summary:** Seismology's Gutenberg-Richter law: earthquake magnitudes follow a power law, so the ratio of small to large events (the b-value) is measurable from the frequent small ones — and the fitted distribution prices the rare large one you haven't had yet. The near-miss ledger records events; this fits the distribution over them. Define a failure-magnitude scale from measurable consequences (blast radius reached, rework hours, rollback depth, users/surfaces affected), fit the magnitude-frequency distribution over the incident + near-miss stream, and monitor two quantities: the implied rate of large events (your many small incidents statistically price your rare big one — a forecast, not a vibe) and shifts in the b-value over time, which in some seismic regimes precede large events and here would mean the generating process is changing shape (small failures becoming relatively rarer while the tail fattens is a warning, not a win). Honesty guards built in: power-law fitting on small samples is notoriously abusable, so the fit uses the standard rigorous estimators, reports uncertainty, tests against alternative distributions, and publishes 'no stable fit' as a first-class outcome.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1629
