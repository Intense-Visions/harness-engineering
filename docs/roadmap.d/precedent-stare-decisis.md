---
slug: "precedent-stare-decisis"
milestone: "v5.0 — Enforcement Hardening"
order: 138
---

### Precedent — stare decisis for recurring judgment calls

- **Status:** planned
- **Spec:** —
- **Summary:** Courts achieve consistency at scale without re-litigating every question through stare decisis: adjudicated decisions bind materially similar future cases, distinguished only when facts genuinely differ, and overruled only deliberately at a higher standard. Agent pipelines re-litigate constantly — the same judgment call (is this dependency acceptable, does this pattern violate the boundary, is this test flaky-or-broken) is re-decided from scratch by every agent that meets it, with drift between decisions as pure noise. Build the precedent system: when a judgment call is adjudicated (by a human, a panel, or an uncontested gate verdict of declared precedential weight), it becomes a citable precedent — facts, question, holding, rationale; future agents facing a materially similar question retrieve and follow it, citing it in their justification, or explicitly distinguish it stating which material facts differ. Overruling is a first-class deliberate act at a higher review standard, never silent divergence. Distinct from the rejection ledger (dead ideas) and compiled knowledge (facts): precedent binds *decisions*. The measurable win is consistency: the same question answered the same way everywhere, with drift visible as distinguish/overrule events instead of silent noise.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1660
