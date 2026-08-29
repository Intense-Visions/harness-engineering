---
'@harness-engineering/cli': minor
---

comprehension: make the semantic backstop provider-neutral (ADR 0109, slice 3). The analysis-provider resolver now accepts a config-declared OpenAI-compatible endpoint, and `comprehension.analysisBaseUrl` / `comprehension.analysisApiKey` let a project point the backstop at ANY vendor's gateway (Cursor / Codex / Gemini / a local model) — no Anthropic key and no orchestrator-injected `HARNESS_ANALYSIS_*` env required. Precedence is unchanged and backward compatible (Anthropic key → endpoint → claude-CLI → null, degrading to static-only), with env remaining the fallback when no endpoint is configured. Bespoke per-vendor subscription-CLI adapters (which each need their own flag dialect) remain a follow-up; the OpenAI-compatible endpoint is the vendor-neutral path today.
