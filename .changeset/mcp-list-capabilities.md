---
'@harness-engineering/cli': patch
---

Add `harness mcp list-capabilities [--by-permission] [--json]` — a read-only adopter-audit command that surfaces, per MCP tool, a read/write/exec scope, network access, and the existing `trustedOutput` trust tag. Scope is a conservative heuristic derived from the tool-name verb prefix (labeled as such in the output); network access and trust are exact. Helps adopters see what their agent can do through the MCP server ahead of the authoritative per-tool capability declaration (#558).
