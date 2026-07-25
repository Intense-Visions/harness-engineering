---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): let the outcome-eval judge be a dedicated fast backend

The local outcome-eval gate (the reasoner-as-judge) derived its analysis endpoint/
model from the THINKING-mode backend — the reasoner. But a reasoning model (qwen3)
is unusable as the judge on the OpenAI `/v1` endpoint: reasoning cannot be disabled
there, so a small token budget returns empty content and a large one stalls for
minutes. (Fast non-reasoning models judge the same spec-vs-diff correctly in ~8s.)

`deriveAnalysisEnv` now prefers `routing.intelligence.sel` — the already-designated
analysis/SEL-layer backend — over `routing.modes.thinking`, falling back to the
thinking backend only when no analysis backend is configured. So an operator points
`routing.intelligence.sel` at a fast non-reasoning backend to judge quickly, while
the reasoner keeps doing design (where thinking-on and slow is fine).
