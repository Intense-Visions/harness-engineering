---
'@harness-engineering/cli': minor
---

Add an `antigravity` plugin-generator target (agy / Antigravity CLI). The
plugin generator now emits `/harness:*` slash commands, persona agents, and a
pinned MCP declaration for agy alongside the existing claude/cursor/gemini/codex
targets, and `harness setup` detects and configures the Antigravity CLI client.

agy shares the `~/.gemini/` root with Gemini CLI but is a distinct target: it
reads persona agents from `~/.gemini/agents/*.md` and MCP from
`~/.gemini/config/mcp_config.json` (declaring MCP in `settings.json` is silently
ignored). Lifecycle hooks are deferred to a follow-up phase because agy's
stdin/stdout decision contract differs from Claude Code's exit-code contract.
