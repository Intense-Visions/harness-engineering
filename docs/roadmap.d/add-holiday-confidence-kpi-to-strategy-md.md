---
slug: "add-holiday-confidence-kpi-to-strategy-md"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 3
---

### Add Holiday Confidence KPI to STRATEGY.md

- **Status:** planned
- **Spec:** —
- **Summary:** `STRATEGY.md:23-29` defines 5 KPIs (Agent Autonomy, Harness Coverage, Context Density, Drift Floor, External Adoption) — all measure inputs to the harness, none measures what the harness is FOR. Add KPI #6: "Holiday Confidence" — % of merged PRs in the last 30 days where (a) multi-persona review fired, (b) outcome-eval passed, (c) no auto-baseline-update occurred, (d) no signal exceeded threshold. The article's binary "if the senior disappears for two weeks, what holds?" made measurable. Source: Pass 1 #9.
- **Blockers:** Build harness:outcome-eval skill, Ship the 5-signal dashboard panel and signals.md doc
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#552
