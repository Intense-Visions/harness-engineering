# Force-Multiplier Integrations (Tier 0-1)

> Zero-config and API-key MCP peer integrations that give agents access to live library docs, web research, semantic code search, browser automation, and structured reasoning.

**Status:** Draft
**Date:** 2026-03-30
**Keywords:** integrations, MCP, Context7, Perplexity, Augment Code, Sequential Thinking, Playwright, setup, doctor, env-vars, zero-config
**ADR:** .harness/architecture/force-multiplier-integrations/ADR-001.md

---

## Overview

Harness agents operate in a closed loop — they work within the codebase but lack access to the broader knowledge ecosystem. This proposal adds 5 MCP peer integrations across two tiers:

- **Tier 0 (zero-config):** Context7, Sequential Thinking, Playwright — free, no API keys, auto-configured by `harness setup`
- **Tier 1 (API-key):** Perplexity, Augment Code — require API keys, managed via new `harness integrations` command

These integrations fill the most critical capability gaps: agents hallucinate API signatures (Context7 fixes), can't search the web (Perplexity fixes), and lack semantic code search (Augment Code fixes).

### Out of Scope

- Graph connectors (ADR Tiers 2-3) — no inbound data flowing into the knowledge graph
- Outbound exporters (ADR Tier 4) — no pushing artifacts to external tools
- Bidirectional bridges (ADR Tier 5) — no two-way sync
- Sentry, E2B integrations — deferred to follow-up
- Health checks, version pinning — deferred to follow-up

---

## Decisions

| Decision                                                   | Rationale                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Scope to Tier 0 + Tier 1 only                              | Full ADR spans 6 tiers over months. Tier 0-1 delivers highest-impact integrations with lowest complexity.                      |
| Auto-configure Tier 0 in `harness setup`                   | Context7, Sequential Thinking, and Playwright are free with no API keys. Zero friction maximizes adoption.                     |
| New `harness integrations` command for Tier 1              | Keeps `harness setup` fast. Dedicated command supports post-setup add/remove lifecycle.                                        |
| Perplexity + Augment Code for Tier 1                       | Highest-impact capabilities (web research, semantic code search). Both are local MCP servers with simple npx install patterns. |
| Env vars for secrets, `harness.config.json` for enablement | Clean separation — secrets never stored in project files, enablement state is inspectable and version-controllable.            |
| `harness doctor` recommends once, respects dismissal       | Non-intrusive after first exposure. `dismissed` array in config. `harness integrations list` as escape hatch.                  |
| Static integration registry (not plugins)                  | 5 integrations don't justify a plugin architecture. Flat TypeScript array is trivially extensible.                             |
| No health checks in v1                                     | Avoids flaky process-spawning complexity. Registry entries can gain optional `healthCheck` fields later.                       |

---

## Technical Design

### Integration Registry

A static TypeScript array of integration definitions. Adding an integration = adding an object.

```typescript
interface IntegrationDef {
  name: string; // e.g. 'context7'
  displayName: string; // e.g. 'Context7'
  description: string; // One-line pitch for doctor/list output
  tier: 0 | 1;
  envVar?: string; // Required env var for Tier 1
  mcpConfig: {
    command: string; // e.g. 'npx'
    args: string[]; // e.g. ['-y', '@upstash/context7-mcp']
    env?: Record<string, string>; // e.g. { PERPLEXITY_API_KEY: '${PERPLEXITY_API_KEY}' }
  };
  installHint?: string; // Shown when env var is missing
  platforms: ('claude-code' | 'gemini-cli')[];
}
```

**Registry contents:**

| Name                | Tier | Env Var              | MCP Command                                 | Purpose                                       |
| ------------------- | ---- | -------------------- | ------------------------------------------- | --------------------------------------------- |
| context7            | 0    | —                    | `npx -y @upstash/context7-mcp`              | Live version-pinned docs for 9,000+ libraries |
| sequential-thinking | 0    | —                    | `npx -y @anthropic/sequential-thinking-mcp` | Structured multi-step reasoning               |
| playwright          | 0    | —                    | `npx -y @anthropic/playwright-mcp`          | Browser automation for E2E testing            |
| perplexity          | 1    | `PERPLEXITY_API_KEY` | `npx -y @anthropic/perplexity-mcp`          | Real-time web search and deep research        |
| augment-code        | 1    | `AUGMENT_API_KEY`    | `npx -y @augmentcode/mcp-server`            | Semantic code search across codebase          |

_Exact npm package names to be verified at implementation time._

### File Layout

```
packages/cli/src/
  integrations/
    registry.ts              # IntegrationDef[] static registry
    types.ts                 # IntegrationDef interface, IntegrationsConfig type
    config.ts                # Read/write integrations section of harness.config.json
  commands/integrations/
    index.ts                 # createIntegrationsCommand() — registers subcommands
    add.ts                   # harness integrations add <name>
    list.ts                  # harness integrations list
    remove.ts                # harness integrations remove <name>
    dismiss.ts               # harness integrations dismiss <name>
  commands/setup.ts          # Modified — add configureTier0Integrations() step
  commands/doctor.ts         # Modified — add integration check category
```

### Config Schema Addition

Add to the existing Zod schema in `packages/cli/src/config/schema.ts`:

