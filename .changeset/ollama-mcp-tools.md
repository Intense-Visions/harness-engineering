---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

Give the local `ollama` backend agent access to MCP-server tools. The
`OllamaBackend` previously drove the model with only three built-in tools
(`bash`, `read_file`, `write_file`), so a local model coded from stale
training memory — in a live e2e it wrote a deprecated
`@typescript-eslint/utils` `RuleTester` import when the current API lives at
`@typescript-eslint/rule-tester`. A new opt-in `mcpServers?: McpServerSpec[]`
field on the ollama backend def (`{ name, command, args?, env?, cwd? }`) lets
the agent use tools from any configured MCP server alongside its built-ins.

- The backend hosts one in-process `@modelcontextprotocol/sdk` `Client` per
  configured server over `StdioClientTransport`, connected concurrently (with
  a bounded timeout) at session start and closed at session end.
- Each server's tools are merged into the model's tool set **namespaced** as
  `<server>__<tool>`; the MCP `inputSchema` passes through as the OpenAI
  function `parameters` unchanged, and a built-in name wins on collision.
- Tool calls forward to `client.callTool`, heartbeat-wrapped so a slow MCP
  call never trips the stall detector; an `isError` result is surfaced with an
  `ERROR:` prefix so the model can self-correct.
- **Graceful degradation:** a server that fails to connect or list is skipped
  with a warning — the session still runs on the built-ins plus every server
  that did start, so one flaky server never breaks a dispatch.
- `harness-mcp` (and any server without an explicit `cwd`) is spawned with
  `cwd =` the agent's workspace, so harness's own code-intelligence tools
  operate on the code the agent is editing.

With `mcpServers` unset the backend is byte-identical to before (built-ins
only). The scaffolded local configs ship a commented `context7` + `harness`
example; see `docs/guides/multi-backend-routing.md#mcp-tools` and ADR 0073.
