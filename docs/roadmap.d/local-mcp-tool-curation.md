---
slug: "local-mcp-tool-curation"
milestone: "Intake"
order: 27
---

### Curate which MCP-server tools the local agent sees (per-server tool allowlist)

- **Status:** in-progress
- **Spec:** docs/changes/local-mcp-tool-curation/proposal.md
- **Summary:** [[ollama-backend-mcp-tools]] wires whole MCP servers into the local agent, but a broad server floods the model: in the live e2e (2026-07-16) the harness MCP alone exposed **95 tools**, and `qwen3-coder:30b` — given ~98 tools total — wrote the correct file via context7 but then **over-explored** (a cat/find/read/ls verification loop) without cleanly emitting `TASK_COMPLETE`, so a real dispatch would end via `maxTurns` rather than clean success. Choice-paralysis, not context size (the model had 262144 ctx). Fix: a **per-server `tools?: string[]` allowlist** on `McpServerSpec` — when set, only those tool names from that server are aggregated (namespaced), default unset = all tools (byte-identical). Curate the scaffolded harness example to the read-oriented set ([[ollama-backend-mcp-tools]] D3: `code_search`, `ask_graph`, `review_changes`, `outcome_eval`, `gather_context`) instead of all 95. Warn (not hard-cap) when the aggregated tool count crosses a large threshold, pointing at the allowlist. Portable — the allowlist works for any server, not just harness. Directly improves the robustness of the just-shipped local MCP path.
- **Blockers:** —
- **Plan:** —
- **Assignee:** Chad Warner
- **Priority:** P1
- **External-ID:** —
