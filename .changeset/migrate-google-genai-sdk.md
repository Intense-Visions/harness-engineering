---
'@harness-engineering/orchestrator': patch
---

Migrate Gemini backend from the deprecated `@google/generative-ai@0.24.1` to `@google/genai@^2.0.4`. Upstream stopped publishing the old package. Public API of `GeminiBackend` is unchanged. Wraps the new `chunk.text` getter in a per-chunk try (the new SDK throws on non-text chunks like function calls), preserves accumulated token counters in the error path, and adds an empty-key guard to `healthCheck` to match `startSession`.
