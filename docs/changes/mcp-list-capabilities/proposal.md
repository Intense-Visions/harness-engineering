# harness mcp list-capabilities — MCP adopter capability audit

**Status:** Draft · **Tier:** Small · **Domain:** cli / mcp / trust-model
**Keywords:** mcp, capabilities, audit, trust, trustedOutput, read-write-exec, network, adopter, declaration

## Overview

The harness MCP server registers ~94 tools. An adopter who wires the server into
their agent (Claude Code, Cursor, …) has **no easy way to see what those tools
can actually do** — which ones read, which write files or mutate state, which run
subprocesses, and which reach the network.

This change adds a read-only CLI command:

```
harness mcp list-capabilities [--by-permission] [--json]
```

that surfaces, per tool: its read/write/exec **scopes** (multiple allowed),
**network** access, the existing **trust** tag, and the **source** of the scope
data (declared vs. heuristic fallback). `--by-permission` regroups the tools into
READ / WRITE / EXEC sections plus a cross-cutting NETWORK section. `--json` emits
a machine-readable record for scripting an audit.

## Where the capability data comes from

Because this is a Trust & Security audit surface, accuracy matters — so scopes are
now **authored, evidence-based DECLARATIONS**, not a name guess.

- **Capability declaration (authoritative)** — each tool carries a
  `capability?: { scopes: Array<'read'|'write'|'exec'>; network?: boolean }`
  field on its `ToolDefinition` (`packages/cli/src/mcp/tool-types.ts`). The
  declarations live in `packages/cli/src/mcp/tool-capability-declarations.ts` and
  are merged onto the registry in `server.ts`, so the **shipped, compiled
  registry** carries them. This resolves the earlier "the published CLI has no TS
  source at runtime" concern: the declaration is **authored data compiled into the
  registry**, so the runtime reads declared values — it never scans source.
- **Evidence-based classification** — each declaration was derived by reading the
  tool's handler and the core/graph function it calls, and grepping for concrete
  signals rather than the tool name:
  - `write` — `writeFile*` / `mkdir`, config/state persistence, graph
    ingest/upsert, on-disk locks, generated artifacts (skills, agents, personas).
  - `exec` — `child_process` / `execFile*` / `execSync` / `spawn`, shelling to
    git/lint/CLI, dispatching an agent runner.
  - `read` — none of the above; observation only (the default **only** when there
    is no write/exec/network evidence).
  - `network: true` — outbound `fetch`/HTTP: Gateway API, webhook registration,
    external issue-tracker sync, PR-comment posting.
- **Trust tag** — surfaced verbatim from the existing `trustedOutput` flag. Exact,
  not derived.

Several tools are **deliberately misclassified by their name** — which is exactly
why declared data matters:

- `run_ci_checks` reads like `exec` but core `runCIChecks` runs every check
  **in-process** (no subprocess) → `read`.
- `run_skill` reads like `exec` but only loads and **returns** `SKILL.md` → `read`.
- `run_code_review` reads in-process but **posts PR comments to GitHub** →
  `read` + `network`.
- `outcome_eval` reads a diff but **persists an execution_outcome graph node** →
  `read` + `write`.
- `manage_roadmap` persists locally **and syncs to GitHub** → `write` + `network`.

### Heuristic fallback (kept, clearly labeled)

The tool-name verb-prefix heuristic (`run_`/`dispatch_`/`trigger_` → `exec`;
`write_`/`edit_`/`create_`/… → `write`; else `read`) survives as a **fallback**
for any tool that has not yet been declared. It is deterministic, ships with the
compiled artifact, and is marked `source: 'heuristic'` in every view. Because a
coverage test forces every **registered** tool to carry a declaration, the
fallback is expected to be rare-to-never in practice — it exists only so a tool
added later still gets a conservative answer before it is annotated.

## Design

- `packages/cli/src/mcp/tool-types.ts` — adds the `ToolCapabilityDeclaration`
  type and the `capability?` field on `ToolDefinition`, documented.
- `packages/cli/src/mcp/tool-capability-declarations.ts` — the authored,
  evidence-annotated declaration map keyed by tool name.
- `packages/cli/src/mcp/server.ts` — merges each declaration onto its definition
  at registry-assembly time (alongside `trustedOutput`).
- `packages/cli/src/mcp/tool-capabilities.ts` — resolution module:
  `deriveToolCapability(def)` prefers the declared `capability`; falls back to the
  name heuristic (`deriveScope`, `NETWORK_TOOL_NAMES`) only when a tool has no
  declaration. Emits `scopes: ToolScope[]` and a `source` provenance tag.
- `packages/cli/src/commands/mcp.ts` — the `list-capabilities` subcommand plus
  `formatCapabilitiesTable` / `formatCapabilitiesByPermission` string builders.
  The command dynamically imports the registry via `getToolDefinitions()`.

## Non-goals

- Enforcing or gating on capabilities — this command only reports.
- Runtime source/AST scanning of tool handlers (the declaration replaces it).

## Testing

`packages/cli/tests/commands/mcp-list-capabilities.test.ts` covers the declared /
heuristic-fallback resolution, scope normalization, the trust/network mapping, and
both formatters. The registry-level tests assert one capability per registered
tool, full name coverage, and — the key coverage gate — that **every registered
tool carries a declaration** (`source === 'declared'`), so a future tool added
without an entry fails the suite. All counts are **derived** from
`getToolDefinitions()`, never hardcoded literals. The security-relevant minority
(the declared `exec` and `network` sets) is asserted explicitly so a regression is
loud.

At the time of writing: **94 tools — 72 read, 22 write, 9 exec, 5 network** (all
declared, 0 heuristic).
