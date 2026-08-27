---
slug: "kelly-criterion-budget-staking"
milestone: "Fleet Family — Batch Orchestration"
order: 146
---

### Kelly staking — bet-sizing token budgets by edge and ruin avoidance

- **Status:** planned
- **Spec:** —
- **Summary:** Gambling mathematics solved optimal bet sizing under uncertainty: the Kelly criterion stakes a fraction of bankroll proportional to your edge (probability-weighted payoff vs. cost), maximizing long-run growth while making ruin probability-zero — over-betting a finite bankroll is ruinous even with positive edge, and under-betting forfeits compounding. Token budgets are a bankroll and intents are bets: each has a success probability (the IRT model supplies it, calibrated), a payoff (value-per-spend supplies the valuation), and a stake (the token budget allocated). Today stakes are sized by task-shape convention, which commits both Kelly sins — big speculative bets that can exhaust a period's budget on low-probability work, and timid stakes on high-edge work that leave growth unrealized. Build the staking layer: per intent, compute the Kelly fraction from calibrated success probability and expected payoff; stake fractional Kelly (half-Kelly is the practitioner standard — full Kelly assumes your probabilities are exact, and ours carry uncertainty); enforce the ruin constraint at the portfolio level (total staked never exceeds the declared bankroll fraction); and log realized outcomes back to sharpen the edge estimates. The discipline's deepest import is the ruin asymmetry: a budget that hits zero mid-period stops all compounding, so survival dominates any single bet's optimality.
- **Blockers:** Depends on `budget-governor-for-unattended-dispatch`, `capacity-shadow-pricing`, `irt-capability-difficulty-model`, and `value-per-spend-routing`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1668
