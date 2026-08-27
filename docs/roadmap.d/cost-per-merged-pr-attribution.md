---
slug: "cost-per-merged-pr-attribution"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 90
---

### Join burn's token attribution to shipped outcomes — cost per merged PR

- **Status:** planned
- **Spec:** —
- **Summary:** `per-subagent-token-attribution-in-burn` (#1270, done) established per-subagent and per-fleet-lane token attribution from the transcript scan. Nothing joins that spend to an outcome, so the harness cannot answer the only question that governs whether the autonomous tier scales: **what does one merged pull request cost?** Evidence from a 90-day measurement across a 1,957-repository organisation: one operator at 22.1 merged PRs per weekday was running at ~78% of a weekly usage budget, so replicating that operating pattern across nine engineers is a procurement problem before it is a tooling one — and the arithmetic was invisible until computed by hand. Build: attribute each fleet lane's token spend to the PR (or PRs) it produced, via the existing lane provenance file plus branch/PR linkage, and emit `{tokens_in, tokens_out, cache_read, prs_merged, cost_per_pr}` per lane and per skill. Enables cost regressions to be caught like performance regressions, and makes every efficiency item below measurable rather than argued. Note the denominator trap this item must avoid: dividing spend by *merged* PRs ignores lanes that produced nothing, so the figure is only honest once fleet failure categorisation lands.
- **Blockers:** Needs fleet success rate as a denominator — `extend-adoption-jsonl-with-failure-reason-categorization` is blocked, so cost-per-PR would currently divide by completed lanes only and understate true cost per shipped unit
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1522
