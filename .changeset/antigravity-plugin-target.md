---
'@harness-engineering/cli': patch
---

Add an `antigravity` (agy) plugin-generator target and register Antigravity CLI
as a `harness setup` MCP client (#979).

The plugin generator (`scripts/generate-plugin.mjs` + `scripts/lib/plugin-config.mjs`)
gained an `antigravity` target alongside `claude | cursor | gemini | codex`,
producing a `.antigravity-extension/` marketplace plugin (`harness-antigravity`).
The Antigravity CLI (`agy`) was already a first-class CI-review runner but had no
plugin surface. This closes that gap: agy users get the full `/harness:*` slash
command set (`commands/*.toml`), persona agents (`agents/*.md`), and the harness
MCP server.

agy shares the `~/.gemini/` home directory with Gemini CLI but is not
configuration-compatible with it. Two divergences matter: agy natively reads
persona agents from `~/.gemini/agents/*.md` (the Gemini CLI extension has no
agents field), and agy reads its MCP config from `config/mcp_config.json`
(declaring MCP in `settings.json` is silently ignored). The new target reflects
both. `harness setup` now detects an agy install (via `~/.gemini/antigravity-cli/`)
and writes the harness MCP entry to `.gemini/config/mcp_config.json`.

Lifecycle hooks are intentionally out of scope for this MVP target: agy's hook
contract (stdin JSON payload → stdout decision object) differs fundamentally from
Claude Code's exit-code contract and requires dual-contract or agy-native hook
scripts. The target ships with hook generation disabled, matching the honest
posture of the existing `gemini` and `codex` targets.
