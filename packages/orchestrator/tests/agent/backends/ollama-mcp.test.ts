import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent, TurnResult } from '@harness-engineering/types';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  OllamaBackend,
  type OllamaBackendConfig,
  type OllamaSession,
  type McpToolDescriptor,
} from '../../../src/agent/backends/ollama';

const ECHO_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
};

/** Build a canned OpenAI-compatible chat response with optional tool calls. */
function chatResponse(opts: {
  content?: string;
  toolCalls?: Array<{ id: string; name: string; args: unknown }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}) {
  const message: Record<string, unknown> = { content: opts.content ?? '' };
  if (opts.toolCalls) {
    message.tool_calls = opts.toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: JSON.stringify(tc.args) },
    }));
  }
  return { choices: [{ message }], ...(opts.usage ? { usage: opts.usage } : {}) };
}

/** A `fetch` mock body that returns the given JSON with status 200. */
function okFetch(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Drain a runTurn generator, collecting events and the terminal TurnResult. */
async function drain(
  gen: AsyncGenerator<AgentEvent, TurnResult, void>
): Promise<{ events: AgentEvent[]; result: TurnResult }> {
  const events: AgentEvent[] = [];
  let next = await gen.next();
  while (!next.done) {
    events.push(next.value);
    next = await gen.next();
  }
  return { events, result: next.value };
}

/**
 * Stand up a linked in-memory MCP server exposing one `echo` tool + a connected
 * Client. `callTool` optionally delays to exercise the heartbeat path.
 */
async function makeLinkedServer(opts: { callDelayMs?: number } = {}): Promise<Client> {
  const server = new Server({ name: 'demo', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{ name: 'echo', description: 'echo text', inputSchema: ECHO_SCHEMA }],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (opts.callDelayMs && opts.callDelayMs > 0) {
      await new Promise((r) => setTimeout(r, opts.callDelayMs));
    }
    return {
      content: [{ type: 'text', text: `echoed:${String(req.params.arguments?.text ?? '')}` }],
    };
  });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
  await client.connect(clientT);
  return client;
}

/**
 * Stand up a linked in-memory MCP server exposing an arbitrary set of tools (each
 * carrying `ECHO_SCHEMA`), plus a connected Client. Used by the allowlist +
 * large-tool-set tests to control exactly which tools a server reports.
 */
