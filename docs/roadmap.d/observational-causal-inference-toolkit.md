---
slug: "observational-causal-inference-toolkit"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 134
---

### Causal answers when you cannot randomize

- **Status:** planned
- **Spec:** —
- **Summary:** `controlled-experiment-harness-for-its-own-effect` covers the cases where assignment can be held. Most real adoption questions are not those cases: teams adopt when they choose, rollouts are staggered by readiness, and nobody will randomize a production org to settle a tooling debate. Econometrics spent fifty years on exactly this: difference-in-differences (adopters vs non-adopters, before vs after, so secular trends cancel), synthetic control (a weighted composite of non-adopting repositories that tracked the adopter's pre-adoption trajectory becomes its counterfactual), and event-study designs around staggered rollouts. A 90-day measurement across a 1,957-repository organisation produced a defensible throughput effect and could not distinguish tool causation from cohort self-selection — precisely the gap these methods close, and the same repository population is the donor pool synthetic control needs. Build: the estimators packaged over telemetry the harness already collects, pre-registered outcome definitions shared with the experiment harness, and mandatory reporting of the identifying assumption alongside every estimate — a DiD that hides its parallel-trends assumption is marketing, not measurement.
- **Blockers:** Depends on `denominator-declaration-in-metric-outputs`
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1566
