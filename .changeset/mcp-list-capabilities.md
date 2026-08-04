---
'@harness-engineering/cli': patch
---

Add `harness mcp list-capabilities [--by-permission] [--json]` — a read-only adopter-audit command that surfaces, per MCP tool, its read/write/exec scopes, network access, and the existing `trustedOutput` trust tag. Scopes are now authoritative, evidence-based DECLARATIONS carried on each tool definition (`capability?: { scopes; network? }`, authored in `tool-capability-declarations.ts` and compiled into the registry), derived from each tool's actual behavior — fs writes, `child_process`/`execFile`/`spawn`, outbound `fetch`/HTTP, graph/DB writes — not from the tool name. The tool-name verb-prefix heuristic is kept only as a clearly-labeled fallback (`source: heuristic`) for any not-yet-declared tool; a coverage test forces every registered tool to declare. Helps adopters see exactly what their agent can do through the MCP server.
