---
slug: "bandit-allocation-with-sequential-stopping"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 125
---

### Explore/exploit allocation for routing decisions, with early stopping

- **Status:** planned
- **Spec:** —
- **Summary:** The harness makes the same routing decisions thousands of times — which model tier for this task class, which reviewer configuration, which decomposition strategy — and currently either fixes them by config or (in `adaptive-model-routing`) escalates on failure. Fixed policies pay a hidden price: they never learn whether the cheaper option became good enough, and the volume that makes agentic systems expensive is exactly the volume that makes learning cheap. Build the two standard instruments. First, bandit allocation (Thompson sampling) over repeated routing decisions: mostly exploit the best-known arm, always spend a small declared fraction exploring alternatives, converge automatically as evidence accumulates — bounded regret instead of permanent guessing. Second, sequential testing (SPRT-style) for the one-shot questions `controlled-experiment-harness-for-its-own-effect` asks: instead of fixing a sample size up front, stop the moment the evidence crosses a declared threshold — typically halving the cost of an answer at the same error rates. Both must respect the existing floor: explored arms still pass every gate; exploration varies *cost*, never *safety*. Together they make the harness the first tool in this category whose routing decisions provably improve with use.
- **Blockers:** Depends on `cost-per-merged-pr-attribution` for the reward signal
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1557
