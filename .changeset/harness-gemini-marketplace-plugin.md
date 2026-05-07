---
'@harness-engineering/cli': minor
---

feat: ship `harness-gemini` marketplace extension (PR-C in the marketplace stack)

Sibling extension to `harness-claude` (#284) and `harness-cursor` (#288) for
Gemini CLI's extension marketplace. Same MCP and slash-command surface, but
scoped to what Gemini extensions actually support.

**New surface:**

- **`.gemini-extension/gemini-extension.json` + `marketplace.json`** —
  Gemini extension manifest with `mcpServers` and `contextFileName`. Mirrors
  the marketplace manifest shape used by the Claude and Cursor siblings.
- **`.gemini-extension/GEMINI.md`** — context document loaded automatically
  when the extension activates. Documents the persona table, the skill
  surface, and how to invoke `/harness:*` commands. Stands in for the
  native subagent and hooks fields that Gemini extensions don't have.
- **`.gemini-extension/commands/*.toml`** (37 files) — auto-generated TOML
  slash commands. Same set the Claude and Cursor plugins ship.

**CLI changes:**

- **`generate-plugin.mjs`** now accepts `--target gemini`. Per-target
  config in `scripts/lib/plugin-config.mjs` gained three flags so the
  generator can be honest about each tool's actual surface:
  - `commandExt` — `.md` for Claude/Cursor, `.toml` for Gemini. Diff and
    prettier formatting branch on this. (Prettier doesn't format TOML, so
    the gemini path skips prettier.)
  - `generateAgents` — `false` for Gemini (no native subagents field). The
    generator skips the agent-rendering step entirely instead of writing
    dead-end files no platform reads.
  - `generateHooks` — `false` for Gemini (no native hooks field).
- **`pnpm generate:plugin:gemini`** + **`generate:plugin:all`** /
  **`generate:plugin:check`** include the gemini target. CI runs the
  combined check on every PR.

**Scope differences from Claude/Cursor siblings:**

Gemini extensions only support commands + MCP servers + a context document.
Two surfaces present in the Claude and Cursor plugins are intentionally
out of scope here:

- **No persona subagents.** Gemini extensions don't have an agents field.
  Persona behavior is documented in GEMINI.md and exposed through
  `/harness:*` commands and `harness.run_persona` (MCP).
- **No lifecycle hooks.** Gemini extensions don't support hooks. Users
  wire `harness validate` / `harness check-arch` into CI manually, the
  same way they would without the extension.

**Out of scope (tracked as follow-up):**

- `harness-codex` (PR-D) sibling extension.
- OpenCode integration via extending `harness setup` (PR-E). OpenCode
  auto-discovers `.claude/skills/`, so the work there is mostly an MCP
  target wire-up, not a new manifest.
