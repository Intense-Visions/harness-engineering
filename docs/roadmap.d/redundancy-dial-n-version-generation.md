---
slug: "redundancy-dial-n-version-generation"
milestone: "v5.0 — Enforcement Hardening"
order: 131
---

### Reliability as a purchasable quantity: N-version generation with voting

- **Status:** planned
- **Spec:** —
- **Summary:** Information theory's oldest trade: reliability over a noisy channel is purchasable with redundancy, at a known rate cost. Agent generation is the noisy channel; today the harness sends every change through it once and spends the redundancy budget on *checking*. For the highest-consequence changes, spend it on *generation* instead: k independent implementations of the same intent (different models, seeds, or decomposition angles — diversity is the load-bearing property), behavioral cross-checking of the candidates against each other and the acceptance criteria, and either majority agreement or divergence escalated to a human with the disagreement itself as the evidence. Divergence is the free gift: where independent implementations disagree is precisely where the specification was ambiguous, caught *before* merge rather than in production. Build as a per-risk-tier dial bound to `risk-tiered-review-gate`'s path classification — k=1 for routine surfaces, k=3+ on the paths where being wrong is expensive — with the cost curve reported per tier so the reliability/spend trade is an explicit decision. Orchestration patterns for this exist in the workflow layer; this item makes it a declared, budgeted gate policy rather than an ad-hoc pattern.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1563
