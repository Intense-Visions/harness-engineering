# Proposal: `antigravity` (agy) plugin-generator target

- **Status:** Proposed
- **Keywords:** plugin-generator, antigravity, agy, gemini-cli, mcp-config, marketplace, persona-agents, slash-commands
- **Source of contract:** GitHub issue #979 (reporter: ChadTowle). The agy customization
  contract below is quoted from that issue, which reverse-engineered it from a working
  local install (agy 1.1.8, `~/.local/bin/agy`) and is described there as empirically
  verified against a running end-to-end setup — not inferred from docs.
- **Scope of this change:** Phase 1 (MVP target — skills, commands, persona agents, MCP,
  and marketplace manifests). Phase 2 (lifecycle hooks) is deferred; see "Deferred" below.

## Overview and goals

The plugin generator (`scripts/generate-plugin.mjs` + `scripts/lib/plugin-config.mjs`)
emits marketplace artifacts for `claude | cursor | gemini | codex`. There is no
`antigravity` target — yet the CI-review subsystem already treats Antigravity as a
first-class runner (`AgentCliRunnerId` includes `'antigravity'`, `command: 'agy'`,
`packages/core/src/review/ci/parsers/antigravity.ts`), and the `gemini` runner preset is
explicitly marked "SUPERSEDED by the `antigravity` runner". The plugin surface is behind
the CI subsystem.

**Goal:** close that gap. Add an `antigravity` target so agy users get skills, `/harness:*`
slash commands, persona agents, and the harness MCP server, produced by the same generator
that serves every other client.

**Non-goal (this phase):** lifecycle hooks. agy's hook contract differs fundamentally from
Claude Code's (stdin/stdout decision object vs exit codes) and needs real work in
`packages/cli/src/hooks/`. Deferred to Phase 2 — see "Deferred".

## Decisions made

1. **Distinct target, not a `gemini` alias.** agy shares the `~/.gemini/` home directory
   with gemini-cli but is **not** configuration-compatible with it (see contract table).
   The two divergences that force a separate target: agy reads persona agents from
   `~/.gemini/agents/*.md` (the gemini *extension* target sets `agentPlatform: undefined`
   because gemini extensions have no agents field — agy does), and agy reads MCP from
   `config/mcp_config.json` (declaring MCP in `settings.json`, as the gemini extension
   does, is silently ignored by agy). _Rationale:_ aliasing to `gemini` would ship no
   persona agents and a silently-ignored MCP declaration — the target would be
   non-functional for its two headline surfaces.

2. **MCP command uses the repo's pinned npx form, not the issue's bare `harness-mcp`.**
   The empirical example in #979 shows `{ "command": "harness-mcp" }`, but #979 notes the
   actual choice "should follow whatever [#557] lands on". Every sibling manifest already
   uses the pinned npx form and `scripts/sync-plugin-pin.mjs` + its drift test enforce that
   pin across `MANIFEST_PATHS`. _Rationale:_ consistency and inheriting the pin-sync
   guarantee. The **shape** (`{ mcpServers: { harness: … } }`) and **file location**
   (`config/mcp_config.json`) are the empirically-verified parts; the inner `command`/`args`
   follow the repo convention.

3. **Hooks deferred (Phase 2).** `generateHooks: false`, `hooksCommandTemplate: undefined`
   — matching the honest "no hooks surface generated yet" posture the `gemini` and `codex`
   targets already take. Shipping a fabricated `hooks.json` without dual-contract scripts
   would install non-functional guards. _Rationale:_ honesty over surface area.

## Technical design

### agy contract (from #979, empirically verified there)

