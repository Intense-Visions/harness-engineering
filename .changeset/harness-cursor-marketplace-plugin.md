---
'@harness-engineering/cli': minor
---

feat: ship `harness-cursor` marketplace plugin (PR-B in the marketplace stack)

Sibling plugin to `harness-claude` (#284) for Cursor's marketplace. Same
component surface — skills, `/harness:*` slash commands, persona subagents,
lifecycle hooks, MCP server — plus 4 curated project rules that fire as
`alwaysApply` in every Cursor session.

**New surface:**

- **`.cursor-plugin/plugin.json` + `.cursor-plugin/marketplace.json`** —
  Cursor marketplace manifest, mirrors the Claude plugin shape.
- **`.cursor-plugin/{commands,agents,hooks.json,rules}/`** — auto-generated
  artifacts under the same path convention as `.claude-plugin/`.
- **4 hand-written Cursor rules** (`.mdc` files in `.cursor-plugin/rules/`):
  - `validate-before-commit` — run `harness validate` before any commit.
  - `respect-architecture` — stay within layer boundaries declared in
    `harness.config.json`; no `// harness-ignore` to suppress violations.
  - `use-harness-skills` — prefer `/harness:*` skills over freelancing for
    common tasks; surface explicit skip reasons.
  - `respect-hooks` — never propose `--no-verify` or hook-bypass workarounds;
    fix the underlying issue or update calibration.

**CLI changes:**

- **`renderCursorAgent`** (`packages/cli/src/agent-definitions/render-cursor.ts`)
  — new renderer for Cursor subagent markdown (frontmatter `name` +
  `description`, no `tools` field). Wired into `getRenderer` in
  `generate-agent-definitions.ts`. `resolveOutputDir` simplified to take any
  `Platform` (was hardcoded for claude-code/gemini-cli only).
- **`renderCursorCommand`** (`packages/cli/src/slash-commands/render-cursor-command.ts`)
  — new renderer for Cursor plugin slash commands (frontmatter `name` +
  `description`, body uses `<context>`/`<objective>`/`<execution_context>`/
  `<process>` blocks). Distinct from the existing `renderCursor`, which still
  serves `harness setup`'s `~/.cursor/rules/` flow.
- **`harness generate-slash-commands --cursor-mode <rules|commands>`** — new
  flag (default `rules` for backward compatibility) selects between the two
  Cursor renderers.

**Generator consolidation:**

- **`scripts/generate-plugin.mjs --target <claude|cursor> [--check]`** —
  single parameterized generator replaces the three Claude-specific scripts
  from PR-A (`generate-plugin-{commands,agents,hooks}.mjs`). All three
  artifacts produced per target. Per-target config (plugin dir, slash command
  platform, agent platform, hooks command template) lives in
  `scripts/lib/plugin-config.mjs`.
- **`pnpm generate:plugin:check`** chains both targets; CI runs it on every PR.
- Per-target `pnpm generate:plugin:claude` and `pnpm generate:plugin:cursor`
  for partial regeneration.

**Cursor-specific notes:**

- Cursor's hook `command` paths use relative form (`./.harness/hooks/<name>.js`)
  rather than the `${CLAUDE_PLUGIN_ROOT}` env var. Cursor doesn't document an
  equivalent env var, but their hook docs show relative paths resolve to the
  plugin install dir.
- Cursor distinguishes `commands` (slash) from `rules` (always-apply guidance)
  in the plugin manifest. The harness plugin uses both.

**Out of scope (tracked as follow-up issues):**

- `harness-gemini` (PR-C) and `harness-codex` (PR-D) sibling plugins.
- Cursor's `harness-cursor:harness` natural-language router command appears
  in `.cursor-plugin/commands/harness.md` rather than as a parent-level
  command (Cursor's slash-commands generator doesn't special-case
  `command_name` the way Claude/Gemini do). Functional but slightly noisy in
  the command list. Optional cleanup.
