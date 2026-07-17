---
'@harness-engineering/intelligence': minor
---

perf(triage): suppress reasoning traces on the report levers via Ollama-native think:false (~10× faster)

Reasoning models (Qwen3 et al.) emit a `<think>` trace that Ollama's OpenAI-compatible `/v1`
endpoint neither suppresses nor bounds — it ignores `/no_think`, `think:false`, and
`chat_template_kwargs`. For the triage report's structured-extraction levers (complexity
tie-break, open-decisions) that trace is pure latency with no quality gain — verified: the same
`moderate/high` verdict and the same surfaced decisions with thinking on or off.

- New per-request `AnalysisRequest.disableThinking` flag (advisory, best-effort).
- When set, `OpenAICompatibleAnalysisProvider` takes Ollama's NATIVE `/api/chat` with
  `think:false` (schema enforced via native `format`, output bounded by `num_predict`). Any
  failure — a non-Ollama endpoint (vLLM / LM Studio have no `/api/chat`), network, or parse —
  falls back to the OpenAI-compatible path, which is always correct. The optimization can never
  break a working call.
- The tie-break and open-decisions levers opt in; the brainstorm fork generator does NOT (its
  open-ended reasoning genuinely benefits from thinking).

Measured on qwen3:32b: a single-item report dropped from ~2m03s to ~11.6s.
