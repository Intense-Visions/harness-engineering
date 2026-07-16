---
slug: "local-model-context-output-autosizing"
milestone: "Intake"
order: 20
---

### Auto-size local-model context/output from hardware + disable reasoning traces for agentic dispatch

- **Status:** planned
- **Spec:** —
- **Summary:** The pi backend runs local models with fixed, un-tuned generation settings that cripple agentic dispatch. `packages/orchestrator/src/agent/backends/pi.ts` hardcodes `contextWindow: 32768` and `maxTokens: 8192` and passes `reasoning: false`, but (a) via Ollama's OpenAI-compatible `/v1` endpoint `num_ctx` is never sent, so Ollama falls back to its own default context regardless of the machine's capacity, and (b) `/v1` ignores `reasoning:false`, so reasoning models keep emitting `<think>` traces. The `packages/local-models/src/hardware/` detector already reads unified-memory/VRAM (Apple Silicon `vramGb = ramGb`, NVIDIA, CPU) — but only to *select* which models fit, never to size the runtime context/output budget. Build a sizing step that computes `num_ctx = min(model_max_context, what_fits_in_memory)` from detected hardware + the model's trained context (e.g. qwen3 = 40960) + quant/KV-cache math, raises the per-turn output budget accordingly, and disables reasoning traces for agentic runs (native Ollama `/api/chat think:false`, or a forced `/no_think` in the rendered prompt/template). Wire the computed values through the PiBackend model definition and per-dispatch. **Evidence (2026-07-15 live e2e):** qwen3:32b via `/v1` with reasoning on spent ~90s/turn generating ~11k `<think>` tokens, hitting the 8192 output cap before ever emitting a tool call — 145 turns, 9 tool calls, **0 files written**; the enforced gate correctly halted. A one-off `qwen3-agent` Modelfile variant (forced `/no_think` + `num_ctx 40960`) made turns ~8× faster and actionable, proving the failure was configuration, not model capability. This is the difference between local dispatch being unusable and viable.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** —
