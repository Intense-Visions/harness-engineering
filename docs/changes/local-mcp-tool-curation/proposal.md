---
title: Curate which MCP-server tools the local agent sees
status: draft
keywords: ollama-backend, mcp, tool-allowlist, tool-curation, local-dispatch, choice-paralysis, agent-tools
---

# Curate which MCP-server tools the local agent sees

## Overview & Goals

[[ollama-backend-mcp-tools]] (PR #849) lets the local `OllamaBackend` agent use tools from configured MCP
servers, but it aggregates **every** tool a server exposes. In the live e2e (2026-07-16) the harness MCP
server alone contributed **95 tools**; with ~98 tools total, `qwen3-coder:30b` wrote the correct file (via
context7) but then **over-explored** — a `cat`/`find`/`read_file`/`ls` verification loop — without cleanly
emitting `TASK_COMPLETE`, so a real dispatch would terminate via `maxTurnsPerRun` instead of a clean
success. The limiter was **tool count (choice paralysis)**, not context size (the model had 262144 ctx).

**Goal:** let an operator curate which tools from a configured MCP server the agent receives, so a broad
server can be narrowed to the high-value set — making the local MCP interaction robust (fewer, better tools
→ less choice paralysis → cleaner completion). Keep the default (no allowlist) byte-identical to today.

**Non-goals (YAGNI):** per-tool renaming/aliasing; changing the harness MCP server's own tool surface
(that's `add-harness-mcp-list-capabilities`); tool _selection intelligence_ (ranking tools by task); a hard
cap that silently drops tools (we warn, never truncate silently).

## Decisions made

- **D1 — Per-server `tools?: string[]` allowlist on `McpServerSpec`.** When present, only tools whose
  (pre-namespacing) name is in the list are aggregated from that server; absent ⇒ all tools (unchanged).
  _(Rationale: portable to any server, opt-in, predictable, smallest surface.)_
- **D2 — Curate the scaffolded harness example to the read-oriented set.** The commented `harness` server
  example gains `tools: [code_search, ask_graph, review_changes, outcome_eval, gather_context]` (the
  [[ollama-backend-mcp-tools]] D3 read set) instead of exposing all 95. context7 stays un-narrowed (it has
  few tools). _(Rationale: ships a good default that avoids the 95-tool flood out of the box.)_
- **D3 — Unknown allowlisted names are warned + skipped, never fatal.** If an allowlist names a tool the
  server doesn't expose (typo, version drift), log a warning and continue — the server still connects with
  the tools it does have. _(Rationale: one stale name must not break a dispatch; matches the existing
  graceful-degradation posture.)_
- **D4 — Soft warn on a large aggregated tool set.** After aggregation, if the total tool count (built-ins
  - all MCP tools) exceeds a threshold (`LARGE_TOOL_SET_WARN = 40`), log a one-line warning pointing at the
    `tools` allowlist. No hard cap — the operator decides. _(Rationale: surfaces the choice-paralysis risk
    without silently changing behavior.)_

## Technical design

### Config

- `McpServerSpec` (in `packages/orchestrator/src/agent/backends/ollama.ts`, the `OllamaBackendDef` in
  `packages/types/src/orchestrator.ts`, and the `.strict()` ollama Zod variant in
  `packages/orchestrator/src/workflow/schema.ts`) gains `tools?: string[]`.
- `backend-factory.ts` needs no change (it threads `mcpServers` whole).

### Aggregation (`connectMcpServer`)

In the existing per-server tool loop, before namespacing/adding a tool:
`if (spec.tools !== undefined && !spec.tools.includes(tool.name)) continue;`
After the loop, if `spec.tools` is set, compute which requested names were never seen and
`console.warn` them once (D3). After all servers aggregate (end of `startSession`), if
`builtinCount + session.mcpTools.length > LARGE_TOOL_SET_WARN`, warn once (D4).

### Scaffolds

The commented `harness` example in `harness.orchestrator.md`, `harness.orchestrator.local.md`, and the two
`templates/orchestrator/*` copies gains a `tools:` line listing the read set (D2).

## Integration Points

- **Entry Points:** `tools` on the ollama backend def; the filter in `OllamaBackend.connectMcpServer`.
- **Registrations Required:** the `ollama` Zod variant gains `tools` on each `mcpServers` entry; scaffolds
  updated. No barrel/skill changes.
- **Documentation Updates:** `docs/guides/multi-backend-routing.md#mcp-tools` — document `tools` and the
  read-set default; a sentence on why (choice paralysis for local models).
- **Knowledge Impact:** concept — _MCP tool allowlist / curation_; relationship —
  `mcpServers[].tools → narrows → aggregated agent tools`.

## Success Criteria

- SC1: `tools` unset ⇒ all of a server's tools aggregated (byte-identical; existing ollama tests green).
- SC2: `tools: ['echo']` on an in-memory server exposing `echo` + `other` ⇒ only `<server>__echo` appears in
  the tool set. Unit test.
- SC3: `tools: ['echo','missing']` ⇒ `echo` aggregated, `missing` warned + skipped, `startSession`
  succeeds. Unit test.
- SC4: the four scaffolded configs' `harness` example lists the read-oriented `tools` set.
- SC5: an aggregated tool set larger than `LARGE_TOOL_SET_WARN` emits a single warning naming the count and
  pointing at `tools`. Unit test (inject a server exposing many tools).

## Implementation Order

- **Phase 1 — Allowlist + warnings.** `tools?: string[]` on def/schema/config; the filter + unknown-name
  warning + large-set warning in `connectMcpServer`/`startSession`; tests SC1–SC3, SC5.
- **Phase 2 — Curate + document.** Scaffold `tools` read-set (SC4) + guide note. SC4.
