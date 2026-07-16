---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

Make `ollama` the default local backend and add `disableReasoning`. The scaffolded configs (`harness.orchestrator.md`, `harness.config.json`, templates) now route the `local` backend to `type: ollama` (the native OllamaBackend that actually drives tool-calling models) instead of `type: pi`. A new `disableReasoning?: boolean` option on the ollama backend appends ` /no_think` to each user turn so Qwen3-family reasoning models skip `<think>` traces — Ollama's `/v1` ignores the `reasoning:false` knob, so without this a reasoning model burns its output budget thinking and never emits a tool call. With it, a stock `qwen3:32b` config is productive out of the box (no custom Modelfile needed).

Also fixes three release blockers found in a live local-dispatch e2e that made autonomous local dispatch unsafe:

- **`ollama` is now recognized as a local backend everywhere.** A shared `isLocalEndpointBackend` guard (true for `local` | `pi` | `ollama`) replaces the inline `type === 'local' || type === 'pi'` checks that silently excluded the new native backend. A `type: ollama` dispatch now (a) renders the LOCAL bash-shaped shim prompt template instead of the Claude template, (b) runs the enforced local workflow gate instead of a no-op, and (c) is discovered by local-model detection so outcome-eval can find a local model. Resolver-model wiring covers `ollama` too.
- **TASK_COMPLETE completion semantics.** `OllamaBackend.runTurn` no longer treats a no-tool-call final message as success unconditionally. It returns `success: true` only when the final message signals completion via a distinctive `TASK_COMPLETE` marker (matched as a whole token); otherwise it returns `success: false` so the runner re-prompts the model to continue. This prevents a model that stopped after doing nothing from ending the workflow. `DEFAULT_SYSTEM_PROMPT` now instructs the model accordingly.
- **Empty-diff gate halt.** The local workflow gate now halts BEFORE verify when the agent produced no workspace changes, returning `no changes produced — the agent completed without implementing anything`. This stops an empty diff from trivially passing verify and being marked done.
