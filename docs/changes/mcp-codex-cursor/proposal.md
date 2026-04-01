# Harness MCP Integration — Codex CLI + Cursor

**Keywords:** `mcp-integration`, `codex-cli`, `cursor`, `setup-wizard`, `tool-picker`, `clack-prompts`, `auto-detect`, `stdio-transport`

## Overview

`harness setup` already auto-detects and configures MCP for Claude Code and Gemini CLI. Codex CLI and Cursor — the two new platforms added by the multi-platform expansion spec — are not yet detected or configured. Users on those platforms get harness skills as static rules files but cannot invoke harness tools at runtime.

This spec extends `harness setup` auto-detection to cover Codex CLI and Cursor. Codex gets the full 51-tool MCP registration silently. Cursor triggers an interactive tool picker (`@clack/prompts`) with a curated ~25-tool pre-selection, then writes its config. No flags required.

**In scope:**

- Extend `harness setup` auto-detection to `~/.codex` (Codex CLI) and `~/.cursor` (Cursor)
- TOML writer for Codex CLI's `.codex/config.toml`
- `@clack/prompts` interactive tool picker for Cursor's ~40-tool limit
- `setup-mcp --client codex/cursor` scripting support with `--pick` and `--yes` flags
- Update `harness setup` slash command generation to include `codex` and `cursor` platforms

**Out of scope:**

- HTTP/SSE transport (stdio only, consistent with current harness MCP server)
- Windsurf, Continue.dev, GitHub Copilot, Aider
- MCP Resources support for Cursor (not yet supported by Cursor)
- Marketplace/one-click installation

**Depends on:** Harness Multi-Platform Expansion — Codex CLI + Cursor (`docs/changes/multi-platform-expansion/proposal.md`) — `codex` and `cursor` must be valid platform enums before slash command generation can include them.

---

## Decisions

| Decision                 | Choice                                                      | Rationale                                                                                                                       |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| UX model                 | Auto-detect, no flags required                              | Matches existing `harness setup` pattern — detects `~/.codex` and `~/.cursor` exactly as it detects `~/.claude` and `~/.gemini` |
| Codex tool registration  | All 51 tools, silent                                        | No documented tool limit; all tools relevant; consistent with Claude Code behavior                                              |
| Cursor tool registration | Interactive picker, ~25 pre-selected                        | ~40 tool limit across ALL servers combined; users need control; picker was explicitly requested                                 |
| Prompt library           | `@clack/prompts`                                            | Used by create-vite, Astro, SvelteKit — stable, small (~10KB), polished checkbox UX                                             |
| Cursor config format     | JSON (`.cursor/mcp.json`)                                   | Cursor's native format; matches Claude Code's `.mcp.json` — same `writeMcpEntry` utility                                        |
| Codex config format      | TOML (`.codex/config.toml`)                                 | Codex's native format; requires new TOML writer utility                                                                         |
| Scripting support        | `--client codex/cursor` + `--yes` on `setup-mcp`            | Flags bypass picker for CI/scripting; `--yes` accepts curated defaults                                                          |
| Slash command generation | Include `codex` and `cursor` in `runSlashCommandGeneration` | `harness setup` currently hardcodes `['claude-code', 'gemini-cli']` — needs updating                                            |

---

## Technical Design

### Detection Extension (`setup.ts`)

Extend the `clients` array in `runMcpSetup` with two new entries:

```typescript
const clients = [
  { name: 'Claude Code', dir: '.claude', client: 'claude', configTarget: '.mcp.json' },
  { name: 'Gemini CLI', dir: '.gemini', client: 'gemini', configTarget: '.gemini/settings.json' },
  { name: 'Codex CLI', dir: '.codex', client: 'codex', configTarget: '.codex/config.toml' },
  { name: 'Cursor', dir: '.cursor', client: 'cursor', configTarget: '.cursor/mcp.json' },
];
```

Detection uses the existing `detectClient(dir)` — checks `~/.{dir}` exists. No changes to detection logic.

### TOML Writer (`integrations/toml.ts`)

New utility: `packages/cli/src/integrations/toml.ts`

Codex CLI's `.codex/config.toml` format:

```toml
[mcp_servers.harness]
command = "harness"
args = ["mcp"]
enabled = true
```

`writeTomlMcpEntry(filePath, serverName, config)` — read-then-merge pattern (same as JSON `writeMcpEntry`). Only touches `[mcp_servers.harness]` block. Uses inline TOML serializer scoped to this structure — avoids a new `toml` parser dependency.

### Cursor Tool Picker (`setup-mcp.ts`)

New function `runCursorToolPicker(): Promise<string[]>` using `@clack/prompts`:

```typescript
const CURSOR_CURATED_TOOLS = [
  'run_skill',
  'validate_project',
  'emit_interaction',
  'check_docs',
  'manage_roadmap',
  'run_code_review',
  'check_phase_gate',
  'gather_context',
  'find_context_for',
  'get_impact',
  'detect_entropy',
  'run_security_scan',
  'assess_project',
  'manage_state',
  'create_self_review',
  'analyze_diff',
  'request_peer_review',
  'review_changes',
  'check_dependencies',
  'search_skills',
  'code_search',
  'code_outline',
  'ask_graph',
  'query_graph',
  'detect_anomalies',
  // 25 tools — leaves ~15 slots for user's other MCP servers
];
```