| Surface        | gemini-cli                               | agy (Antigravity CLI)                                                                                                          |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Slash commands | `.toml` under `commands/`                | Same `.toml` format — agy reads `~/.gemini/commands/**` directly (reuse gemini)                                                |
| Persona agents | (none — gemini has no agents field)      | agy reads `~/.gemini/agents/*.md` (`agy agents` lists them)                                                                    |
| MCP servers    | `gemini-extension.json` → `mcpServers`   | **`~/.gemini/config/mcp_config.json`** shaped `{ "mcpServers": { … } }`. Declaring MCP in `settings.json` is silently ignored. |
| Hooks          | none (`hooksCommandTemplate: undefined`) | Full hooks support, different contract (stdin JSON payload → stdout decision object). See "Deferred".                          |

The presence of `~/.gemini/antigravity-cli/` distinguishes an agy install from a plain
gemini-cli install sharing the same `~/.gemini/` root.

### Target configuration (`PLUGIN_CONFIGS.antigravity`)

- `label`: `Antigravity CLI`
- `pluginDir`: `.antigravity-extension`
- `slashCommandsPlatform`: `gemini-cli` (TOML; agy reuses the gemini command format)
- `agentPlatform`: `gemini-cli` (the gemini-cli agent renderer emits `.md`; agy reads
  `~/.gemini/agents/*.md`). This is the key divergence from the `gemini` extension target,
  which sets `agentPlatform: undefined`.
- `skillsDir`: `agents/skills/gemini-cli` (reuse the gemini-cli skill tree so generated
  command TOMLs embed gemini-cli-relative reference paths; agy shares `~/.gemini/`)
- `commandExt`: `.toml`
- `cursorMode`: `undefined`
- `generateCommands`: `true`, `generateAgents`: `true`, `generateHooks`: `false`
- `hooksCommandTemplate`: `undefined`

### Surface → artifact mapping (Phase 1)

| Harness surface      | agy artifact                                                         | How it is produced                                                                                          |
| -------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Slash commands       | `commands/*.toml` (agy reads `~/.gemini/commands/**`)                | `harness generate-slash-commands --platforms gemini-cli` (same TOML the gemini target already emits)        |
| Persona agents       | `agents/*.md` (agy reads `~/.gemini/agents/*.md`)                    | `harness generate-agent-definitions --platforms gemini-cli` (the gemini-cli renderer emits `.md`)           |
| MCP server           | `config/mcp_config.json` shaped `{ "mcpServers": { "harness": … } }` | Hand-maintained file at the empirically-verified location; MCP version pin kept in lockstep by pin-sync     |
| Marketplace metadata | `plugin.json` + `marketplace.json`                                   | Hand-maintained, mirroring the sibling plugins                                                              |

### MCP config file (`.antigravity-extension/config/mcp_config.json`)

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

Added to `sync-plugin-pin.mjs` `MANIFEST_PATHS` so the pin stays in lockstep and is covered
by the existing pin-sync drift test.

### `harness setup` MCP wiring (client registry)

`packages/cli/src/setup/clients.ts` is the single registry `harness setup` uses. A new
`antigravity` client is registered (per ADR 0073, this is the only place a client must be
added; the parity test + prompt drift-gate enforce both consumers stay in sync):

- `name`: `Antigravity CLI`
- `detectDir`: `.gemini/antigravity-cli` (the agy-specific marker under the shared
  `~/.gemini/` root — distinct from gemini's `.gemini`, so a plain gemini install is not
  misdetected as agy)
- `client`: `antigravity`
- `configTarget`: `.gemini/config/mcp_config.json` (the empirically-verified agy MCP
  location — **not** `settings.json`, which agy ignores)
- `install`: marketplace plugin `harness-antigravity`

`setupMcp()` (`packages/cli/src/commands/setup-mcp.ts`) gains an `antigravity` branch that
writes the harness entry to `.gemini/config/mcp_config.json` via the existing
`configureMcpServer` helper.

## Integration Points

- **Entry Points:** new `antigravity` key in `PLUGIN_CONFIGS`; new `pnpm generate:plugin:antigravity`
  script; new `antigravity` client in `SETUP_CLIENTS`; new `antigravity` branch in `setupMcp()`.