async function makeMultiToolServer(toolNames: string[]): Promise<Client> {
  const server = new Server({ name: 'multi', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolNames.map((name) => ({
      name,
      description: `${name} tool`,
      inputSchema: ECHO_SCHEMA,
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => ({
    content: [{ type: 'text', text: `called:${String(req.params.name)}` }],
  }));
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
  await client.connect(clientT);
  return client;
}

/** connectMcp seam returning a server that exposes exactly `toolNames`. */
function multiToolConnect(toolNames: string[]): NonNullable<OllamaBackendConfig['connectMcp']> {
  return async (): Promise<{ client: Client; tools: McpToolDescriptor[] }> => {
    const client = await makeMultiToolServer(toolNames);
    const listed = await client.listTools();
    return {
      client,
      tools: listed.tools.map((t) => ({
        name: t.name,
        ...(t.description !== undefined ? { description: t.description } : {}),
        inputSchema: t.inputSchema as Record<string, unknown>,
      })),
    };
  };
}

/** connectMcp seam returning the linked in-memory client + its listTools result. */
function inMemoryConnect(opts: { callDelayMs?: number } = {}) {
  return async (): Promise<{ client: Client; tools: McpToolDescriptor[] }> => {
    const client = await makeLinkedServer(opts);
    const listed = await client.listTools();
    return {
      client,
      tools: listed.tools.map((t) => ({
        name: t.name,
        ...(t.description !== undefined ? { description: t.description } : {}),
        inputSchema: t.inputSchema as Record<string, unknown>,
      })),
    };
  };
}

const baseConfig: OllamaBackendConfig = {
  endpoint: 'http://127.0.0.1:11434/v1',
  model: 'qwen3-agent:32b',
};

describe('OllamaBackend — MCP tools', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'ollama-mcp-'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    rmSync(workspace, { recursive: true, force: true });
  });

  // SC2 — in-memory transport spawns NO process, so this is cross-platform (not skipped).
  it('exposes a configured server tool namespaced with its inputSchema unchanged (SC2)', async () => {
    const backend = new OllamaBackend({
      ...baseConfig,
      mcpServers: [{ name: 'demo', command: 'x' }],
      connectMcp: inMemoryConnect(),
    });
    const start = await backend.startSession({ workspacePath: workspace, permissionMode: 'full' });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const session = start.value as OllamaSession;
    expect(session.mcpTools).toHaveLength(1);
    const tool = session.mcpTools[0]!;
    expect(tool.function.name).toBe('demo__echo');
    expect(tool.function.parameters).toEqual(ECHO_SCHEMA);
  });

  // SC3 — a model tool_call for an MCP tool forwards to callTool; text result appended.
  it('forwards a model tool_call to callTool and appends the text result (SC3)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        okFetch(
          chatResponse({ toolCalls: [{ id: 'c1', name: 'demo__echo', args: { text: 'hi' } }] })
        )
      )
      .mockResolvedValueOnce(okFetch(chatResponse({ content: 'TASK_COMPLETE' })));
    vi.stubGlobal('fetch', fetchMock);

    const backend = new OllamaBackend({
      ...baseConfig,
      mcpServers: [{ name: 'demo', command: 'x' }],
      connectMcp: inMemoryConnect(),
    });
    const start = await backend.startSession({ workspacePath: workspace, permissionMode: 'full' });
    expect(start.ok).toBe(true);
    if (!start.ok) return;

    const { result } = await drain(
      backend.runTurn(start.value, {
        sessionId: start.value.sessionId,
        prompt: 'echo hi',
        isContinuation: false,
      })
    );
    expect(result.success).toBe(true);
    const session = start.value as OllamaSession;
    const toolMsg = session.messages.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.content).toBe('echoed:hi');
    expect(toolMsg!.tool_call_id).toBe('c1');
  });

  // SC4 — a server that fails to connect is skipped with a warning; startSession still ok.
  it.skipIf(process.platform === 'win32')(
    'skips a failing server with a warning and keeps built-ins usable (SC4)',
    async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const backend = new OllamaBackend({
        ...baseConfig,
        mcpServers: [{ name: 'broken', command: 'x' }],
        connectMcp: async () => {
          throw new Error('boom');
        },
      });
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      expect(start.ok).toBe(true);
      if (!start.ok) return;
      const session = start.value as OllamaSession;
      expect(session.mcpTools).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("skipping server 'broken'"));

      // A built-in bash tool call still works after a skipped server.
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          okFetch(
            chatResponse({ toolCalls: [{ id: 'b1', name: 'bash', args: { command: 'echo ok' } }] })
          )
        )
        .mockResolvedValueOnce(okFetch(chatResponse({ content: 'TASK_COMPLETE' })));
      vi.stubGlobal('fetch', fetchMock);
      const { result } = await drain(
        backend.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: 'run bash',
          isContinuation: false,
        })
      );
      expect(result.success).toBe(true);
      const bashMsg = session.messages.find((m) => m.role === 'tool' && m.tool_call_id === 'b1');
      expect(bashMsg?.content.trim()).toBe('ok');
    }
  );

  // SC5 — MCP tool calls emit tool_execution_start/end with the namespaced subtype,
  // and are heartbeat-wrapped so a slow call emits at least one heartbeat.
  it('emits namespaced start/end events for an MCP tool call (SC5)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        okFetch(
          chatResponse({ toolCalls: [{ id: 'c1', name: 'demo__echo', args: { text: 'hi' } }] })
        )
      )
      .mockResolvedValueOnce(okFetch(chatResponse({ content: 'TASK_COMPLETE' })));
    vi.stubGlobal('fetch', fetchMock);

    const backend = new OllamaBackend({
      ...baseConfig,
      mcpServers: [{ name: 'demo', command: 'x' }],
      connectMcp: inMemoryConnect(),
    });
    const start = await backend.startSession({ workspacePath: workspace, permissionMode: 'full' });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const { events } = await drain(
      backend.runTurn(start.value, {
        sessionId: start.value.sessionId,
        prompt: 'echo hi',
        isContinuation: false,
      })
    );
    const startEvt = events.find((e) => e.type === 'tool_execution_start');
    const endEvt = events.find((e) => e.type === 'tool_execution_end');
    expect(startEvt?.subtype).toBe('demo__echo');
    expect(endEvt?.subtype).toBe('demo__echo');
  });

  it('heartbeat-wraps a slow MCP call so it does not stall the dispatch (SC5)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        okFetch(
          chatResponse({ toolCalls: [{ id: 'c1', name: 'demo__echo', args: { text: 'hi' } }] })
        )
      )
      .mockResolvedValueOnce(okFetch(chatResponse({ content: 'TASK_COMPLETE' })));
    vi.stubGlobal('fetch', fetchMock);

    const backend = new OllamaBackend({
      ...baseConfig,
      heartbeatMs: 10,
      mcpServers: [{ name: 'demo', command: 'x' }],
      connectMcp: inMemoryConnect({ callDelayMs: 60 }),
    });
    const start = await backend.startSession({ workspacePath: workspace, permissionMode: 'full' });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const { events, result } = await drain(
      backend.runTurn(start.value, {
        sessionId: start.value.sessionId,
        prompt: 'echo hi',
        isContinuation: false,
      })
    );
    expect(result.success).toBe(true);
    const heartbeats = events.filter((e) => e.type === 'status' && e.subtype === 'heartbeat');
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);
  });

  // SC6 — a spec without cwd is connected with cwd = workspacePath; spec.cwd overrides.
  it('connects with cwd = workspacePath by default and honors a spec cwd override (SC6)', async () => {
    const seen: string[] = [];
    const spyConnect = (): OllamaBackendConfig['connectMcp'] => async (_spec, cwd) => {
      seen.push(cwd);
      const client = await makeLinkedServer();
      const listed = await client.listTools();
      return {
        client,
        tools: listed.tools.map((t) => ({
          name: t.name,
          ...(t.description !== undefined ? { description: t.description } : {}),
          inputSchema: t.inputSchema as Record<string, unknown>,
        })),
      };
    };

    const backend = new OllamaBackend({
      ...baseConfig,
      mcpServers: [
        { name: 'nocwd', command: 'x' },
        { name: 'custom', command: 'x', cwd: '/custom' },
      ],
      connectMcp: spyConnect(),
    });
    const start = await backend.startSession({ workspacePath: workspace, permissionMode: 'full' });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    expect(seen).toContain(workspace);
    expect(seen).toContain('/custom');
  });

  // SC1 — `tools` unset ⇒ every tool a server exposes is aggregated (byte-identical).
  it("aggregates all of a server's tools when `tools` is unset (SC1)", async () => {
    const backend = new OllamaBackend({
      ...baseConfig,
      mcpServers: [{ name: 'multi', command: 'x' }],
      connectMcp: multiToolConnect(['echo', 'other']),
    });
    const start = await backend.startSession({ workspacePath: workspace, permissionMode: 'full' });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const session = start.value as OllamaSession;
    const names = session.mcpTools.map((t) => t.function.name);
    expect(names).toEqual(['multi__echo', 'multi__other']);
  });

  // SC2 — `tools: ['echo']` narrows a server exposing echo+other to only echo.
  it('aggregates only allowlisted tools when `tools` is set (SC2)', async () => {
    const backend = new OllamaBackend({
      ...baseConfig,
      mcpServers: [{ name: 'multi', command: 'x', tools: ['echo'] }],
      connectMcp: multiToolConnect(['echo', 'other']),
    });
    const start = await backend.startSession({ workspacePath: workspace, permissionMode: 'full' });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const session = start.value as OllamaSession;
    const names = session.mcpTools.map((t) => t.function.name);
    expect(names).toEqual(['multi__echo']);
    expect(names).not.toContain('multi__other');
  });

  // SC3 — an allowlisted name the server doesn't expose is warned + skipped;
  // the tools it does have are still aggregated and startSession succeeds.
  it('warns and skips an unknown allowlisted tool name, session still ok (SC3)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backend = new OllamaBackend({
      ...baseConfig,
      mcpServers: [{ name: 'multi', command: 'x', tools: ['echo', 'missing'] }],
      connectMcp: multiToolConnect(['echo', 'other']),
    });
    const start = await backend.startSession({ workspacePath: workspace, permissionMode: 'full' });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const session = start.value as OllamaSession;
    expect(session.mcpTools.map((t) => t.function.name)).toEqual(['multi__echo']);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("server 'multi': requested tools not found: missing")
    );
  });

  // SC5 — a server exposing more than LARGE_TOOL_SET_WARN tools fires exactly one
  // large-tool-set advisory (built-ins + MCP tools exceed the threshold).
  it('fires exactly one large-tool-set warning past the threshold (SC5)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manyTools = Array.from({ length: 45 }, (_, i) => `tool${i}`);
    const backend = new OllamaBackend({
      ...baseConfig,
      mcpServers: [{ name: 'multi', command: 'x' }],
      connectMcp: multiToolConnect(manyTools),
    });
    const start = await backend.startSession({ workspacePath: workspace, permissionMode: 'full' });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const largeWarnings = warn.mock.calls.filter((c) =>
      String(c[0]).includes('aggregated tool set is large')
    );
    expect(largeWarnings).toHaveLength(1);
    expect(String(largeWarnings[0]![0])).toContain('48 tools'); // 3 built-ins + 45 MCP
  });
});
