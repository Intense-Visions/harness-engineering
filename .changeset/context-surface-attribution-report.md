---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(context): add context-surface attribution report with exact token counts. Classifies the always-loaded context surface as always-loaded / path-scoped / invoked-only, ranks the top contributors, and derives over-budget flags from the (now live-wired) `contextBudget()` allocator. New core exports: `buildAttributionReport`, `heuristicTokenCounter`, `createAnthropicTokenCounter`, `resolveTokenCounter`, plus the `ContextClass` / `ContextSurfaceEntry` / `AttributionReport` types. Exact token counts come from Anthropic's `/v1/messages/count_tokens` endpoint, degrading gracefully to the `chars / 4` heuristic when no API key / offline / on request failure (never hard-fails). New CLI command `harness mcp context-report [--tier core|standard|full] [--exact] [--window <n>] [--top <n>] [--no-skills] [--json]` measures the harness's real surface (MCP tool schemas per tier, AGENTS.md, hooks, the four platform skill trees). Wires the previously-dead `contextBudget()` allocator into a live, tested code path.
