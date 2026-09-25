---
'@harness-engineering/stats': minor
---

`stats.bandit` is live: `BanditLedger` (synchronous JSONL append, bucketed fold with half-life decay and late scoring by `ref`), `foldArms`, `choose` under the `scoutFraction` and `thompson` policies with an injectable `rng`, default utilities `outcomeOnly` / `outcomePerDollar`, config validation that fills the spec defaults for every field but `policy` (`DEFAULT_SCOUT_FRACTION`, `DEFAULT_HALF_LIFE_DAYS`, `DEFAULT_MIN_EFFECTIVE_N`, `DEFAULT_PRIOR`), and typed `NoEligibleArmsError` / `InvalidBanditConfigError`.
