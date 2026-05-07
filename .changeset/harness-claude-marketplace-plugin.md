---
'@harness-engineering/cli': minor
---

feat: distribute harness as the `harness-claude` Claude Code marketplace plugin

Replaces #267, which shipped a Claude-only marketplace plugin under the name `harness` with a partial component surface (skills + MCP only). This change:

1. **Renames** the plugin to `harness-claude` and reframes the marketplace listing so the name no longer implies tool-agnostic coverage. Sibling plugins for Cursor, Gemini CLI, and Codex are planned as follow-up PRs (`harness-cursor`, `harness-gemini`, `harness-codex`); OpenCode is covered by extending `harness setup`.
2. **Adds persona subagents.** New `scripts/generate-plugin-agents.mjs` runs `harness generate-agent-definitions --platforms claude-code` and writes 12 rendered subagent files (`harness-architecture-enforcer.md`, `harness-code-reviewer.md`, …) to `agents/agents/claude-code/`. The plugin manifest references this directory via the `agents` field.
3. **Adds lifecycle hooks.** New `scripts/generate-plugin-hooks.mjs` writes `.claude-plugin/hooks.json` with the `standard` profile (block-no-verify, protect-config, quality-gate, pre-compact-state, adoption-tracker, telemetry-reporter), pointing at `${CLAUDE_PLUGIN_ROOT}/.harness/hooks/<name>.js` so the scripts already shipped at `.harness/hooks/` (per #270) execute against the user's project at install time.
4. **Adds drift guards.** Each generator gains a `--check` mode that runs the generator into a staging dir, diffs the result against the committed artifact, and exits non-zero on drift. `pnpm generate:plugin:check` chains all three. CI (`.github/workflows/ci.yml`) runs this check on every PR — no more silent drift between `agents/skills/claude-code/` and the plugin's slash command/subagent set.
5. **Switches generators from `dist/bin/harness.js` to `tsx packages/cli/src/bin/harness.ts`.** Plugin maintenance no longer requires `pnpm build` first. `tsx` is added as a root devDependency.

**Plugin manifest now exposes:**

| Field        | Path                           | Components                     |
| ------------ | ------------------------------ | ------------------------------ |
| `skills`     | `./agents/skills/claude-code`  | All harness skills             |
| `agents`     | `./agents/agents/claude-code/` | 12 persona subagents           |
| `commands`   | (default `commands/`)          | 37 `/harness:*` slash commands |
| `hooks`      | `./.claude-plugin/hooks.json`  | Standard hook profile          |
| `mcpServers` | inline                         | `harness` MCP server via `npx` |

**Out of scope (tracked as follow-up issues):**

- `harness-cursor`, `harness-gemini`, `harness-codex` sibling plugins.
- OpenCode integration via extended `harness setup`.
- Consolidation of bit-identical `agents/skills/{claude-code,codex,cursor,gemini-cli}/` trees into a single source of truth.