Picker shows all 51 tools, curated 25 pre-selected, with description hints. `@clack/prompts` auto-detects non-TTY and falls back gracefully.

### `setup-mcp.ts` Scripting Extension

New client cases in `setupMcp(cwd, client)`:

```typescript
case 'codex':
  writeTomlMcpEntry(codexConfigPath, 'harness', { command: 'harness', args: ['mcp'], enabled: true });
  break;
case 'cursor':
  writeMcpEntry(cursorConfigPath, 'harness', { command: 'harness', args: ['mcp'] });
  break;
```

New CLI flags:

```bash
harness setup-mcp --client codex             # all 51 tools, no picker
harness setup-mcp --client cursor            # curated 25, no picker
harness setup-mcp --client cursor --pick     # launches interactive picker
harness setup-mcp --client cursor --yes      # curated 25, bypass all prompts
```

### Slash Command Generation Update

In `setup.ts` `runSlashCommandGeneration`:

```typescript
platforms: ['claude-code', 'gemini-cli', 'codex', 'cursor'],
// was: ['claude-code', 'gemini-cli']
```

### New Dependency

```json
"@clack/prompts": "^0.9.0"
```

Added to `packages/cli/package.json` dependencies.

### File Changes

```
packages/cli/
  package.json                     ← +@clack/prompts
  src/commands/setup.ts            ← extend clients array, async Cursor path
  src/commands/setup-mcp.ts        ← +codex, +cursor cases, +--pick flag
  src/integrations/toml.ts         ← new: TOML MCP entry writer
  src/integrations/config.ts       ← minor: export config path helpers for new formats
```

### Risks

| Risk                                                                     | Mitigation                                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `@clack/prompts` not available in non-TTY environments (CI, piped input) | Auto-detects non-TTY and falls back gracefully; `--yes` flag bypasses picker entirely |
| TOML writer edge cases (existing config with other entries)              | Read-then-merge pattern; only touches `[mcp_servers.harness]` block                   |
| Cursor tool limit changes                                                | Picker always shows current count; user stays in control                              |
| `runMcpSetup` becoming async breaks `runSetup` call chain                | `runSetup` updated to `await` the async step; existing sync steps unaffected          |

---

## Success Criteria

1. `harness setup` on a machine with `~/.codex` present writes a valid `[mcp_servers.harness]` entry to `.codex/config.toml` without any flags.
2. `harness setup` on a machine with `~/.cursor` present launches the `@clack/prompts` tool picker with ~25 tools pre-selected.
3. Confirming the picker writes a valid `mcpServers.harness` entry to `.cursor/mcp.json` with only the selected tools registered.
4. `harness setup` on a machine without `~/.codex` or `~/.cursor` skips those steps with a `⚠ skipped` message — identical to current Claude Code / Gemini CLI skip behavior.
5. `harness setup-mcp --client codex` registers all 51 tools without launching the picker.
6. `harness setup-mcp --client cursor` registers the curated 25 tools without launching the picker.
7. `harness setup-mcp --client cursor --pick` launches the picker in a standalone flow.
8. `harness setup` in a non-TTY environment does not hang — picker is bypassed and curated set is used.
9. Existing Claude Code and Gemini CLI setup behavior is unaffected.
10. `harness setup` slash command generation includes `codex` and `cursor` platforms.
11. The TOML writer does not clobber existing entries in `.codex/config.toml` — only adds/updates `[mcp_servers.harness]`.

---

## Implementation Order

**Phase 1 — Foundation**

1. **TOML writer** — Implement `packages/cli/src/integrations/toml.ts` with `writeTomlMcpEntry`. Read-then-merge logic for `.codex/config.toml`.
2. **`setup-mcp` extension** — Add `codex` and `cursor` client cases to `setupMcp()`. Wire Codex to TOML writer, Cursor to existing `writeMcpEntry`. Add `--pick` flag stub (no-op until Phase 2).

**Phase 2 — Interactive Picker** 3. **Add `@clack/prompts`** — Add dependency, define `CURSOR_CURATED_TOOLS` (25 tools), implement `runCursorToolPicker()`. 4. **Wire picker** — `--pick` invokes picker; `--yes` bypasses with curated set.

**Phase 3 — `harness setup` Integration** 5. **Extend `setup.ts`** — Add Codex and Cursor to `clients` array. Make `runMcpSetup` async. Cursor path calls picker; Codex path silent. 6. **Update slash command generation** — Add `codex` and `cursor` to `platforms` in `runSlashCommandGeneration`.

**Phase 4 — Tests & Validation** 7. **Tests** — Unit tests for TOML writer (read/merge/write), `setupMcp` codex/cursor cases, picker bypass in non-TTY, existing platforms unaffected. 8. **Validation** — Run `harness validate`. End-to-end on machines with/without target clients installed.

**Blocking dependency:** Harness Multi-Platform Expansion — Codex CLI + Cursor must be merged before Phase 3 Step 6.
