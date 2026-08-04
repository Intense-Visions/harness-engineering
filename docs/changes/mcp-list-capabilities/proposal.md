# harness mcp list-capabilities — MCP adopter capability audit

**Status:** Draft · **Tier:** Small · **Domain:** cli / mcp / trust-model
**Keywords:** mcp, capabilities, audit, trust, trustedOutput, read-write-exec, network, adopter, heuristic

## Overview

The harness MCP server registers ~90 tools. An adopter who wires the server into
their agent (Claude Code, Cursor, …) has **no easy way to see what those tools
can actually do** — which ones read, which write files or mutate state, which run
subprocesses, and which reach the network. The only per-tool metadata that exists
today is `name`, `description`, and the `trustedOutput` trust flag
(`packages/cli/src/mcp/tool-types.ts`).

This change adds a read-only CLI command:

```
harness mcp list-capabilities [--by-permission] [--json]
```

that surfaces, per tool: a read/write/exec **scope**, **network** access, and the
existing **trust** tag. `--by-permission` regroups the tools into READ / WRITE /
EXEC sections plus a cross-cutting NETWORK section. `--json` emits a
machine-readable record for scripting an audit.

## Where the capability data comes from (and its honesty)

There is no per-tool capability declaration in the registry yet — adding one is the
job of roadmap **#558**. Until then this command derives capability signals
**mechanically** and labels the derived axis as a heuristic, both in the output
(a `# scope is a HEURISTIC …` banner) and here:

- **Trust tag** — surfaced verbatim from the existing `trustedOutput` flag. Exact,
  not derived. (`trusted` = the injection guard skips output scanning; the flag's
  own comment notes future external-content tools should omit it.)
- **Network access** — a small, **grounded** allow-list
  (`trigger_maintenance_job`, `list_gateway_tokens`, `subscribe_webhook`). An
  import scan of `packages/cli/src/mcp/tools/` confirms only the Gateway API
  bridge (`gateway-tools.ts`) and webhook subscription (`webhook-tools.ts`) make
  outbound calls. Network cannot be inferred from the name — `list_gateway_tokens`
  reads like a local list — so it is an explicit constant.
- **Scope (read/write/exec)** — a conservative **heuristic derived from the tool
  name's verb prefix**: `run_`/`dispatch_`/`trigger_` → `exec`;
  `write_`/`edit_`/`create_`/`generate_`/`manage_`/`ingest_`/… → `write`;
  everything else defaults to the least-privilege `read`.

Deriving scope from the **name** rather than by scanning each handler's source
(for `fs`-write / `child_process` / `fetch`) is deliberate: the command must work
for adopters running the **published CLI**, where only the compiled registry — not
the TypeScript source — exists at runtime. The naming signal is deterministic,
travels with the shipped artifact, and is unit-testable.

### Known limitations

- Scope can **under-report**: a few `read`-named tools shell out internally
  (e.g. `assess_project`, `design_craft`, `review_changes`) yet are classified
  `read` because their name carries no exec verb.
- Scope is the single highest-privilege axis implied by the verb, not an
  exhaustive permission set.
- The network allow-list must be maintained by hand when a new network tool lands.

**These limitations are inherent to inferring capability from names.** The real
fix is a per-tool capability declaration (**#558**), which this command would then
surface directly instead of deriving.

## Design

- `packages/cli/src/mcp/tool-capabilities.ts` — pure derivation module:
  `deriveScope(name)`, `deriveToolCapability(def)`, `deriveToolCapabilities(defs)`
  (sorted by name for deterministic output), and the exported
  `NETWORK_TOOL_NAMES` allow-list.
- `packages/cli/src/commands/mcp.ts` — a new `list-capabilities` subcommand of the
  existing `mcp` command (mirrors how `mcp-guard` nests `check`), plus exported
  `formatCapabilitiesTable` / `formatCapabilitiesByPermission` string builders.
  The command dynamically imports the registry via `getToolDefinitions()` so
  startup cost is unchanged.

## Non-goals

- Adding a per-tool capability declaration to the registry (that is #558).
- Enforcing or gating on capabilities — this command only reports.
- Runtime source/AST scanning of tool handlers.

## Testing

`packages/cli/tests/commands/mcp-list-capabilities.test.ts` covers the scope
classifier, the trust/network mapping, and both formatters. The registry-level
tests assert one capability per registered tool and full name coverage by
comparing against `getToolDefinitions().length` (a **derived** count, never a
hardcoded literal), and assert deterministic, sorted output.