```typescript
integrations: z.object({
  enabled: z.array(z.string()).default([]),
  dismissed: z.array(z.string()).default([]),
}).optional(),
```

Example `harness.config.json`:

```json
{
  "integrations": {
    "enabled": ["perplexity"],
    "dismissed": ["augment-code"]
  }
}
```

- `enabled`: Tier 1 integrations the user has explicitly added via `harness integrations add`
- `dismissed`: Integrations the user doesn't want `harness doctor` to suggest

Tier 0 integrations are not tracked here — they are always configured by `harness setup`.

### CLI Surface

```
harness integrations list                  # Show all integrations with status
harness integrations add <name>            # Enable integration, write .mcp.json, prompt for env var
harness integrations remove <name>         # Remove from .mcp.json and enabled list
harness integrations dismiss <name>        # Suppress doctor recommendations
```

#### `harness integrations list` Output

```
MCP Integrations:

  Tier 0 (zero-config):
    ✓ context7              Live library docs (9,000+ libraries)
    ✓ sequential-thinking   Structured multi-step reasoning
    ✓ playwright            Browser automation for E2E testing

  Tier 1 (API key required):
    ✓ perplexity            Web research for agents          PERPLEXITY_API_KEY ✓
    ○ augment-code          Semantic code search             [dismissed]

  Run 'harness integrations add <name>' to enable a Tier 1 integration.
```

#### `harness integrations add <name>` Flow

1. Look up `name` in registry. Error if not found.
2. If Tier 0: "Already configured by `harness setup`. Run `harness setup` if missing."
3. Write MCP entry to `.mcp.json` (and `.gemini/settings.json` if detected).
4. Add to `enabled` in `harness.config.json`.
5. Remove from `dismissed` if present.
6. If `envVar` defined: check if set. If not, print: "Set `PERPLEXITY_API_KEY` in your environment to activate. See: <install hint>".

#### `harness integrations remove <name>` Flow

1. Remove MCP entry from `.mcp.json` (and `.gemini/settings.json`).
2. Remove from `enabled` in `harness.config.json`.

### `harness setup` Changes

After the existing `setupMcp()` step, add a `configureTier0Integrations()` step:

1. Read current `.mcp.json` (already loaded by setup-mcp).
2. For each Tier 0 integration in registry: if key not already present in `mcpServers`, add it.
3. Write back `.mcp.json`.
4. Repeat for `.gemini/settings.json` if Gemini CLI detected.
5. Log: "Configured 3 MCP integrations: Context7, Sequential Thinking, Playwright".

Non-destructive: existing MCP server entries are preserved.

### `harness doctor` Changes

Add check category "Integrations" with three check types:

1. **Tier 0 presence:** For each Tier 0 integration, verify entry exists in `.mcp.json`. If missing: "Context7 not configured. Run `harness setup` to fix." Status: fail.

2. **Tier 1 suggestions:** For each non-dismissed, non-enabled Tier 1 integration, suggest it. "Perplexity enables web research for agents. Run `harness integrations add perplexity`." Status: info (not fail).

3. **Env var warnings:** For each enabled Tier 1 integration with `envVar`, check if env var is set. If not: "Perplexity enabled but PERPLEXITY_API_KEY not set." Status: warn.

All checks follow the existing `CheckResult` pattern (name, status, message, fix).

### Gemini CLI Parity

All commands that write to `.mcp.json` also write to `.gemini/settings.json` when Gemini CLI is detected. Follows the exact same pattern as existing `setup-mcp.ts`.

---

## Success Criteria

1. When `harness setup` runs, `.mcp.json` contains entries for Context7, Sequential Thinking, and Playwright. Same for `.gemini/settings.json` if Gemini CLI is detected.
2. When `harness integrations add perplexity` runs, the MCP entry is added to `.mcp.json`, enablement is recorded in `harness.config.json`, and the user is told to set `PERPLEXITY_API_KEY`.
3. When `harness integrations list` runs, all 5 integrations are shown with correct status (configured / available / dismissed).
4. When `harness integrations remove <name>` runs, the MCP entry and enablement record are cleanly removed.
5. When `harness doctor` runs for the first time, unconfigured Tier 1 integrations are recommended.
6. When `harness integrations dismiss <name>` runs, subsequent `harness doctor` runs no longer suggest that integration.
7. When a Tier 1 integration is enabled but its env var is not set, `harness doctor` warns.
8. When Tier 0 entries are missing from `.mcp.json`, `harness doctor` detects and suggests `harness setup`.
9. Existing `.mcp.json` entries are never clobbered by setup or integrations commands.
10. All new code has unit tests covering registry, command handlers, setup modification, and doctor checks.
11. `harness validate` passes after all changes.

---

## Implementation Order

1. **Registry + types** — `IntegrationDef` interface and static registry array with 5 entries. Config schema addition.
2. **`harness integrations` command** — add, list, remove, dismiss subcommands with config read/write and `.mcp.json` manipulation.
3. **`harness setup` modification** — Tier 0 auto-configuration step after existing MCP setup.
4. **`harness doctor` modification** — Integration check category (Tier 0 presence, Tier 1 suggestions, env var warnings, dismissal respect).
5. **Gemini CLI parity** — Ensure all commands write to both `.mcp.json` and `.gemini/settings.json`.
6. **Tests** — Unit tests for registry, command handlers, setup integration, doctor checks.
