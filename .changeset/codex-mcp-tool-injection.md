---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

feat(orchestrator): expose MCP servers (context7 + curated harness tools) to the codex backend

The `codex` execution backend drove the local model with only Codex's built-in
tools — no context7 (live library docs) and no harness MCP tools — unlike the
ollama path, which curates a lifecycle tool set. A local coder therefore had no
way to look up how existing code narrows a type or handles an API, and stalled on
fixes that hinge on that context.

`CodexBackendDef` (and `CodexBackendOptions`) now accept `mcpServers?: McpServerSpec[]`.
Each spec is injected per-invocation via `codex exec -c mcp_servers.<name>.command/
args/env/enabled_tools/startup_timeout_sec` — so the codex path reaches tool-parity
with the ollama path WITHOUT mutating the user's global `~/.codex/config.toml`. A
spec's `tools` allowlist maps to codex's per-server `enabled_tools`, keeping a broad
server (e.g. harness-mcp's ~95 tools) narrowed to a high-value set the local model
can navigate.
