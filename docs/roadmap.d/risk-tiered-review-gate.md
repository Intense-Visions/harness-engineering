---
slug: "risk-tiered-review-gate"
milestone: "v5.0 — Enforcement Hardening"
order: 95
---

### Risk-tier the review gate instead of reviewing uniformly

- **Status:** planned
- **Spec:** —
- **Summary:** Measured on a dogfood consumer: of 3,252 non-merge commits in 90 days, **110 respond to review feedback — 3.4%**. One reviewer gave 314 reviews in the same window, 89% of them to two authors. Uniform human review of every pull request therefore changes something roughly once in thirty, while consuming the scarcest resource in the system — and review, not authoring, is the ceiling once throughput rises (nine engineers at 150 PRs/quarter implies ~1,000 reviews/quarter for whoever holds it). The 3.4% figure understates somewhat, since an agent may fold feedback in before committing, but the direction is unambiguous. Build: a declared risk tier per path — PHI and money paths, migrations, public API surface, security gates — where human review is mandatory, and agent review on the same gates elsewhere. Pairs with `pre-merge-brief` as the human-facing summary on the tiers that keep eyes.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1527
