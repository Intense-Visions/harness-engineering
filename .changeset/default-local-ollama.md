---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

Make `ollama` the default local backend and add `disableReasoning`. The scaffolded configs (`harness.orchestrator.md`, `harness.config.json`, templates) now route the `local` backend to `type: ollama` (the native OllamaBackend that actually drives tool-calling models) instead of `type: pi`. A new `disableReasoning?: boolean` option on the ollama backend appends ` /no_think` to each user turn so Qwen3-family reasoning models skip `<think>` traces — Ollama's `/v1` ignores the `reasoning:false` knob, so without this a reasoning model burns its output budget thinking and never emits a tool call. With it, a stock `qwen3:32b` config is productive out of the box (no custom Modelfile needed).
