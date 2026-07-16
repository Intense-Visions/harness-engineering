import { randomUUID } from 'node:crypto';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  AgentBackend,
  SessionStartParams,
  AgentSession,
  TurnParams,
  AgentEvent,
  TurnResult,
  Result,
  Ok,
  Err,
  AgentError,
} from '@harness-engineering/types';
import type { McpServerSpec } from '@harness-engineering/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/**
 * Configuration for {@link OllamaBackend}. Mirrors the shape of
 * {@link import('./pi.js').PiBackendConfig} so a caller can point either backend
 * at the same local endpoint. Unlike pi (which embeds the pi-coding-agent SDK),
 * this backend owns its `/v1/chat/completions` tool loop.
 */
export interface OllamaBackendConfig {
  /** Ollama OpenAI-compatible base URL. Default: `http://127.0.0.1:11434/v1`. */
  endpoint?: string | undefined;
  /**
   * Model name(s). A bare string resolves to itself; an array resolves to its
   * head (prefer-fallback — richer probe-aware resolution lives in Spec 1).
   */
  model?: string | string[] | undefined;
  /** API key threaded as `Authorization: Bearer`. Ollama ignores it. */
  apiKey?: string | undefined;
  /**
   * Per-request timeout in ms for each chat-completion HTTP call. Default:
   * 600_000. Enforced by an AbortController on `fetch`. `<= 0` disables it.
   */
  timeoutMs?: number | undefined;
  /**
   * Maximum inner agentic-loop iterations per `runTurn` before the loop bails
   * with a failed turn. Default: 50.
   */
  maxTurnsPerRun?: number | undefined;
  /**
   * Interval (ms) between heartbeat `status` events emitted while awaiting a
   * slow model call or tool execution, so the orchestrator's stall detector does
   * not abort a legitimately-busy dispatch. Default 30_000; `<= 0` disables.
   */
  heartbeatMs?: number | undefined;
  /**
   * Max wall-clock (ms) for a single `bash` tool call before its process tree is
   * SIGKILLed. Default 300_000. Prevents a hung/interactive command (which runs
   * with stdin=/dev/null) from stalling the dispatch indefinitely.
   */
  bashTimeoutMs?: number | undefined;
  /**
   * When true, append ` /no_think` to each user turn so reasoning models
   * (Qwen3 family) skip `<think>` traces — Ollama's `/v1` endpoint ignores the
   * `reasoning:false` knob, so the `/no_think` token in the last user message is
   * the only reliable off-switch. Without it a reasoning model burns its output
   * budget thinking and never emits a tool call. Default: false (harmless text
   * for non-reasoning models, but only append when you know the model reasons).
   */
  disableReasoning?: boolean | undefined;
  /**
   * Called with the resolved model name after a turn completes successfully.
   * Bound by the orchestrator to `pool.markUsed` (LRU) + the resolver's
   * circuit-breaker success path. Best-effort — a throwing hook never breaks a
   * good turn.
   */
  onModelUsed?: ((model: string) => void) | undefined;
  /**
   * Called with the resolved model name when a turn fails (HTTP error or
   * timeout). Bound to the resolver's circuit breaker so a repeatedly-failing
   * model is deprioritized. Best-effort.
   */
  onModelFailed?: ((model: string) => void) | undefined;
  /**
   * MCP servers whose tools are merged into the model's tool set. Absent/empty
   * ⇒ built-ins only (byte-identical to today).
   */
  mcpServers?: McpServerSpec[] | undefined;
  /**
   * Test seam: factory that connects one MCP server and returns a live SDK
   * Client (mirrors the `verifyRunner`/`diffRunner` seams). Defaults to the real
   * stdio path. Unit tests inject an in-memory-transport variant so no external
   * process spawns. Receives the resolved `cwd` (spec.cwd ?? workspacePath).
   */
  connectMcp?:
    | ((
        spec: McpServerSpec,
        cwd: string
      ) => Promise<{ client: Client; tools: McpToolDescriptor[] }>)
    | undefined;
}

/** OpenAI function-tool schema shape — covers both built-ins and MCP-derived tools. */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

/** A tool as reported by an MCP server's `listTools`. */
export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** An OpenAI-shaped chat message carried on the session's conversation state. */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/** A native OpenAI `tool_calls[]` entry as returned by Ollama's chat endpoint. */
interface ToolCall {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
}

