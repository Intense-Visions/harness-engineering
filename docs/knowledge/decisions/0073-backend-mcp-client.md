---
number: 0073
title: A harness backend consumes MCP via an in-process client per server
date: 2026-07-16
status: accepted
tier: medium
source: docs/changes/ollama-mcp-tools/proposal.md
---

## Context

The local `OllamaBackend` agent (`packages/orchestrator/src/agent/backends/ollama.ts`) shipped with only three built-in tools — `bash`, `read_file`, `write_file` — so it coded from the model's stale training memory. In a live end-to-end run it wrote a **deprecated** `@typescript-eslint/utils` `RuleTester` import; the current API lives at `@typescript-eslint/rule-tester`, and a context7 lookup returns exactly that. The local model had no way to self-correct against live library docs or to introspect the code it was editing.

The cloud backends do not have this gap. Claude and Codex already consume MCP natively — the driver process hosts the MCP clients for them. The local `OllamaBackend`, which drives the model directly over the OpenAI-compatible `/v1` API, had no such bridge. Giving the local agent tools from MCP servers is the highest-leverage capability lever for local-model success, so the backend itself needs to host MCP.

The question was **how** a harness _backend_ should consume MCP. Three shapes were considered:

1. **In-process MCP `Client` per configured server.** The backend hosts one `@modelcontextprotocol/sdk` `Client` per server over `StdioClientTransport`, in the same process as the dispatch.
2. **A standalone MCP proxy process.** A separate long-lived process aggregates the servers and the backend talks to it over IPC.
3. **Per-call shelling to an MCP CLI.** Spawn an MCP CLI invocation for each tool call.

## Decision

A harness _backend_ consumes MCP by hosting an **in-process `@modelcontextprotocol/sdk` `Client` per configured server**, over `StdioClientTransport`. Each configured server's client is:

- **Connected at `startSession`** — `client.connect(transport)` then `client.listTools()`, run concurrently across servers with a bounded timeout.
- **Merged (namespaced) into the model's tool set** — each server's tools are exposed to the model as `<server>__<tool>` alongside the three built-ins, its MCP `inputSchema` passed through as the OpenAI function `parameters` unchanged, and a built-in name wins on collision.
- **Forwarded via `callTool`** — when the model calls a namespaced MCP tool, the backend looks it up and forwards to `client.callTool({ name, arguments })`, extracts the text result, and appends it as the `tool` message. The call is heartbeat-wrapped so a slow MCP call never trips the stall detector.
- **Closed at `stopSession`** — best-effort `client.close()` for every connected client, errors swallowed.

Servers are declared explicitly on the backend def via an `mcpServers?: McpServerSpec[]` allowlist (`McpServerSpec = { name, command, args?, env?, cwd? }`); default-unset means built-ins only, byte-identical to prior behavior. `harness-mcp` — and any spec without an explicit `cwd` — is spawned with `cwd =` the session's `workspacePath`, so harness's code-intelligence tools operate on the code the agent is editing rather than the daemon's repo.

**Option 2 (standalone MCP proxy process) was rejected:** it adds a separate process lifecycle to supervise and an IPC hop, for no benefit at single-backend scope — the SDK is designed to be hosted in-process, and the backend already owns the session lifecycle the clients hang off.

**Option 3 (per-call shelling to an MCP CLI) was rejected:** spawning per tool call is slow and discards session reuse — the MCP handshake and `listTools` would repeat on every call, and there is no place to hold the connected client between calls.

## Consequences

**Positive:**

- Establishes the pattern for how a harness _backend consumes_ MCP — distinct from how harness _exposes_ its own MCP server via the `harness-mcp` bin. The two directions are now clearly separated: a backend hosts clients; the CLI hosts a server.
- The opt-in per-backend `mcpServers` allowlist keeps the surface safe: only explicitly listed servers connect, so there is no auto-discovery and no implicit network/write capability.
- Graceful degradation is structural: a server that fails to connect or list is skipped with a warning, so one bad server can never break a dispatch — the session runs on built-ins plus whatever did start.
- The local model gets the same tool leverage a cloud driver gets from native MCP, letting it self-correct against live docs (context7) and introspect its own workspace (harness-mcp).

**Negative:**

- The backend now owns MCP client lifecycle (connect, list, forward, close) — new surface in `OllamaBackend` and a new `@modelcontextprotocol/sdk` dependency on the orchestrator package.
- In-process clients share the dispatch process's resources; a misbehaving server (e.g., a runaway stdio child) is bounded only by the connect timeout and the process's own limits.

**Neutral:**

- With `mcpServers` unset or empty, `OllamaBackend` is byte-identical to its prior behavior (built-ins only) — the existing ollama tests stay green.
- The pattern is currently scoped to the `ollama` backend only; the cloud backends keep their native MCP path, and non-ollama backends are out of scope (a later spec generalizes the suggested-server catalog).

## Related

- [`docs/changes/ollama-mcp-tools/proposal.md`](../../changes/ollama-mcp-tools/proposal.md) — the spec (decision D1)
- [`docs/guides/multi-backend-routing.md`](../../guides/multi-backend-routing.md#mcp-tools) — operator guide for `mcpServers` on the local agent
- [ADR 0070: Harness-enforced local gates](./0070-harness-enforced-local-gates.md) — the local dispatch path this capability extends
