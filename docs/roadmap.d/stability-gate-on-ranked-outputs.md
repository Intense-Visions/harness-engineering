---
slug: "stability-gate-on-ranked-outputs"
milestone: "v5.0 — Enforcement Hardening"
order: 97
---

### Never emit a ranked list without a stability check

- **Status:** planned
- **Spec:** —
- **Summary:** A contributor-scoring exercise across 69 people and two adjacent 45-day windows produced a Spearman rank correlation of **0.62 overall, near zero in the middle band, with a mean movement of 12–15 places**. Individual position was not reproducible; only broad tier membership was. The same exercise also produced an invalid band analysis on the first pass — bands defined by the *mean* of two measurements force those measurements to anti-correlate within band, yielding impossible negative correlations. Both failure modes apply to every ranked output the harness emits: hotspots, risk areas, craft targets, critical paths, skill recommendations. Build: any ordered output computes over two windows, reports the correlation, and **degrades to tiers when correlation is low** rather than presenting a spurious order; bands are always defined on one window and validated against the other, never on the average. Turns a methodological trap into a mechanical guard.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1529
