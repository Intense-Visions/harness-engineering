---
slug: "add-harness-mcp-list-capabilities-cli-for-adopter-audit"
milestone: "v5.0 — Trust & Security Model"
order: 4
---

### Add harness mcp list-capabilities CLI for adopter audit

- **Status:** planned
- **Spec:** —
- **Summary:** MCP server has 101 tool files (`packages/cli/src/mcp/tools/`). Per-tool `trustedOutput` flag exists but per-tool capability declarations don't. Adopters have no easy way to audit what their agent can do via MCP. Add `harness mcp list-capabilities --by-permission` CLI command that surfaces each tool's read/write/exec scope, network access, and trust tag. Source: Pass 6 #3.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#560
