---
type: business_concept
domain: intelligence
tags: [intelligence, providers, anthropic, openai, local-model, analysis]
---

# Intelligence Provider Architecture

The intelligence pipeline abstracts LLM access behind the `AnalysisProvider` interface, allowing the same analysis code (SEL, CML, PESL) to run against any supported backend without modification.

## AnalysisProvider Interface

`AnalysisProvider` is the single abstraction that all intelligence layers call. It accepts a prompt string and returns structured analysis results. Each layer (SEL, CML, PESL) receives the provider at construction time and invokes it without knowing which backend is behind it.

## Supported Providers

### AnthropicAnalysisProvider

Uses the Anthropic Messages API (`@anthropic-ai/sdk`). This is the default provider when the orchestrator's agent backend is configured as `anthropic` or `claude`.

### OpenAICompatibleAnalysisProvider

Uses the OpenAI Chat Completions API (`openai` SDK). Covers both hosted OpenAI models and any local LLM that exposes an OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, etc.). Selected automatically when the agent backend is `openai` or `localBackend: openai-compatible`.

### ClaudeCliAnalysisProvider

Routes analysis through the Claude CLI rather than a direct API call. Useful when the orchestrator already has a Claude CLI session established and no separate API key is available.

## Shared LLM Connection

The pipeline does not require its own API key or endpoint configuration. It derives its provider from the orchestrator's existing agent backend settings:

| Agent Backend                     | Intelligence Provider             |
| --------------------------------- | --------------------------------- |
| `anthropic` / `claude`            | Anthropic Messages API (same key) |
| `openai`                          | OpenAI Chat API (same key)        |
| `localBackend: openai-compatible` | Local endpoint (same URL)         |

This means enabling intelligence adds zero credential overhead -- the same key that powers agent dispatch also powers spec enrichment and simulation.

## Per-Layer Model Overrides

By default every layer uses the same model as the orchestrator. The `intelligence.models` block in `harness.config.json` allows overriding the model on a per-layer basis so that cheaper or faster models handle enrichment while more capable models handle simulation:

```yaml
intelligence:
  enabled: true
  models:
    sel: llama3.2 # fast, inexpensive model for enrichment
    pesl: deepseek-r1 # reasoning model for simulation
```

When a layer-specific model is set, the provider routes that layer's requests to the specified model while all other layers continue using the orchestrator's default model.

## Configuration via harness.config.json

All provider settings live under the `intelligence` block:

```yaml
intelligence:
  enabled: true # toggle the entire pipeline
  models:
    sel: <model-name> # optional SEL model override
    pesl: <model-name> # optional PESL model override
  promptSuffix: '/no_think' # appended to every prompt (thinking model control)
  jsonMode: false # toggle JSON grammar constraint
  requestTimeoutMs: 90000 # per-request timeout
  failureCacheTtlMs: 300000 # cache duration for failed analyses
```

When `enabled` is `false` (the default), the entire pipeline is skipped and the orchestrator dispatches without any intelligence enrichment.

## Special Handling for Thinking Models

Some reasoning-oriented models -- notably Qwen3 and DeepSeek-R1 -- require specific configuration to produce reliable structured output:

- **`promptSuffix`** -- A string appended to every prompt sent to the provider. For Qwen3, setting this to `'/no_think'` disables the model's internal chain-of-thought, which otherwise interferes with structured JSON output.
- **`jsonMode`** -- When set to `false`, disables Ollama's JSON grammar constraint. Qwen3 in particular can hang indefinitely when forced into JSON mode via the grammar constraint; disabling it and relying on prompt-based JSON formatting avoids this.
- **`requestTimeoutMs`** -- Reasoning models can take significantly longer per request. Setting an explicit timeout (e.g., 90000ms) causes the provider to fail fast rather than waiting the default 10-minute timeout, which lets the failure cache and graceful degradation logic take over promptly.

These settings are irrelevant for standard instruction-following models (Claude, GPT-4, Llama 3) and can be omitted.
