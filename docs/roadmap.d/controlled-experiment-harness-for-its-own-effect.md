---
slug: "controlled-experiment-harness-for-its-own-effect"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 119
---

### Let the harness run a controlled experiment on its own effect

- **Status:** planned
- **Spec:** —
- **Summary:** Every effectiveness claim the harness can make today is observational, and observational claims about engineering process are close to unfalsifiable. A 90-day measurement across 1,957 repositories produced a defensible 6x throughput-per-effective-head figure and could not establish that the harness caused any of it — the inflection coincided with other changes, the high-output cohort self-selected, failed adoption leaves no trace, and no counterfactual exists. That is a structural limit of observation, not a gap in rigour, and it will not close with more telemetry. Build the experiment instead: surface-level assignment (a declared set of repositories or work-streams runs with a capability enabled, a matched set runs without), pre-registered outcome measures so the metric cannot be chosen after the result, a stability requirement across at least two windows before a verdict, and refusal to report an effect when assignment was not held. Applies to any capability — a fleet, a gate tier, model routing, an enablement cohort. Nothing else on this roadmap can distinguish "the harness works" from "the people who adopt the harness were already fast," and that distinction is the whole adoption argument.
- **Blockers:** Depends on `denominator-declaration-in-metric-outputs` and `stability-gate-on-ranked-outputs` for the measurement floor
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1551
