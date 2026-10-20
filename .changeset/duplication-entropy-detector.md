---
'@harness-engineering/core': minor
---

Wire duplication detection into the entropy pipeline: `detectDuplication`, the
`DuplicationReport` type, `EntropyConfig.analyze.duplication`,
`EntropyReport.duplication`, and `'duplication'` on the `AnalysisError['analyzer']`
union. Discovery is driven solely by `EntropyConfig.include` / `exclude`; per-file
read and parse failures become `AnalysisError`s with `analyzer: 'duplication'`
rather than failing the run; severity is advisory only, so duplication adds
nothing to `summary.errors` or `summary.warnings`. Also makes
`normalizeTokens` locate its range by binary search instead of rescanning each
file's whole token array per unit — measured at 214,112,239 token visits before
versus 1,975,735 after over this repository's non-test sources, with identical
output. Phase 2 of the DRY-floor spec — no CLI or MCP surface yet.
