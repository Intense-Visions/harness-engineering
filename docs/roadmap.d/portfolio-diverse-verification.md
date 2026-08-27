---
slug: "portfolio-diverse-verification"
milestone: "v5.0 — Enforcement Hardening"
order: 135
---

### Portfolio-diverse verification — correlation-aware panel construction

- **Status:** planned
- **Spec:** —
- **Summary:** N-version verification buys safety only if the versions fail independently, and agents sharing a model family, prompt lineage, or training distribution have correlated failure modes — three verifiers that share a blind spot are one verifier at three times the price. Portfolio theory solved exactly this: expected return per unit risk is optimized not by picking the best assets but by picking assets whose risks don't co-move. Measure the failure-correlation matrix empirically: across model/prompt/temperature/tooling variants, on a shared corpus of known-answer cases (the drills and mutation-testing items generate exactly this corpus), record which variants miss the same defects. Then construct verification panels on the efficient frontier — maximum expected detection per token, accounting for correlation — instead of by redundancy count. The practical consequences are concrete: a cheaper, weaker verifier with uncorrelated blind spots can beat a second copy of the strong one; panel composition becomes a portfolio-rebalancing problem as the correlation matrix drifts (model updates change it — the sentinel item detects when to re-measure); and the redundancy dial stops assuming independence it never verified.
- **Blockers:** Depends on `known-answer-pipeline-drills`, `model-update-regression-sentinel`, `mutation-testing-the-gate-stack`, and `redundancy-dial-n-version-generation`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1631
