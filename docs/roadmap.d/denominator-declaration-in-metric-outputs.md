---
slug: "denominator-declaration-in-metric-outputs"
milestone: "v5.0 — Enforcement Hardening"
order: 98
---

### Metrics must declare their denominator

- **Status:** planned
- **Spec:** —
- **Summary:** A 90-day measurement of 1,957 repositories produced five wrong figures, and every one was a denominator rather than a numerator error: nominal team size used for effective FTE (8 people versus 5.8 effective, and a first pass mis-stated it as 1.3); a 479-member access-control roster treated as engineering headcount; all-time contributor counts used for per-developer rates, overstating a comparison base ~8x; a documentation CMS emitting one commit per page edit inflating an org commit total by 26%; and a scored population selected by the metric carrying the heaviest weight, a closed loop that hid heavy reviewers entirely. Numerators were cross-validated to 0.24% against git; divisors were never checked once. Build: metric outputs carry `{value, numerator, denominator, population_definition}` and a scalar with no stated population fails the emit. Cheap, mechanical, and it catches the error class that silently survives every other check.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1530
