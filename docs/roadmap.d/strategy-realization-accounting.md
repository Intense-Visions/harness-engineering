---
slug: "strategy-realization-accounting"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 147
---

### Strategy realization accounting — did the shipped portfolio move the declared strategy?

- **Status:** planned
- **Spec:** —
- **Summary:** Everything on the roadmap measures whether work is done well; nothing measures whether the portfolio of shipped work moved the declared strategy. At high throughput the characteristic failure is not bad work but orthogonal work — a fleet velocity-optimizing into directions nobody chose. Build the accounting: every merged item traces to a strategy track (the linkage already exists at ideation time and is discarded at merge time — keep it); per track, aggregate shipped effort and cost; and compare against the strategy's own declared success measures, reporting realized displacement per track per window. The alarms are the point: a track consuming effort with no measurable displacement (busy-but-stuck), and shipped effort concentrating in work traceable to no track at all (velocity without direction). This closes the loop that value-per-spend routing opens: routing prices work going in; realization accounting audits what came out.
- **Blockers:** Depends on `intent-as-the-unit-of-record` and `value-per-spend-routing`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1649
