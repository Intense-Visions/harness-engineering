# Proposal: `antigravity` (agy) plugin-generator target

- **Status:** Proposed
- **Source of contract:** GitHub issue #979 (reporter: ChadTowle). The agy customization
  contract below is quoted from that issue, which reverse-engineered it from a working
  local install (agy 1.1.8, `~/.local/bin/agy`) and is described there as empirically
  verified against a running end-to-end setup — not inferred from docs.
- **Scope of this change:** Phase 1 (MVP target — skills, commands, persona agents, MCP,
  and marketplace manifests). Phase 2 (lifecycle hooks) is deferred; see "Deferred" below.

## Problem

The plugin generator (`scripts/generate-plugin.mjs` + `scripts/lib/plugin-config.mjs`)
emits marketplace artifacts for `claude | cursor | gemini | codex`. There is no
`antigravity` target — yet the CI-review subsystem already treats Antigravity as a
first-class runner (`AgentCliRunnerId` includes `'antigravity'`, `command: 'agy'`,
`packages/core/src/review/ci/parsers/antigravity.ts`), and the `gemini` runner preset is
explicitly marked "SUPERSEDED by the `antigravity` runner". The plugin surface is behind
the CI subsystem. This closes the gap so agy users get skills, `/harness:*` slash
commands, persona agents, and the harness MCP server.

## agy contract (from #979, empirically verified there)

agy shares the `~/.gemini/` home directory with gemini-cli but is **not**
configuration-compatible with it:

| Surface        | gemini-cli                               | agy (Antigravity CLI)                                                                                                          |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Slash commands | `.toml` under `commands/`                | Same `.toml` format — agy reads `~/.gemini/commands/**` directly (reuse gemini)                                                |
| Persona agents | (none — gemini has no agents field)      | agy reads `~/.gemini/agents/*.md` (`agy agents` lists them)                                                                    |
| MCP servers    | `gemini-extension.json` → `mcpServers`   | **`~/.gemini/config/mcp_config.json`** shaped `{ "mcpServers": { … } }`. Declaring MCP in `settings.json` is silently ignored. |
| Hooks          | none (`hooksCommandTemplate: undefined`) | Full hooks support, but a different contract (stdin JSON payload → stdout decision object, not exit codes). See "Deferred".    |

Authoritative source cited in the issue: agy bundles its own docs at
`~/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/{mcp_servers,hooks,plugins,json_configs,rules}.md`.
The presence of `~/.gemini/antigravity-cli/` is what distinguishes an agy install from a
plain gemini-cli install that shares the same `~/.gemini/` root.

## Surface → artifact mapping (Phase 1)

| Harness surface      | agy artifact                                                         | How it is produced                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slash commands       | `commands/*.toml` (agy reads `~/.gemini/commands/**`)                | `harness generate-slash-commands --platforms gemini-cli` (same TOML the gemini target already emits)                                                             |
| Persona agents       | `agents/*.md` (agy reads `~/.gemini/agents/*.md`)                    | `harness generate-agent-definitions --platforms gemini-cli` (the gemini-cli renderer emits `.md`, which the gemini _extension_ target does not use but agy does) |
| MCP server           | `config/mcp_config.json` shaped `{ "mcpServers": { "harness": … } }` | Hand-maintained file at the empirically-verified location; MCP version pin kept in lockstep by `scripts/sync-plugin-pin.mjs`                                     |
| Marketplace metadata | `plugin.json` + `marketplace.json`                                   | Hand-maintained, mirroring the sibling plugins                                                                                                                   |

### Target configuration (`PLUGIN_CONFIGS.antigravity`)

- `pluginDir`: `.antigravity-extension`
- `slashCommandsPlatform`: `gemini-cli` (TOML; agy reuses the gemini command format)
- `agentPlatform`: `gemini-cli` (the gemini-cli agent renderer emits `.md`; agy reads
  `~/.gemini/agents/*.md`). This is the key divergence from the `gemini` _extension_
  target, which sets `agentPlatform: undefined` because gemini extensions have no agents
  field — agy does.
- `skillsDir`: `agents/skills/gemini-cli` (reuse the gemini-cli skill tree so generated
  command TOMLs embed gemini-cli-relative reference paths; agy shares `~/.gemini/`)
- `commandExt`: `.toml`
- `hooksCommandTemplate`: `undefined`, `generateHooks: false` (Phase 2 — see Deferred)

### MCP command choice

