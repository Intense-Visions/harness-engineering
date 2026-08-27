---
slug: "near-miss-ledger-and-leading-indicators"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 133
---

### A near-miss ledger: leading indicators before the incident

- **Status:** planned
- **Spec:** —
- **Summary:** Safety engineering's core empirical result is that serious incidents sit atop a much larger, observable base of near-misses, and that the *ratio* moves before the incident rate does. The harness generates near-misses constantly and discards them: a gate catch is a defect that almost merged; a revert is a defect that almost shipped; a flake that passed on retry is a verification hole; an injected fault that escaped one gate but not the next (`mutation-testing-the-gate-stack`) is a measured hole. Build: a unified near-miss ledger with a small taxonomy (caught-at-gate, caught-at-review, reverted-post-merge, escaped-to-production), per-surface ratios tracked over time, and statistical process control on the series — Shewhart/EWMA control charts so alerts fire on special-cause variation rather than on noise, which is the century-old answer to the alert fatigue every other metrics item on this roadmap will otherwise produce. The payoff is the one thing lagging metrics cannot give: a surface whose near-miss ratio is deteriorating is announcing its next incident while there is still time to spend verification budget on it.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1565