- **Registrations Required:** wire `generate:plugin:antigravity` into `generate:plugin:all`
  and `generate:plugin:check` in `package.json`; add `.antigravity-extension/config/mcp_config.json`
  to `sync-plugin-pin.mjs` `MANIFEST_PATHS`; regenerate the agent-setup prompt
  (`docs/agent-setup/prompt.md`) and the CLI-commands reference (`docs/reference/cli-commands.md`)
  via their generators so the drift gates pass.
- **Documentation Updates:** the two generated docs above are regenerated (not hand-edited).
  No AGENTS.md change required — the target follows the established plugin pattern.
- **Architectural Decisions:** None rise to a new standalone ADR. Decision 1 (distinct target)
  and Decision 2 (pinned MCP form) are spec-local; the client-registry single-source rule is
  already ADR 0073.
- **Knowledge Impact:** reinforces the existing `ci-review-contract` multi-client concept —
  antigravity now has plugin parity with its CI-runner status. No new graph node required.

## Success criteria (observable, testable)

1. `pnpm generate:plugin --target antigravity` emits `commands/*.toml` and `agents/*.md`
   under `.antigravity-extension/`, and leaves the hand-maintained `config/mcp_config.json`
   + `plugin.json` + `marketplace.json` in place.
2. `pnpm generate:plugin:check` exits 0 with the antigravity target wired into `:all`/`:check`.
3. Existing targets' artifacts remain intact (claude/cursor/gemini/codex dirs not emptied);
   the change is purely additive.
4. A Node test asserts the antigravity target's config shape and that the emitted file/dir
   structure exists, mirroring how existing targets are exercised.
5. The pin-sync test covers the new `config/mcp_config.json` pin; the clients parity test
   and setup tests cover the new `antigravity` client (counts updated).
6. `harness generate-docs --check` is clean (regenerated prompt + cli-commands reference).

## Implementation order (high-level phases)

1. **Config + generator wiring** — add `PLUGIN_CONFIGS.antigravity`, the `pnpm` script,
   wire into `:all`/`:check`; add the MCP-config path to `MANIFEST_PATHS`.
2. **Hand-maintained manifests** — author `.antigravity-extension/{config/mcp_config.json,
   plugin.json, marketplace.json}`.
3. **Generate artifacts** — run the generator to emit `commands/*.toml` + `agents/*.md`.
4. **Setup client wiring** — register the `antigravity` client + `setupMcp()` branch;
   update parity/setup tests.
5. **Tests + docs** — add the target test; regenerate the drift-gated docs; changeset.

## Deferred (Phase 2 — hooks)

agy supports lifecycle hooks (global `~/.gemini/config/hooks.json`, per-project
`<repo>/.agents/hooks.json`), which would make antigravity the first non-Claude platform
with real harness guards (block-no-verify, protect-config). Per #979 this is explicitly a
separate phase because agy's hook contract differs fundamentally from Claude Code's:

- agy hooks read a JSON payload on **stdin** and write a decision object on **stdout**
  (`{"decision":"allow"|"deny"|"ask"|"force_ask","reason":…}`) rather than exit codes.
- Tool-name matchers differ (`run_command`, `write_to_file`, `edit_file`).
- Events differ: `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, `Stop` —
  **no `PreCompact`**.
- The existing `.harness/hooks/*.js` are Claude-contract (`tool_input.*` + `exit 2`), so
  agy support needs dual-contract hook scripts or agy-native variants.

Only the two `deny`-based guards (block-no-verify, protect-config) port cleanly; the rest
need payload mapping.

## Non-goals / unverified

- agy's own extension/plugin *manifest* schema (from the bundled `plugins.md`) was not
  quoted in #979, so `plugin.json`/`marketplace.json` are authored to mirror the sibling
  marketplace manifests for discoverability and pin-sync parity — they do **not** claim an
  agy-specific manifest field that could not be verified. The MCP declaration lives in the
  verified `config/mcp_config.json`, not in the manifest.
- Phase 2 hooks, as above.
