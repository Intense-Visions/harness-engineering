---
'@harness-engineering/local-models': minor
---

Add an agentic-suitability dimension to the pool ranker so a
fits-VRAM-but-unusable model is never routed autonomous work. Each
`RankedModel` gains `agenticScore`, `agenticEligible`, and `agenticReasons`
alongside the existing `score` (default ordering unchanged). The score
composes a HARD tool-calling gate (a model that can't emit `tool_calls` is
ineligible, not merely down-ranked), a measured agentic-latency gate/curve
(a model over the latency budget is ineligible; under budget it scales
inversely with latency), and existing benchmark quality. The ranker stays
pure — signals arrive as candidate inputs; a new `probeAgenticSignals`
helper (the only I/O, fail-open) fills them from the #833 tool-calling probe
plus a timed agentic call.
