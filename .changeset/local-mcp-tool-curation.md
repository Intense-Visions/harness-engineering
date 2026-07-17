---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

Add a per-server MCP tool allowlist for the local `ollama` agent. A broad
MCP server floods a local model with tools — in a live e2e the harness MCP
alone exposed 95 tools and `qwen3-coder:30b` over-explored without cleanly
signalling completion. `mcpServers[].tools?: string[]` narrows a server to
named tools (filtered on the server's own pre-namespacing tool name);
unset ⇒ all tools (byte-identical to before). Requested-but-unexposed names
warn once and are skipped (graceful). When the aggregated tool set
(built-ins + MCP) exceeds a threshold, the backend logs a one-line advisory
pointing at `tools` — no hard cap. The scaffolded local configs narrow the
harness example to a read-oriented set (`code_search`, `ask_graph`,
`review_changes`, `outcome_eval`, `gather_context`).
