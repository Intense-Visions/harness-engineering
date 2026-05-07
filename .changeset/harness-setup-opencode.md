---
'@harness-engineering/cli': minor
---

feat: integrate OpenCode in `harness setup` (PR-E in the marketplace stack)

Adds OpenCode as the fifth supported AI client in `harness setup`. Unlike
the four marketplace plugins (PR-A through PR-D), OpenCode joins via the
existing `harness setup` flow rather than its own marketplace manifest —
OpenCode plugins are JS/TS code, not declarative manifests, and OpenCode
auto-discovers `.claude/skills/` so it shares Claude's skill tree without
any plugin-side wiring.

**What ships:**

- **`harness setup` detects `~/.config/opencode/`** as a new client marker
  and writes the harness MCP server to `./opencode.json` in the project
  root. Skipped (with a friendly warning) when neither the global config
  dir nor a project-local `opencode.json` is present.
- **`harness setup-mcp --client opencode`** wires up the MCP server
  standalone for users who want fine-grained control.
- **Tier-0 MCP integrations parity** — context7, sequential-thinking, and
  playwright are written to `opencode.json` alongside `.mcp.json` and
  `.gemini/settings.json`, mirroring the existing Gemini parity block.

**OpenCode's MCP shape differs from the others:**

OpenCode uses `mcp` (not `mcpServers`) at the top level, and each entry
uses `type: "local"`, a single combined `command` array (executable +
args), `enabled`, and `environment`. The new `writeOpencodeMcpEntry`
helper translates the standard `{command, args?, env?}` shape into
OpenCode's wire format.

**Test coverage:**

- 6 new tests in `setup-mcp.test.ts` covering the OpenCode branch
  (configure, skip-if-configured, all-clients, key preservation).
- 6 new tests in `integrations/config.test.ts` covering the
  `writeOpencodeMcpEntry` translation (mcp field, command array,
  environment translation, top-level field preservation, mcp entry
  preservation).
- 3 new tests in `setup.test.ts` covering Tier-0 OpenCode parity
  (project-local marker, global marker, neither-present negative).

**Stack complete:**

| Tool         | Integration                                  | Status         |
| ------------ | -------------------------------------------- | -------------- |
| Claude Code  | `harness-claude` marketplace plugin          | shipped (#284) |
| Cursor       | `harness-cursor` marketplace plugin          | shipped (#288) |
| Gemini CLI   | `harness-gemini` marketplace extension       | shipped (#290) |
| Codex CLI    | `harness-codex` marketplace plugin           | shipped (#291) |
| **OpenCode** | **via `harness setup` (no plugin manifest)** | **this PR**    |

**README updates:**

- Quick Start now lists Gemini CLI and Codex CLI marketplace plugins as
  shipped (they were "coming" before PR-C/PR-D landed) and adds an
  OpenCode bullet pointing to the npm path.
- Plugin-vs-npm parity table replaces the outdated "Gemini CLI / Codex /
  OpenCode integration ❌ (sibling plugins coming)" row with two rows
  reflecting current state — Gemini/Codex shipped via plugins, OpenCode
  via `harness setup`.
- MCP config table gains an OpenCode row showing the project-local
  `opencode.json` path.