export interface OllamaSession extends AgentSession {
  /** Conversation state, seeded with the system prompt at `startSession`. */
  messages: ChatMessage[];
  /** Set by `stopSession`; checked between loop iterations to bail early. */
  aborted: boolean;
  /** The in-flight per-call AbortController, so `stopSession` can cancel fetch. */
  activeController: AbortController | null;
  /** Model name resolved at session start (head-of-array or the string). */
  resolvedModel: string;
  /** Namespaced MCP tools (`<server>__<tool>`) merged into the model tool set. */
  mcpTools: OpenAITool[];
  /** Namespaced tool name → the client + original tool name to forward to. */
  mcpToolMap: Map<string, { client: Client; toolName: string }>;
  /** Live MCP clients to close at `stopSession`. */
  mcpClients: Client[];
}

/** Max characters returned from a tool result before truncation. */
const MAX_TOOL_OUTPUT = 4000;

const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434/v1';
const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_TURNS = 50;
/**
 * How often to emit a heartbeat `status` event while awaiting a slow model call
 * or tool execution. The orchestrator's stall detector resets on ANY agent
 * event, so heartbeats keep a legitimately-busy dispatch alive (e.g. the agent
 * running `pnpm test`) while a truly-hung backend — which emits none — is still
 * caught. Must be shorter than the operator's `stallTimeoutMs`.
 */
const DEFAULT_HEARTBEAT_MS = 30_000;
/** Max wall-clock for a single `bash` tool call before the process TREE is SIGKILLed. */
const DEFAULT_BASH_TIMEOUT_MS = 300_000;
/** Bounded wall-clock (ms) for a single MCP server connect+listTools. */
const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 15_000;

/**
 * The distinctive completion marker the model must emit — on its own line, with
 * no tool call — to signal the task is fully done. Matched as a whole token
 * (word boundaries) so an incidental mention in prose (e.g. `TASK_COMPLETED`)
 * does not falsely end the run. Returning a no-tool-call message WITHOUT this
 * marker is treated as a premature stop (failed turn → the runner re-prompts).
 */
const TASK_COMPLETE_MARKER = /\bTASK_COMPLETE\b/;

/** Default coding-agent system prompt when the caller supplies none. */
const DEFAULT_SYSTEM_PROMPT = [
  'You are an autonomous coding agent working inside a git repository.',
  'Use the provided tools to explore and edit the codebase. Work in small steps:',
  'read before you write, implement, then run the test/verify command.',
  'Do not claim work you have not performed via a tool.',
  'Keep using tools until the task is FULLY implemented AND verified.',
  'Do NOT stop to explain your work or to ask questions.',
  'Only when everything is done and the verification command passes,',
  'reply with exactly TASK_COMPLETE on its own line and make no tool call.',
  'If you stop for any other reason you will be told to continue.',
].join(' ');

/** OpenAI function-tool schemas for the three tools this backend exposes. */
const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Run a shell command in the workspace root and get stdout+stderr.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write (create/overwrite) a file, relative to the workspace root.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: "Read a file's contents, relative to the workspace root.",
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
] as const;

/** Resolve `model` (string | string[]) to a single model name (head-of-array). */
function resolveModelName(model: string | string[] | undefined): string | null {
  if (typeof model === 'string') return model.length > 0 ? model : null;
  if (Array.isArray(model) && model.length > 0) return model[0] ?? null;
  return null;
}

/** Coerce a JSON-parsed tool argument to a string, defaulting to `''`. */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Truncate a tool result to keep the conversation from ballooning. */
function truncate(text: string): string {
  if (text.length <= MAX_TOOL_OUTPUT) return text;
  return `${text.slice(0, MAX_TOOL_OUTPUT)}\n…(truncated)`;
}

/**
 * Resolve a tool-supplied relative path against the workspace root and reject
 * traversal that escapes it. Returns the absolute path, or `null` when the
 * resolved path lands outside `workspacePath` (e.g. `../../etc/passwd`).
 */
function resolveInsideWorkspace(workspacePath: string, requested: string): string | null {
  const root = path.resolve(workspacePath);
  const resolved = path.resolve(root, requested);
  const rel = path.relative(root, resolved).replaceAll('\\', '/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

/** Sanitize a segment to `[A-Za-z0-9_-]` for use in a namespaced tool name. */
function sanitizeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, '_');
}

