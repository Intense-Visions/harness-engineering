---
'@harness-engineering/cli': minor
---

feat: distribute harness as the `harness-claude` Claude Code marketplace plugin

Replaces #267, which shipped a Claude-only marketplace plugin under the name `harness` with a partial component surface (skills + MCP only). This change:

1. **Renames** the plugin to `harness-claude` and reframes the marketplace listing so the name no longer implies tool-agnostic coverage. Sibling plugins for Cursor, Gemini CLI, and Codex are planned as follow-up PRs (`harness-cursor`, `harness-gemini`, `harness-codex`); OpenCode is covered by extending `harness setup`.
2. **Adds persona subagents.** New `scripts/generate-plugin-agents.mjs` runs `harness generate-agent-definitions --platforms claude-code` and writes 12 rendered subagent files (`harness-architecture-enforcer.md`, `harness-code-reviewer.md`, …) to `.claude-plugin/agents/`. The plugin manifest references this directory via the `agents` field.
3. **Adds lifecycle hooks.** New `scripts/generate-plugin-hooks.mjs` writes `.claude-plugin/hooks.json` with the `standard` profile (block-no-verify, protect-config, quality-gate, pre-compact-state, adoption-tracker, telemetry-reporter), pointing at `${CLAUDE_PLUGIN_ROOT}/.harness/hooks/<name>.js` so the scripts already shipped at `.harness/hooks/` (per #270) execute against the user's project at install time.
4. **Consolidates plugin distribution artifacts under `.claude-plugin/`.** Slash commands moved from `commands/` (repo root) to `.claude-plugin/commands/`. Subagents moved from `agents/agents/claude-code/` to `.claude-plugin/agents/`. Frees the repo-root `commands/` slot for the future `harness-gemini` extension (Gemini uses TOML in its own `commands/` and would otherwise collide).
5. **Adds drift guards.** Each generator gains a `--check` mode that runs the generator into a staging dir, diffs the result against the committed artifact, and exits non-zero on drift. `pnpm generate:plugin:check` chains all three. CI (`.github/workflows/ci.yml`) runs this check on every PR — no more silent drift between `agents/skills/claude-code/` and the plugin's slash command/subagent set.
6. **Switches generators from `dist/bin/harness.js` to `tsx packages/cli/src/bin/harness.ts`.** Plugin maintenance no longer requires `pnpm build` first. `tsx` is added as a root devDependency.
7. **Extends `initialize-harness-project` skill with Phase 5 (INSTRUMENT) and Phase 6 (FINALIZE).** The skill now closes the bootstrap parity gap that plugin install does not cover — knowledge graph (`harness scan`), architecture baseline (`harness check-arch --update-baseline`), performance baseline (`harness check-perf`), telemetry identity (`harness telemetry identify`), legacy layout migration (`harness migrate --dry-run`), and Tier-0 MCP integrations (`harness integrations add context7|sequential-thinking|playwright`). Includes a "Plugin-only callout" telling the model to prefix CLI invocations with `npx @harness-engineering/cli` when no global binary is on PATH, plus a worked example showing a full plugin-only bootstrap.

**Plugin manifest now exposes:**

| Field        | Path                          | Components                     |
| ------------ | ----------------------------- | ------------------------------ |
| `skills`     | `./agents/skills/claude-code` | All harness skills             |
| `commands`   | `./.claude-plugin/commands/`  | 37 `/harness:*` slash commands |
| `agents`     | `./.claude-plugin/agents/`    | 12 persona subagents           |
| `hooks`      | `./.claude-plugin/hooks.json` | Standard hook profile          |
| `mcpServers` | inline                        | `harness` MCP server via `npx` |

**Out of scope (tracked as follow-up issues):**

- `harness-cursor`, `harness-gemini`, `harness-codex` sibling plugins.
- OpenCode integration via extended `harness setup`.
- Consolidation of `agents/skills/{claude-code,codex,cursor,gemini-cli}/` — these are already hard-linked to a single inode (no actual duplication on disk), so this becomes a presentation/discovery refactor rather than a data-layer one.
