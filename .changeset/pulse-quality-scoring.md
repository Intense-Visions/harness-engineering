---
'@harness-engineering/core': patch
---

Wire the `pulse.qualityScoring` runtime path, which was accepted in config but silently ignored (a `TODO(phase-4.5)` no-op in the orchestrator). When `qualityScoring` is enabled and `qualityDimension` is set, `runPulse` now aggregates that dimension's distribution across every successfully-queried source into a `QualitySummary` (`dimension`, merged bucket→count `distribution`, `total`, contributing `sources`) on the orchestrator result, and the pulse report adds a `quality[<dimension>]: <total> sampled across <n> source(s)` headline. When no source reports the dimension the summary is empty (`total: 0, sources: 0`) rather than crashing. The aggregation deliberately surfaces what the data says about the dimension without imposing a good/bad verdict — the consuming skill or human interprets the distribution. When `qualityScoring` is off, behavior is unchanged (`quality` is absent). Exposes `computeQuality` and the `QualitySummary` type.