/**
 * Default MCP connector: spawn the server over stdio, connect, and list its
 * tools. Injectable via `OllamaBackendConfig.connectMcp` for tests.
 */
async function defaultConnectMcp(
  spec: McpServerSpec,
  cwd: string
): Promise<{ client: Client; tools: McpToolDescriptor[] }> {
  const client = new Client(
    { name: `ollama-mcp-${spec.name}`, version: '1.0.0' },
    { capabilities: {} }
  );
  const transport: Transport = new StdioClientTransport({
    command: spec.command,
    ...(spec.args !== undefined ? { args: spec.args } : {}),
    ...(spec.env !== undefined ? { env: spec.env } : {}),
    cwd,
  });
  await client.connect(transport);
  const listed = await client.listTools();
  const tools: McpToolDescriptor[] = listed.tools.map((t) => ({
    name: t.name,
    ...(t.description !== undefined ? { description: t.description } : {}),
    inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
  }));
  return { client, tools };
}

/**
 * Join the `type:'text'` blocks of an MCP callTool result into one string. The
 * SDK reports a tool-level failure as `{ isError: true, content: [...] }` (it
 * does NOT throw for those), so surface it with the same `ERROR:` prefix the
 * built-ins use — otherwise a failed MCP call looks identical to a clean result
 * and the model never learns to self-correct.
 */
