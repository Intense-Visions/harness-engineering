---
title: MCP tools for the OllamaBackend agent
status: draft
keywords: ollama-backend, mcp, model-context-protocol, agent-tools, context7, harness-mcp, tool-aggregation, local-dispatch
---

# MCP tools for the OllamaBackend agent

## Overview & Goals

The local `OllamaBackend` agent (`packages/orchestrator/src/agent/backends/ollama.ts`) has only three
built-in tools — `bash`, `read_file`, `write_file` — so it codes from the model's stale training memory.
In live e2e it wrote a **deprecated** `@typescript-eslint/utils` `RuleTester` import; context7 returns the
**current** `@typescript-eslint/rule-tester` API. A doc/tool bridge lets the agent self-correct for any
library.

**Goal:** let the OllamaBackend agent use tools from configured MCP servers — **context7** (live docs) and
**harness's own MCP** (`code_search`, `ask_graph`, `review_changes`, `outcome_eval`) — alongside its
built-ins, so a local model gets the same tool leverage a cloud driver gets from MCP. This is the
highest-leverage capability lever for local-model success (advances the Agent-Autonomy track).

**Non-goals (YAGNI):** wiring the full suggested-server catalog (generalize later — roadmap
`mcp-catalog-refresh`); MCP for non-ollama backends (Claude/Codex have native MCP); any UI; refreshing
_which_ servers are suggested (roadmap `mcp-catalog-refresh`); auto-discovery of servers.

## Decisions made

- **D1 — In-process MCP `Client` per configured server.** Each server gets an `@modelcontextprotocol/sdk`
  `Client` over `StdioClientTransport`, connected at `startSession`, its tools merged into the model's
  tool set, calls forwarded via `callTool`, closed at `stopSession`. _(Rationale: native SDK, in-process,
  simplest lifecycle; no proxy process or per-call shelling.)_
- **D2 — Explicit `mcpServers` allowlist on the backend def.** `mcpServers?: { name, command, args?, env?,
cwd? }[]`. Default empty ⇒ behavior byte-identical to today. No auto-discovery — only listed servers
  connect. _(Rationale: predictable, safe, opt-in.)_
- **D3 — MVP wires context7 + harness (read-oriented), explicit-only.** context7 (read-only docs) + the
  harness MCP (`code_search`/`ask_graph`/`review_changes`/`outcome_eval`); write/network-heavy servers stay
  opt-in via the same allowlist. _(Rationale: the read set is where the capability win is; security by
  explicit listing.)_
- **D4 — harness MCP runs against the agent's workspace.** Spawn `harness-mcp` with `cwd = workspacePath`
  (the git-worktree the agent edits) so its code-intelligence tools operate on the agent's code, not the
  daemon's repo. Per-server `cwd` override defaults to the session `workspacePath`. _(Rationale: the agent
  must introspect what it is building.)_
- **D5 — Namespaced tools, direct schema passthrough.** Tools exposed as `<server>__<tool>` (sanitized to
  `[A-Za-z0-9_-]`); MCP `inputSchema` becomes the OpenAI function `parameters` unchanged; a built-in name
  wins on collision. _(Rationale: no collisions, no schema translation risk.)_
- **D6 — Graceful degradation + heartbeat.** A server that fails to connect or list is skipped with a
  warning; the session still runs on built-ins + working servers. `callTool` is wrapped by the existing
  heartbeat so a slow MCP call doesn't trip the stall detector. All clients close on `stopSession`.
  _(Rationale: one flaky server must never break a dispatch.)_

## Technical design

### Config

- `OllamaBackendConfig` (ollama.ts) + `OllamaBackendDef` (types/orchestrator.ts) + the `ollama` Zod variant
  (workflow/schema.ts) gain `mcpServers?: McpServerSpec[]` where
  `McpServerSpec = { name: string; command: string; args?: string[]; env?: Record<string,string>; cwd?: string }`.
- `backend-factory.ts` `createOllamaBackend` threads `mcpServers` through (conditional-spread,
  exactOptionalPropertyTypes).
- `@modelcontextprotocol/sdk` (`^1.29.0`, matching cli) added to `packages/orchestrator/package.json`.

