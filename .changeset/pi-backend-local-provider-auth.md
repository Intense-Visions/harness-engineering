---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): register the local provider credential so PiBackend can actually run a local build

`PiBackend` handed the pi-coding-agent SDK an inline model under a synthetic `harness-local`
provider but never registered a credential for it. The SDK resolves auth by PROVIDER (auth.json /
env / runtime override) — the model's `headers`/`apiKey` fields do NOT satisfy that gate — so a
local build failed immediately with "No API key found for harness-local" unless an operator had
manually run `/login`. This silently blocked the entire local-model build path out of the box.

`startSession` now creates an in-memory `AuthStorage`, registers the endpoint's key for
`harness-local` via `setRuntimeApiKey` (the configured `apiKey`, or `ollama` — Ollama ignores the
value; a real key is threaded through for vLLM/LM-Studio deployments that enforce one), and passes
it to `createAgentSession`.

Found by a live end-to-end test: with this fix a local model (qwen3:32b via Ollama) drives a real
agentic build — `write` + `bash` tool calls producing a correct, self-verified module.
