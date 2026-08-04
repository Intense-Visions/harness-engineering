---
slug: "ollama-backend-mcp-tools"
milestone: "Intake"
order: 26
---

### Wire suggested MCP servers (incl. harness itself) into the OllamaBackend agent

- **Status:** done
- **Spec:** docs/changes/ollama-mcp-tools/proposal.md
- **Summary:** Give the local `OllamaBackend` agent the same power cloud drivers get from MCP: expose the harness-suggested MCP servers as agent tools alongside `bash`/`read_file`/`write_file`. Today the local agent has only those three built-ins, so it writes code from stale memory — e.g. it used the deprecated `@typescript-eslint/utils` RuleTester import when **context7** returns the current `@typescript-eslint/rule-tester` API (verified live). The fix generalizes: an **MCP client in `OllamaBackend`** that, at `startSession`, connects to the configured/suggested MCP servers (from the refreshed catalog — [[mcp-catalog-refresh]]), enumerates each server's tools, and adds them (namespaced, e.g. `context7__query-docs`, `harness__code_search`) to the tool schema it sends to the model; on a tool call for an MCP tool it forwards to the server and returns the result. **Include harness's own MCP** so the local agent can `code_search` / `ask_graph` / `outcome_eval` / `review_changes` on itself — the highest-leverage set for harness-native work. Reuse the harness's existing MCP client plumbing + the `@modelcontextprotocol/sdk` rather than a bespoke per-server tool. Config: a per-backend allowlist of which suggested servers the agent gets (default a safe set: context7 docs + harness read-only tools; opt-in for write/network-heavy servers). Respect the interactive vs full-tool permission mode. This is the single biggest capability lever for local-model success — combined with a stronger model ([[local-model-discovery-recommendation]]) it directly targets the observed failure (writes plausible code but with wrong/old APIs and no doc lookup). MVP: context7 `lookup_docs` (HTTP, no key — proven) + the harness MCP; then generalize to the full catalog.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#849