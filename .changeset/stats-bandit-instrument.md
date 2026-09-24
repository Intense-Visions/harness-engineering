---
'@harness-engineering/stats': minor
---

`stats.bandit` is live: `BanditLedger` (synchronous JSONL append, bucketed fold with half-life decay and late scoring by `ref`), `foldArms`, `choose` under the `scoutFraction` and `thompson` policies with an injectable `rng`, default utilities `outcomeOnly` / `outcomePerDollar`, config validation, and typed `NoEligibleArmsError` / `InvalidBanditConfigError`.
