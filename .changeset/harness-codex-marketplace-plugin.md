---
'@harness-engineering/cli': minor
---

feat: ship `harness-codex` marketplace plugin (PR-D in the marketplace stack)

Final entry in the multi-tool marketplace stack: `harness-codex` for Codex
CLI. Sibling to `harness-claude` (#284), `harness-cursor` (#288), and
`harness-gemini` (#290).

**The thinnest plugin of the four.** Codex's plugin spec
(`developers.openai.com/codex/plugins/build`) only defines `skills`,
`mcpServers`, `apps`, and `hooks` fields — no slash-command surface, no
agents field. So `harness-codex` ships exactly what Codex actually
consumes:

- **`.codex-plugin/plugin.json`** — manifest pointing at
  `./agents/skills/codex` for skills and wiring the harness MCP server.
- **`.codex-plugin/marketplace.json`** — marketplace entry with
  `policy.installation: AVAILABLE`, `category: Productivity`.
- No `commands/`, no `agents/`, no `hooks.json` — see "Out of scope" below.

**Generator changes:**

- **`generate-plugin.mjs --target codex`** is a no-op by design (manifest
  is hand-maintained, no auto-generated artifacts). Wired into
  `pnpm generate:plugin:{codex,all,check}` so CI's drift guard covers all
  four targets uniformly even though codex has nothing to drift from.
- **`plugin-config.mjs`** gained a `generateCommands` flag (alongside
  `generateAgents` and `generateHooks` from PR-C) so the generator can
  short-circuit each artifact type independently. Existing entries
  (claude, cursor, gemini) set `generateCommands: true`; codex sets all
  three to `false`.

**Out of scope (intentional):**

- **No slash commands.** Codex's plugin spec doesn't define a commands
  surface — Codex picks up skills directly via the manifest's `skills`
  field and surfaces them via the `$skill` invocation syntax.
- **No persona subagents.** Like Gemini, Codex plugins have no agents
  field. Persona behavior remains reachable via `harness.run_persona`
  exposed by the MCP server.
- **No lifecycle hooks.** Codex's plugin spec mentions a `hooks` field
  but the schema (event names, command resolution, env vars) is not
  documented yet. Deferred until the spec stabilizes — when it does,
  set `generateHooks: true` for codex and the existing generator will
  produce `.codex-plugin/hooks.json` from the same `STANDARD_HOOKS` list
  the other plugins use.

**Stack complete:**

| Tool        | Plugin           | Surface                                          |
| ----------- | ---------------- | ------------------------------------------------ |
| Claude Code | `harness-claude` | skills + commands + agents + hooks + MCP         |
| Cursor      | `harness-cursor` | skills + commands + agents + hooks + rules + MCP |
| Gemini CLI  | `harness-gemini` | commands + GEMINI.md context + MCP               |
| Codex CLI   | `harness-codex`  | skills + MCP                                     |

The follow-up — OpenCode integration via extending `harness setup` (PR-E)
— remains tracked as a separate issue. OpenCode auto-discovers
`.claude/skills/`, so the work there is mostly an MCP target wire-up, not
a new manifest.
