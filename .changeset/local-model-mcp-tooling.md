---
'@harness-engineering/orchestrator': patch
---

Fix local ollama backends silently losing their MCP tools. `buildLocalLikeWithResolver` (the factory path used when a local backend declares a prefer-and-fallback `model: [...]` array) dropped `mcpServers` (and `numCtx`/`maxContextTokens`/`numPredict`/`keepAlive`) that `createBackend` passes — so a local model configured with e.g. a `context7` docs server got zero MCP tools. Now mirrored. Also bump the MCP connect timeout 15s→30s so an `npx -y <pkg>` MCP server (which cold-starts in ~20s on first run) is no longer silently skipped, and augment a local agent's system prompt to name its aggregated MCP tools and tell it to use them for unfamiliar APIs/conventions/errors. Together these make live documentation tools actually reach a local model — its top failure mode is knowledge/recency gaps only live docs can fill.
