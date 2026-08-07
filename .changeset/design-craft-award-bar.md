---
'@harness-engineering/cli': minor
---

Add a machine-derived award-tier verdict (`awardBar`) to the design-craft
BENCHMARK output. Every `BenchmarkScore` now carries
`awardBar: { verdict: 'cleared' | 'not-cleared' | 'indeterminate'; dimensions; shortfalls; reason? }`,
computed in TypeScript from the 5-dimension radar and the cited exemplars'
reference scores — never emitted by the LLM (the authority-in-TS pattern used
by outcome-eval / acceptance-eval). The bar is per-dimension rather than a
single overall threshold, because an equal-weight mean hides a weak axis: each
dimension must reach `max(dimensionFloor, round(fraction × median(cited-exemplar
references)))`, so the verdict fails on the exact axis that falls short. Any
dimension whose confidence is below the floor forces `indeterminate` — a score
the model is unsure about never certifies award tier. Thresholds are tunable via
`design.craft.benchmark.awardBar` (`dimensionFloor` default 80, `fraction`
default 0.95, `confidenceFloor` default medium); omit the block for defaults.
This replaces free-hand "is this good enough?" judgment with an honest,
corpus-calibrated machine signal downstream agents can read directly.