### Connection + aggregation (startSession)

For each `mcpServers[i]`: create `new Client({name,version},{capabilities:{}})` + `StdioClientTransport({
command, args, env, cwd: spec.cwd ?? workspacePath })`, `await client.connect(transport)`,
`await client.listTools()`. Build a `mcpTools: OpenAITool[]` list (namespaced) and a
`mcpToolMap: Map<namespacedName, { client, toolName }>`, both stored on the `OllamaSession`. A connect/list
failure logs a warning and is skipped (no throw). Servers are connected concurrently with a bounded timeout.

### Execution (runTurn)

The tool set sent to the model = the 3 built-ins ++ `session.mcpTools`. On a tool call: built-in →
existing path; else look up `mcpToolMap` → `yield* withHeartbeat(client.callTool({ name: toolName,
arguments }), …)`, extract text from `result.content` (join `type:'text'` blocks), truncate, append as the
`tool` message. Unknown tool → error string (existing behavior). `tool_execution_start/end` events fire with
the namespaced name as `subtype`.

### Lifecycle (stopSession)

Best-effort `await client.close()` for every connected client; swallow errors.

### Testing seam

Tests use the SDK's `InMemoryTransport.createLinkedPair()` with a tiny in-process MCP `Server` exposing one
tool, injected via a seam (an optional `connectMcp` factory on the config, defaulting to the real
stdio path) so no external process spawns in unit tests — mirroring the `verifyRunner`/`diffRunner` seams.

## Integration Points

- **Entry Points:** `mcpServers` on the ollama backend def; new MCP client/aggregation code paths in
  `OllamaBackend.startSession`/`runTurn`/`stopSession`.
- **Registrations Required:** `@modelcontextprotocol/sdk` dep on orchestrator; the `ollama` Zod schema
  variant gains `mcpServers`; scaffolded configs (`harness.orchestrator.md`, `harness.config.json`,
  templates) gain a commented `mcpServers` example (context7 + harness). No barrel/skill changes.
- **Documentation Updates:** `docs/guides/multi-backend-routing.md` (local agent can use MCP tools);
  AGENTS.md orchestrator note.
- **Architectural Decisions:** **D1 (in-process MCP client in the backend)** warrants an ADR — it
  establishes how a harness _backend_ consumes MCP (vs. only exposing an MCP server).
- **Knowledge Impact:** concepts — _backend MCP client_, _agent tool aggregation_, _MCP tool namespacing_;
  relationship — `OllamaBackend agent → uses → MCP-server tools`.

## Success Criteria

- SC1: With `mcpServers` unset/empty, OllamaBackend is byte-identical to today (built-ins only) — existing
  20 ollama tests stay green.
- SC2: With a server configured (in-memory transport), its tools appear **namespaced** (`<server>__<tool>`)
  in the tool set sent to the model. Unit test on the tools array.
- SC3: A model `tool_call` for an MCP tool forwards to `client.callTool` and the text result is appended to
  the conversation as a `tool` message. Unit test with an in-memory MCP server.
- SC4: A server that fails to connect is **skipped with a warning**; `startSession` still succeeds and
  built-ins + other servers work. Unit test with a bad spec.
- SC5: MCP tool calls emit `tool_execution_start/end` and are heartbeat-wrapped (no stall on a slow call).
  Unit test.
- SC6: `harness-mcp` (and any spec without `cwd`) is spawned with `cwd = workspacePath`. Unit/assertion test.
- SC7: Scaffolded config wires context7 + harness; documented. (Live agent-uses-context7 is a manual/e2e
  check, not a blocking unit test.)

## Implementation Order

- **Phase 1 — MCP client core.** Config field (def/schema/factory) + SDK dep; connect/listTools/aggregate;
  namespacing + schema passthrough; `callTool` execution + heartbeat + events; graceful degradation; close
  on stopSession; the `connectMcp` test seam. Tests SC1–SC6. (This is the whole engine.)
- **Phase 2 — Wire + document.** Scaffolded config example (context7 + harness), guide + AGENTS.md note,
  ADR for D1, `harness validate`. SC7.
