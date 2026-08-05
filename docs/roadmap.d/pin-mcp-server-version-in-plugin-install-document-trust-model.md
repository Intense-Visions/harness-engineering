---
slug: "pin-mcp-server-version-in-plugin-install-document-trust-model"
milestone: "v5.0 — Trust & Security Model"
order: 1
---

### Pin MCP server version in plugin install + document trust model

- **Status:** planned
- **Spec:** —
- **Summary:** `.claude-plugin/plugin.json:14-16` — `mcpServers.harness.command: "npx -y -p @harness-engineering/cli@latest harness-mcp"`. Every Claude Code session pulls the latest npm publish (subject to npx's ~24h cache). No version pinning by default. A compromised publish propagates to every active adopter within a day. Pin to a specific version; update via plugin update flow. Add `docs/security/trust-model.md` explaining what an adopter trusts when installing each marketplace plugin and how to verify integrity. Source: Pass 6 #4 + #6.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#557
