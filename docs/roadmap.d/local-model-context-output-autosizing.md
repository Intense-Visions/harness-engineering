---
slug: "local-model-context-output-autosizing"
milestone: "Intake"
order: 20
---

### Ship a harness-owned OllamaBackend; off-the-shelf drivers mis-handle Ollama tool-calling

- **Status:** in-progress
- **Spec:** docs/changes/local-model-context-autosizing/proposal.md
- **Summary:** Local agentic dispatch fails not because local models are incapable but because the *driver* mis-handles Ollama's tool-calling wire format. Evidence (live e2e, 2026-07-15/16, on the same "add ESLint rule no-hardcoded-test-count" task): **PiBackend** (`@earendil-works/pi-coding-agent`, `pi.ts`) returns empty `0/0/0` completions on 0.79 AND 0.80 — the model produces nothing usable. **Codex CLI `--oss`** drives the model but its tool router rejects the model's native `tool_calls` (`error=unsupported call`), so it confabulates success and writes nothing (Codex is built for gpt-oss + the OpenAI Responses API). Yet a **direct `/v1/chat/completions` + tools loop drives the same qwen3 model flawlessly** — a ~150-line prototype produced a correct, registered ESLint rule + integration-test count update + unit test, iterating through a real read→write→test debug loop. **Fix: ship a thin harness-owned `OllamaBackend`** (`packages/orchestrator/src/agent/backends/ollama.ts`, `type: 'ollama'` in the BackendDef union + Zod schema + factory) that runs the proven loop: chat/completions → parse native `tool_calls` → execute bash/write_file/read_file against the workspace → feed results back → repeat. It plugs into the existing `AgentBackend` interface alongside `ClaudeBackend`, is model-agnostic, and removes the third-party Ollama-compat dependency. **Sub-items folded in:** (a) disable reasoning traces for agentic dispatch — pi sends `reasoning:false` but Ollama `/v1` ignores it, so qwen3 burns its output budget on `<think>` and never emits a tool call (worked around with a forced-`/no_think` Modelfile variant); (b) auto-size `num_ctx`/output budget from detected hardware + model max — `packages/local-models/src/hardware/` already reads unified-memory/VRAM but only for model *selection*, never context sizing, so Ollama falls back to its small default regardless of machine capacity. Compute `num_ctx = min(model_max, fits_in_memory)`.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1033