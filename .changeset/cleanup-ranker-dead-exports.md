---
'@harness-engineering/local-models': patch
---

chore(cleanup): remove dead `isRankProfile` and narrow four ranker-internal
constants to module scope.

Deletes the genuinely-dead `isRankProfile` helper (`ranker/profiles.ts`, zero
repo-wide callers) and drops the redundant `export` keyword from four ranker
constants that are only read within their own module —
`KV_CACHE_BYTES_PER_TOKEN_PER_BILLION_PARAMS_FP16` and `KV_QUANT_MULTIPLIER`
(`vram.ts`), `CPU_BANDWIDTH_FLOOR_GBPS` (`speed.ts`), and
`UNMEASURED_LATENCY_DISCOUNT` (`agentic.ts`). No behavior change; these were
swept into the package barrel via `export *` but imported by name nowhere.