The empirical example in #979 shows the bare form
`{ "mcpServers": { "harness": { "command": "harness-mcp" } } }`. #979 notes the actual
command choice ("`harness-mcp` vs `npx … @latest`") "should follow whatever [#557] lands
on". The repo has already landed on an npx version pin for **every** sibling manifest
(claude/cursor/gemini/codex), and `scripts/sync-plugin-pin.mjs` + its drift test enforce
that pin across `MANIFEST_PATHS`. For consistency and to inherit the same pin-sync
guarantee, the antigravity `config/mcp_config.json` uses the pinned npx form:

```json
{
  "mcpServers": {
    "harness": {
      "command": "npx",
      "args": ["-y", "-p", "@harness-engineering/cli@<version>", "harness-mcp"]
    }
  }
}
```

`config/mcp_config.json` is added to `MANIFEST_PATHS` so the pin stays in lockstep and is
covered by the existing pin-sync test. The **shape** (`{ mcpServers: { harness: … } }`)
and the **file location** (`config/mcp_config.json`) are the empirically-verified parts;
the inner `command`/`args` follow the repo's established pinned convention.

## `harness setup` MCP wiring (client registry)

`packages/cli/src/setup/clients.ts` is the single registry `harness setup` uses to detect
a client and write its MCP config. A new `antigravity` client is registered:

- `name`: `Antigravity CLI`
- `detectDir`: `.gemini/antigravity-cli` (the agy-specific marker under the shared
  `~/.gemini/` root — distinct from gemini's `.gemini`, so a plain gemini install is not
  misdetected as agy)
- `client`: `antigravity`
- `configTarget`: `.gemini/config/mcp_config.json` (the empirically-verified agy MCP
  location — **not** `settings.json`, which agy ignores)
- `install`: marketplace plugin `harness-antigravity`

`setupMcp()` gains an `antigravity` branch that writes the harness entry to
`.gemini/config/mcp_config.json` via the existing `configureMcpServer` helper, whose
output shape (`{ mcpServers: { harness: { command: 'harness-mcp' } } }`) matches the agy
contract exactly. The parity test (`clients.test.ts`) and the agent-setup prompt
drift-gate are updated in the same change.

## Deferred (Phase 2 — hooks)

agy supports lifecycle hooks (global `~/.gemini/config/hooks.json`, per-project
`<repo>/.agents/hooks.json`), which would make antigravity the first non-Claude platform
with real harness guards (block-no-verify, protect-config). Per #979 this is explicitly a
separate phase because agy's hook contract differs fundamentally from Claude Code's:

- agy hooks read a JSON payload on **stdin** and write a decision object on **stdout**
  (`{"decision":"allow"|"deny"|"ask"|"force_ask","reason":…}`) rather than signaling via
  exit codes.
- Tool-name matchers differ (`run_command`, `write_to_file`, `edit_file`).
- Events differ: `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, `Stop` —
  **no `PreCompact`**.
- The existing `.harness/hooks/*.js` are Claude-contract (`tool_input.*` + `exit 2`), so
  agy support needs either dual-contract hook scripts or agy-native variants (real work in
  `packages/cli/src/hooks/`).

Only two of the standard hooks (block-no-verify, protect-config — the `deny`-based guards)
port cleanly; the rest need payload mapping. Shipping a fabricated `hooks.json` without the
dual-contract scripts would install non-functional guards, so hooks are intentionally out
of Phase 1. `generateHooks` is `false` and `hooksCommandTemplate` is `undefined` for the
antigravity target, matching the honest "no hooks surface generated yet" posture the
`gemini` and `codex` targets already take.

## Non-goals / unverified

- agy's own extension/plugin _manifest_ schema (from the bundled `plugins.md`) was not
  quoted in #979, so `plugin.json`/`marketplace.json` are authored to mirror the sibling
  marketplace manifests for discoverability and pin-sync parity — they do **not** claim an
  agy-specific manifest field that could not be verified. The MCP declaration lives in the
  verified `config/mcp_config.json`, not in the manifest (agy ignores manifest/settings MCP
  declarations).
- Phase 2 hooks, as above.

## Verification

- `pnpm run generate:plugin --target antigravity` emits `commands/*.toml`, `agents/*.md`,
  and leaves the hand-maintained `config/mcp_config.json` + manifests in place.
- `pnpm run generate:plugin:check` exits 0 with the antigravity target wired into
  `:all`/`:check`.
- Existing targets' artifacts remain intact (not emptied); only new antigravity artifacts
  are added.
- Node test coverage asserts the antigravity target's config shape and that the emitted
  file/dir structure exists, mirroring how existing targets are exercised.
- The pin-sync test covers the new `config/mcp_config.json` pin; the clients parity test
  covers the new `antigravity` client.
