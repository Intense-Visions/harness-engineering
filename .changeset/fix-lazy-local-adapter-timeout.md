---
'@harness-engineering/cli': patch
---

Wire the previously-dead `LazyLocalAdapterOptions.llmTimeoutMs` through to the inner `OpenAICompatibleAnalysisProvider`. Without this, callers pointing at an unreachable local endpoint (LM Studio not running, Ollama not started) blocked for ~7s per call as the OpenAI SDK ran its default 90s timeout + `maxRetries: 2` exponential backoff before throwing. Now `llmTimeoutMs` actually applies — fail-fast on unreachable endpoints when configured.
