---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

feat(orchestrator): configurable sampling params (temperature/top_p/top_k) for the Ollama backend

The Ollama backend previously sent only `num_ctx` in the native `/api/chat` `options`,
so every local model ran at Ollama's default sampling (~temp 0.8) — too hot for precise
agentic coding. `OllamaBackendDef` now accepts optional `temperature`, `topP`, and `topK`,
threaded into the request `options` (unset ⇒ model default, byte-identical to before).

Motivation: current Qwen guidance for thinking-mode / precise coding is temp 0.6 /
top_p 0.95 / top_k 20; running a coder at default temperature measurably increases
error rate. This lets an operator tune each local backend for its role.