function extractMcpText(res: unknown): string {
  const r = res as { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
  const content = r?.content ?? [];
  const text = content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n');
  const body = text.length > 0 ? text : '(no output)';
  return r?.isError === true ? `ERROR: ${body}` : body;
}

/** Reject with a labeled timeout error if `p` does not settle within `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    );
  });
}

/**
 * Native Ollama agentic backend. Owns its `/v1/chat/completions` tool loop:
 * `startSession` seeds conversation state, `runTurn` drives the inner loop
 * (call model → execute native `tool_calls` → append results → repeat until the
 * model returns no tool call), and `stopSession` aborts an in-flight turn.
 *
 * The pi/codex SDKs return empty completions / reject tool calls against
 * Ollama-served tool-calling models; this harness-owned driver drives the same
 * model correctly. Proven by the standalone prototype it productionizes.
 */
export class OllamaBackend implements AgentBackend {
  readonly name = 'ollama';
  private config: OllamaBackendConfig;
  readonly endpoint: string;
  readonly timeoutMs: number;
  readonly maxTurnsPerRun: number;
  readonly heartbeatMs: number;
  readonly bashTimeoutMs: number;

  constructor(config: OllamaBackendConfig = {}) {
    this.config = config;
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxTurnsPerRun = config.maxTurnsPerRun ?? DEFAULT_MAX_TURNS;
    this.heartbeatMs = config.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
    this.bashTimeoutMs = config.bashTimeoutMs ?? DEFAULT_BASH_TIMEOUT_MS;
  }

  /**
   * Yield a `status`/`heartbeat` event every `heartbeatMs` while `work` is
   * pending, then return its resolved value (or rethrow). Keeps the stall
   * detector from aborting a dispatch that is legitimately busy inside a slow
   * model call or tool execution (both are `await`s that otherwise emit nothing).
   * `heartbeatMs <= 0` disables heartbeats (awaits `work` directly).
   */
  private async *withHeartbeat<T>(
    work: Promise<T>,
    sessionId: string,
    label: string
  ): AsyncGenerator<AgentEvent, T, void> {
    if (this.heartbeatMs <= 0) return await work;
    let done = false;
    const settled = work.then(
      () => {
        done = true;
      },
      () => {
        done = true;
      }
    );
    while (!done) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = new Promise<'tick'>((resolve) => {
        timer = setTimeout(() => resolve('tick'), this.heartbeatMs);
      });
      const winner = await Promise.race([settled.then(() => 'done' as const), tick]);
      if (timer !== undefined) clearTimeout(timer);
      if (winner === 'tick' && !done) {
        yield {
          type: 'status',
          subtype: 'heartbeat',
          timestamp: new Date().toISOString(),
          sessionId,
          content: `working: ${label}`,
        };
      }
    }
    // `work` has settled; return its value or rethrow its rejection.
    return await work;
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    const resolvedModel = resolveModelName(this.config.model);
    if (resolvedModel === null) {
      return Err({
        category: 'agent_not_found',
        message: 'No Ollama model configured; set `model` on the backend def.',
      });
    }

    const systemPrompt = params.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const session: OllamaSession = {
      sessionId: randomUUID(),
      workspacePath: params.workspacePath,
      backendName: this.name,
      startedAt: new Date().toISOString(),
      messages: [{ role: 'system', content: systemPrompt }],
      aborted: false,
      activeController: null,
      resolvedModel,
      mcpTools: [],
      mcpToolMap: new Map(),
      mcpClients: [],
    };

    const specs = this.config.mcpServers ?? [];
    const connect = this.config.connectMcp ?? defaultConnectMcp;
    await Promise.all(
      specs.map(async (spec) => {
        const cwd = spec.cwd ?? params.workspacePath;
        // Keep the underlying connect promise so a server that resolves AFTER
        // the timeout can still be closed — otherwise its live client (a spawned
        // subprocess) is orphaned and never torn down at stopSession.
        const connecting = connect(spec, cwd);
        try {
          const { client, tools } = await withTimeout(
            connecting,
            DEFAULT_MCP_CONNECT_TIMEOUT_MS,
            `MCP connect '${spec.name}'`
          );
          session.mcpClients.push(client);
          const nsPrefix = sanitizeSegment(spec.name);
          for (const tool of tools) {
            const namespaced = `${nsPrefix}__${sanitizeSegment(tool.name)}`;
            if (session.mcpToolMap.has(namespaced)) continue;
            session.mcpTools.push({
              type: 'function',
              function: {
                name: namespaced,
                ...(tool.description !== undefined ? { description: tool.description } : {}),
                parameters: tool.inputSchema,
              },
            });
            session.mcpToolMap.set(namespaced, { client, toolName: tool.name });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[ollama-mcp] skipping server '${spec.name}': ${msg}`);
          // The connect may still be in flight (timeout, not a real rejection).
          // If it later succeeds, close the orphaned client so no subprocess leaks.
          void connecting.then(
            (late) => {
              void late.client.close().catch(() => {});
            },
            () => {}
          );
        }
      })
    );

    return Ok(session);
  }

  async *runTurn(
    session: AgentSession,
    params: TurnParams
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    const ollamaSession = session as OllamaSession;
    ollamaSession.aborted = false;
    // `/no_think` disables Qwen3 reasoning; it must ride the LAST user message
    // (the inner loop appends only `tool` messages after this, so it stays last).
    const userContent = this.config.disableReasoning ? `${params.prompt} /no_think` : params.prompt;
    ollamaSession.messages.push({ role: 'user', content: userContent });

    let inputTokens = 0;
    let outputTokens = 0;

    const fail = (error: string): TurnResult => {
      this.notify(this.config.onModelFailed, ollamaSession.resolvedModel);
      return {
        success: false,
        sessionId: session.sessionId,
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        error,
      };
    };

    for (let iter = 0; iter < this.maxTurnsPerRun; iter++) {
      if (ollamaSession.aborted) {
        return fail('Ollama turn aborted by stopSession');
      }

      let response: OllamaChatResponse;
      try {
        response = yield* this.withHeartbeat(
          this.callModel(ollamaSession),
          session.sessionId,
          'model'
        );
      } catch (err) {
        if (ollamaSession.aborted) return fail('Ollama turn aborted by stopSession');
        const message = err instanceof Error ? err.message : String(err);
        yield this.errorEvent(session.sessionId, message);
        return fail(message);
      }

      const message = response.choices[0]?.message;
      if (!message) {
        return fail('Ollama response contained no message');
      }

      // Accumulate usage and surface it on a yielded event so the orchestrator
      // state machine (which reads `event.usage`, not TurnResult.usage) advances
      // session totals + rate-limit windows.
      if (response.usage) {
        inputTokens += response.usage.prompt_tokens ?? 0;
        outputTokens += response.usage.completion_tokens ?? 0;
        yield {
          type: 'usage',
          timestamp: new Date().toISOString(),
          sessionId: session.sessionId,
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
        };
      }

      const toolCalls = message.tool_calls ?? [];

      // Append the assistant turn (with its tool_calls, if any) to the
      // conversation before executing tools, mirroring the OpenAI protocol.
      ollamaSession.messages.push({
        role: 'assistant',
        content: message.content ?? '',
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });

      // No tool calls → the model stopped calling tools. This is a clean, done
      // turn ONLY when the final message signals completion via TASK_COMPLETE;
      // otherwise the model stopped prematurely (explained, asked a question, or
      // gave up) and we must NOT end the workflow. Returning success:false makes
      // the orchestrator runner re-prompt ("Continue your work.") so the model
      // keeps going instead of a premature stop being marked done.
      if (toolCalls.length === 0) {
        const finalText = message.content ?? '';
        if (TASK_COMPLETE_MARKER.test(finalText)) {
          this.notify(this.config.onModelUsed, ollamaSession.resolvedModel);
          return {
            success: true,
            sessionId: session.sessionId,
            usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
          };
        }
        return fail('agent stopped without signaling completion (no TASK_COMPLETE)');
      }

      for (const toolCall of toolCalls) {
        const name = toolCall.function.name;
        const argsJson = toolCall.function.arguments;
        yield {
          type: 'tool_execution_start',
          subtype: name,
          timestamp: new Date().toISOString(),
          sessionId: session.sessionId,
          content: `Calling ${name}(${argsJson})`,
        };

        const isBuiltin = name === 'bash' || name === 'write_file' || name === 'read_file';
        const mcpEntry = isBuiltin ? undefined : ollamaSession.mcpToolMap.get(name);

        let result: string;
        if (mcpEntry) {
          let args: Record<string, unknown> | null;
          try {
            args = JSON.parse(argsJson) as Record<string, unknown>;
          } catch {
            // Mirror the built-in path: a malformed arguments blob is a real
            // failure the model must see — do not silently forward empty args.
            args = null;
          }
          if (args === null) {
            result = `ERROR: could not parse arguments for ${name}: ${argsJson}`;
          } else {
            try {
              const callRes = yield* this.withHeartbeat(
                mcpEntry.client.callTool({ name: mcpEntry.toolName, arguments: args }),
                session.sessionId,
                name
              );
              result = truncate(extractMcpText(callRes));
            } catch (err) {
              result = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
            }
          }
        } else {
          result = yield* this.withHeartbeat(
            this.executeTool(ollamaSession, name, argsJson),
            session.sessionId,
            name
          );
        }

        yield {
          type: 'tool_execution_end',
          subtype: name,
          timestamp: new Date().toISOString(),
          sessionId: session.sessionId,
          content: truncate(result),
        };

        ollamaSession.messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: truncate(result),
        });
      }
    }

    return fail(`Ollama turn exceeded maxTurnsPerRun (${this.maxTurnsPerRun})`);
  }

  /** POST the current conversation + tool schemas and return the parsed response. */
  private async callModel(session: OllamaSession): Promise<OllamaChatResponse> {
    const controller = new AbortController();
    session.activeController = controller;

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    if (this.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey !== undefined) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    try {
      const res = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: session.resolvedModel,
          messages: session.messages,
          tools: [...(TOOL_SCHEMAS as unknown as OpenAITool[]), ...session.mcpTools],
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Ollama HTTP ${res.status} ${res.statusText}: ${truncate(body)}`);
      }

      return (await res.json()) as OllamaChatResponse;
    } catch (err) {
      if (controller.signal.aborted && !session.aborted) {
        throw new Error(`Ollama request timed out after ${this.timeoutMs}ms`, { cause: err });
      }
      throw err;
    } finally {
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
      session.activeController = null;
    }
  }

  /** Dispatch a single tool call. Never throws — returns an error string instead. */
  private async executeTool(
    session: OllamaSession,
    name: string,
    argsJson: string
  ): Promise<string> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      return `ERROR: could not parse arguments for ${name}: ${argsJson}`;
    }

    try {
      switch (name) {
        case 'bash':
          return await this.runBash(session.workspacePath, asString(args.command));
        case 'write_file':
          return await this.runWriteFile(
            session.workspacePath,
            asString(args.path),
            asString(args.content)
          );
        case 'read_file':
          return await this.runReadFile(session.workspacePath, asString(args.path));
        default:
          return `ERROR: unknown tool ${name}`;
      }
    } catch (err) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /**
   * Run a shell command via `execFile('/bin/sh', ['-c', command])` in the
   * workspace. Using execFile (not exec-with-interpolation) keeps the command
   * a single opaque argv entry — no shell metacharacter injection beyond the
   * command the model already authored — satisfying `no-unix-shell-command`.
   */
  private runBash(workspacePath: string, command: string): Promise<string> {
    const CAP = 10 * 1024 * 1024;
    return new Promise((resolve) => {
      // stdin: 'ignore' (=/dev/null) so an interactive command (e.g.
      // `pnpm changeset`) reads EOF and exits fast instead of blocking forever —
      // the agent must never be able to hang the dispatch on a stdin prompt.
      // detached: own process group so the timeout can SIGKILL the WHOLE tree
      // (execFile's SIGTERM only hit /bin/sh, letting node grandchildren survive).
      // `detached` (own process group) is a POSIX concept used so the timeout
      // can SIGKILL the whole tree via `process.kill(-pid)`. Windows has no
      // process groups here, so keep it attached and fall back to `child.kill`.
      const isPosix = process.platform !== 'win32';
      const child = childProcess.spawn('/bin/sh', ['-c', command], {
        cwd: workspacePath,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: isPosix,
      });
      let out = '';
      let killed = false;
      const onData = (buf: Buffer): void => {
        if (out.length < CAP) out += buf.toString('utf8');
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      const timer = setTimeout(() => {
        killed = true;
        try {
          if (child.pid !== undefined && isPosix) {
            process.kill(-child.pid, 'SIGKILL'); // kill the whole process group
          } else {
            child.kill('SIGKILL');
          }
        } catch {
          /* process (group) already gone */
        }
      }, this.bashTimeoutMs);
      child.on('close', () => {
        clearTimeout(timer);
        const body = out.length > 0 ? out : '(no output)';
        resolve(
          truncate(killed ? `ERROR: command killed after ${this.bashTimeoutMs}ms\n${body}` : body)
        );
      });
      child.on('error', (err: Error) => {
        clearTimeout(timer);
        resolve(truncate(`ERROR: ${err.message}`));
      });
    });
  }

  private async runWriteFile(
    workspacePath: string,
    requested: string,
    content: string
  ): Promise<string> {
    const target = resolveInsideWorkspace(workspacePath, requested);
    if (target === null) {
      return `ERROR: refusing to write outside workspace: ${requested}`;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
    return `wrote ${requested} (${content.length} bytes)`;
  }

  private async runReadFile(workspacePath: string, requested: string): Promise<string> {
    const target = resolveInsideWorkspace(workspacePath, requested);
    if (target === null) {
      return `ERROR: refusing to read outside workspace: ${requested}`;
    }
    const content = await fs.readFile(target, 'utf8');
    return truncate(content);
  }

  private errorEvent(sessionId: string, message: string): AgentEvent {
    return {
      type: 'error',
      timestamp: new Date().toISOString(),
      sessionId,
      content: message,
    };
  }

  /** Best-effort telemetry hook — a throwing hook never breaks a turn. */
  private notify(hook: ((model: string) => void) | undefined, model: string): void {
    if (!hook) return;
    try {
      hook(model);
    } catch {
      // Swallow — usage/failure telemetry is advisory, not turn-critical.
    }
  }

  async stopSession(session: AgentSession): Promise<Result<void, AgentError>> {
    const ollamaSession = session as OllamaSession;
    ollamaSession.aborted = true;
    try {
      ollamaSession.activeController?.abort();
    } catch {
      // Controller may already be settled.
    }
    await Promise.all(
      (ollamaSession.mcpClients ?? []).map(async (client) => {
        try {
          await client.close();
        } catch {
          // best-effort — a failing close must not break session teardown.
        }
      })
    );
    return Ok(undefined);
  }

  async healthCheck(): Promise<Result<void, AgentError>> {
    try {
      const headers: Record<string, string> = {};
      if (this.config.apiKey !== undefined) {
        headers.Authorization = `Bearer ${this.config.apiKey}`;
      }
      const res = await fetch(`${this.endpoint}/models`, { method: 'GET', headers });
      if (!res.ok) {
        return Err({
          category: 'response_error',
          message: `Ollama health check failed: HTTP ${res.status} ${res.statusText}`,
        });
      }
      return Ok(undefined);
    } catch (err) {
      return Err({
        category: 'agent_not_found',
        message: `Ollama endpoint unreachable: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}

/** Minimal shape of Ollama's OpenAI-compatible chat-completions response. */
interface OllamaChatResponse {
  choices: Array<{
    message?: { content?: string | null; tool_calls?: ToolCall[] };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}
