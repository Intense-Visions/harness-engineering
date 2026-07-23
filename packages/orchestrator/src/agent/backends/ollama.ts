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
 * this backend owns its native `/api/chat` tool loop.
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
   * Runaway backstop: max inner agentic-loop iterations per `runTurn`. This is
   * NOT the normal stop condition — a progress-based stall detector ends thrashing
   * runs first (see STALL_REPEAT_LIMIT). Set high so a slow-but-progressing local
   * model can finish. Default: 150.
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
   * When true, send native `think:false` on the `/api/chat` body so reasoning
   * models (Qwen3 family) skip `<think>` traces. The native endpoint honors this
   * knob directly (the old `/no_think` prompt hack, needed only on the `/v1`
   * OpenAI-compat endpoint, is retired). Without it a reasoning model burns its
   * output budget thinking and never emits a tool call. Default: false (only set
   * when you know the model reasons).
   */
  disableReasoning?: boolean | undefined;
  /** Explicit context-window override (tokens). Set ⇒ autosizing is skipped. */
  numCtx?: number | undefined;
  /**
   * Hardware-derived context cap (tokens) injected by the orchestrator wiring;
   * the backend never imports local-models. Used as the ceiling in
   * `min(modelMax, cap)` when `numCtx` is unset. Default `DEFAULT_AUTO_CTX`.
   */
  maxContextTokens?: number | undefined;
  /** Output-token budget (`num_predict`). Unset ⇒ model default. */
  numPredict?: number | undefined;
  /**
   * Sampling controls (native `/api/chat` `options`). Unset ⇒ Ollama model
   * default (~temp 0.8). Precise agentic coding benefits from lower/tighter
   * sampling — Qwen thinking-mode coding guidance is 0.6 / 0.95 / 20.
   */
  temperature?: number | undefined;
  topP?: number | undefined;
  topK?: number | undefined;
  /** Keep the sized model warm between turns (`keep_alive`). Default `'10m'`. */
  keepAlive?: string | undefined;
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

/** A native `/api/chat` message. Tool-call args are OBJECTS; tool results carry `tool_name` (no id). */
interface NativeToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}
interface NativeMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: NativeToolCall[];
  tool_name?: string;
}
/** Native `/api/chat` non-stream response shape. */
interface NativeChatResponse {
  // `thinking` carries a reasoning model's (`think:true`) chain-of-thought as a
  // field SEPARATE from `content`. A reasoning model can end a turn with all its
  // work in `thinking` and an EMPTY `content` — so we preserve it (see
  // fromNativeResponse) rather than dropping the only field the model populated.
  message?: {
    role?: string;
    content?: string | null;
    thinking?: string | null;
    tool_calls?: NativeToolCall[];
  };
  prompt_eval_count?: number;
  eval_count?: number;
  done?: boolean;
  done_reason?: string;
}

/**
 * Outcome of one model round-trip in {@link OllamaBackend.runTurn}: either the
 * turn is finished (return its `result`) or the loop should request another.
 */
type TurnStep = { done: true; result: TurnResult } | { done: false; signature: string };

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
  /** Resolved `num_ctx` for this session (override | min(modelMax, cap) | default). */
  numCtx: number;
}

/**
 * Max characters returned from a tool result before truncation. Sized to hold a
 * typical `vitest`/`tsc` report so the model can actually read its test failures.
 * (The prior 4000 was small enough that a full test report overflowed it.)
 */
const MAX_TOOL_OUTPUT = 8000;

/**
 * Fraction of the budget kept from the HEAD when truncating; the remainder is
 * kept from the TAIL. Test runners (vitest) and compilers print the actionable
 * failure diffs and the summary at the END, so a head-only chop would discard
 * exactly what the model needs. Keep a smaller head (the command + first errors)
 * and a larger tail (the failures + summary).
 */
const TRUNCATE_HEAD_FRACTION = 0.3;

const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434/v1';
const DEFAULT_TIMEOUT_MS = 600_000;
/**
 * Runaway BACKSTOP, not a normal-termination mechanism. A less-capable local
 * model takes more read→edit→test→fix cycles to finish the same task than a
 * frontier model, so a low cap cuts off runs that are still making progress
 * (observed: a real multi-file task hit an old cap of ~60 with tests already
 * passing and only a few type errors left). Claude Code / Codex don't terminate
 * on a small fixed step count — they run until done or genuinely stuck. We match
 * that: a high ceiling for the pathological infinite-loop case, with the
 * progress-based stall detector (below) handling ordinary "stuck" termination.
 */
const DEFAULT_MAX_TURNS = 150;
/**
 * Consecutive turns emitting the IDENTICAL tool call(s) — same name + same args —
 * after which the run is declared stalled. Real work varies its calls between
 * turns (edit → test → edit …); repeating the exact same action N times is thrash
 * (e.g. re-running the same failing command, or re-writing the same content). This
 * catches genuine loops early without cutting off slow-but-progressing runs.
 */
const STALL_REPEAT_LIMIT = 4;
/** Fallback context window (tokens) when autosizing has no cap and no model max. */
const DEFAULT_AUTO_CTX = 16384;
/** Keep the sized model warm between turns so it is not reloaded each call. */
const DEFAULT_KEEP_ALIVE = '10m';
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
// npx-launched MCP servers (the common kind, e.g. `npx -y @upstash/context7-mcp`)
// cold-start in ~20s on first run (package download), which exceeded the prior 15s
// budget and got silently skipped — leaving a local model with no docs tools, its
// top failure mode. 30s covers a cold npx start with margin; a genuinely-dead
// server still skips within one dispatch.
const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 30_000;
/**
 * Aggregated tool count (built-ins + all MCP tools) above which the backend logs
 * a one-line advisory pointing at the per-server `tools` allowlist. A large tool
 * set induces choice paralysis in a local model (it over-explores and never
 * cleanly signals completion); this surfaces the risk without a hard cap.
 */
const LARGE_TOOL_SET_WARN = 40;

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
  'To change an existing file, prefer the `edit` tool (a targeted find-and-replace) over',
  'rewriting the whole file with write_file — full rewrites lose earlier fixes. Use write_file',
  'only to create a new file.',
  'Do not claim work you have not performed via a tool.',
  'Keep using tools until the task is FULLY implemented AND verified.',
  'Do NOT stop to explain your work or to ask questions.',
  'Only when everything is done and the verification command passes,',
  'reply with exactly TASK_COMPLETE on its own line and make no tool call.',
  'If you stop for any other reason you will be told to continue.',
].join(' ');

/**
 * The project's agent-instruction files, in priority order. Claude Code auto-reads
 * these into a cloud session's context; a local Ollama agent gets NOTHING, so it
 * never learns the repo's conventions (where specs go — `docs/changes/<slug>/
 * proposal.md` — how things are laid out, how to run them) and invents paths. We
 * read them from the worktree and prepend them to the system prompt so the local
 * agent is "in line" with a cloud session.
 */
const PROJECT_INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md'];
/**
 * Char budget for the injected instructions. Conventions/structure live near the
 * TOP of AGENTS.md, so a head-truncation keeps the load-bearing part while leaving
 * room in a 32K-context local model for the tools, stage prompt, and the work.
 */
const PROJECT_INSTRUCTION_BUDGET = 24 * 1024;

/** Read + budget the worktree's AGENTS.md/CLAUDE.md; '' when absent. Never throws. */
async function readProjectInstructions(workspacePath: string): Promise<string> {
  const parts: string[] = [];
  let remaining = PROJECT_INSTRUCTION_BUDGET;
  for (const file of PROJECT_INSTRUCTION_FILES) {
    if (remaining <= 0) break;
    try {
      let content = await fs.readFile(path.join(workspacePath, file), 'utf8');
      if (content.length > remaining) {
        content = `${content.slice(0, remaining)}\n…(truncated — read the full ${file} for the rest)`;
      }
      remaining -= content.length;
      parts.push(
        `<<<BEGIN ${file} — repo agent instructions & conventions; FOLLOW them>>>\n${content}\n<<<END ${file}>>>`
      );
    } catch {
      /* file absent — skip */
    }
  }
  return parts.join('\n\n');
}

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
      name: 'edit',
      description:
        'Make a targeted edit to an EXISTING file by replacing an exact substring. ' +
        'Prefer this over write_file for changing existing files — it avoids rewriting ' +
        'the whole file (which loses prior fixes). By default `old_string` must appear EXACTLY ' +
        'once; if it is not unique, add surrounding context, or set `replace_all: true` to change ' +
        'every occurrence (e.g. renaming a symbol).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string', description: 'Exact text to replace.' },
          new_string: { type: 'string', description: 'Replacement text.' },
          replace_all: {
            type: 'boolean',
            description: 'Replace every occurrence instead of requiring a unique match (optional).',
          },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a file relative to the workspace root. Output is line-numbered ' +
        '(`<n>\\t<content>`) for reference ONLY — the line-number prefix is NOT part of the file, ' +
        'so never include it in an `edit` old_string. For large files, page with `offset` (1-based ' +
        'start line) and `limit` (number of lines).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          offset: { type: 'number', description: '1-based line to start from (optional).' },
          limit: { type: 'number', description: 'Max number of lines to return (optional).' },
        },
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

/**
 * Normalize native tool-calls (args OBJECT, no id) into the internal
 * OpenAI-shaped `ToolCall[]`: JSON.stringify each argument object and synthesize
 * a stable `call_<n>` id. Returns `undefined` when there are no tool calls.
 */
function normalizeNativeToolCalls(native: NativeToolCall[] | undefined): ToolCall[] | undefined {
  if (!native || native.length === 0) return undefined;
  return native.map((tc, i) => {
    const args = JSON.stringify(tc.function.arguments ?? {});
    return {
      id: `call_${i}`,
      type: 'function',
      function: { name: tc.function.name, arguments: args },
    };
  });
}

/** Map native token counts onto the internal `usage` shape (missing ⇒ 0). */
function nativeUsage(native: NativeChatResponse): {
  prompt_tokens: number;
  completion_tokens: number;
} {
  return {
    prompt_tokens: native.prompt_eval_count ?? 0,
    completion_tokens: native.eval_count ?? 0,
  };
}

/**
 * Normalize a native `/api/chat` response into the internal
 * {@link OllamaChatResponse} shape so the reviewed tool loop is unchanged:
 * wrap `message` into `choices[0]`, JSON.stringify each tool-call's object
 * arguments, synthesize a stable `id` (`call_<n>` — native provides none), and
 * map `prompt_eval_count`/`eval_count` → `usage.prompt_tokens`/`completion_tokens`.
 */
export function fromNativeResponse(native: NativeChatResponse): OllamaChatResponse {
  const nm = native.message;
  const toolCalls = normalizeNativeToolCalls(nm?.tool_calls);
  const message: { content?: string | null; thinking?: string | null; tool_calls?: ToolCall[] } = {
    content: nm?.content ?? '',
    ...(nm?.thinking ? { thinking: nm.thinking } : {}),
    ...(toolCalls ? { tool_calls: toolCalls } : {}),
  };
  return { choices: [{ message }], usage: nativeUsage(native) };
}

/**
 * Convert internal conversation messages (OpenAI-shaped, args-as-string) to
 * native `/api/chat` messages: assistant `tool_calls` arguments string→object;
 * `tool` messages → `{ role:'tool', content, tool_name }`.
 *
 * Native `/api/chat` correlates tool RESULTS to their calls by NAME + ORDER, so
 * each `tool` message must carry the name of the call it answers. Synthetic
 * `call_<n>` ids are only unique WITHIN one response (they reset to `call_0`
 * every turn), so a global id→name lookup collides across turns and mislabels
 * every prior turn's results. Correlate POSITIONALLY instead: track the most
 * recent assistant `tool_calls` and consume them in order — the runner always
 * appends tool results immediately after their assistant turn, in call order.
 */
export function toNativeMessages(messages: ChatMessage[]): NativeMessage[] {
  let pendingCallNames: string[] = [];
  let nextResultIndex = 0;
  return messages.map((m) => {
    if (m.role === 'tool') {
      const toolName = pendingCallNames[nextResultIndex];
      nextResultIndex += 1;
      return { role: 'tool', content: m.content, ...(toolName ? { tool_name: toolName } : {}) };
    }
    if (m.tool_calls && m.tool_calls.length > 0) {
      pendingCallNames = m.tool_calls.map((tc) => tc.function.name);
      nextResultIndex = 0;
      return { role: m.role, content: m.content, tool_calls: toNativeToolCalls(m.tool_calls) };
    }
    // A non-tool, non-tool-calling message ends the current call run.
    pendingCallNames = [];
    nextResultIndex = 0;
    return { role: m.role, content: m.content };
  });
}

/**
 * Convert internal (args-as-string) assistant tool calls to native tool calls
 * (args-as-object). Extracted from {@link toNativeMessages} so the per-message
 * transform stays flat.
 */
function toNativeToolCalls(toolCalls: ToolCall[]): NativeToolCall[] {
  return toolCalls.map((tc) => ({
    function: { name: tc.function.name, arguments: safeParseArgs(tc.function.arguments) },
  }));
}

/** Parse a JSON tool-argument string to an object; `{}` on malformed input. */
function safeParseArgs(argsJson: string): Record<string, unknown> {
  try {
    const v = JSON.parse(argsJson) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Coerce a JSON-parsed tool argument to a string, defaulting to `''`. */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Truncate a tool result to keep the conversation from ballooning, preserving
 * BOTH ends: a head slice (the command echo + first errors) and a larger tail
 * slice (the failure diffs + summary that runners/compilers print last). A
 * head-only chop would drop the most actionable part of a long test report.
 */
export function truncate(text: string): string {
  if (text.length <= MAX_TOOL_OUTPUT) return text;
  const head = Math.floor(MAX_TOOL_OUTPUT * TRUNCATE_HEAD_FRACTION);
  const tail = MAX_TOOL_OUTPUT - head;
  const omitted = text.length - head - tail;
  return `${text.slice(0, head)}\n…(${omitted} chars truncated)…\n${text.slice(text.length - tail)}`;
}

/** Expand a running `{ input, output }` token tally into `TurnResult.usage`. */
function usageTotals(u: { input: number; output: number }): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  return { inputTokens: u.input, outputTokens: u.output, totalTokens: u.input + u.output };
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
 * Apply a server's `tools` allowlist (D1): keep only tools whose pre-namespacing
 * name is listed. Absent ⇒ every tool (byte-identical to prior behavior). Also
 * warns once (D3) for any requested name the server never exposed (typo/version
 * drift) — never fatal; the server still connects with the tools it does have.
 */
function filterServerTools(spec: McpServerSpec, tools: McpToolDescriptor[]): McpToolDescriptor[] {
  if (spec.tools === undefined) return tools;
  const allow = spec.tools;
  const kept = tools.filter((t) => allow.includes(t.name));
  const exposed = new Set(tools.map((t) => t.name));
  const missing = [...new Set(allow.filter((name) => !exposed.has(name)))];
  if (missing.length > 0) {
    console.warn(
      `[ollama-mcp] server '${spec.name}': requested tools not found: ${missing.join(', ')}`
    );
  }
  return kept;
}

/**
 * Warn once (D4) when the aggregated tool set (built-ins + `mcpToolCount` MCP
 * tools) exceeds {@link LARGE_TOOL_SET_WARN}. Uses the live built-in count
 * ({@link TOOL_SCHEMAS} length) rather than a magic number. Advisory only — no
 * hard cap; the operator narrows via each server's `tools` allowlist.
 */
function warnIfLargeToolSet(mcpToolCount: number): void {
  const total = TOOL_SCHEMAS.length + mcpToolCount;
  if (total > LARGE_TOOL_SET_WARN) {
    console.warn(
      `[ollama-mcp] aggregated tool set is large (${total} tools > ${LARGE_TOOL_SET_WARN}); ` +
        "a local model may over-explore — narrow it via each server's `tools` allowlist."
    );
  }
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
  const r = (res ?? {}) as { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
  const texts: string[] = [];
  for (const block of r.content ?? []) {
    if (block?.type === 'text' && typeof block.text === 'string') texts.push(block.text);
  }
  const body = texts.length > 0 ? texts.join('\n') : '(no output)';
  return r.isError === true ? `ERROR: ${body}` : body;
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
 * Native Ollama agentic backend. Owns its native `/api/chat` tool loop:
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

    // Prepend the worktree's AGENTS.md/CLAUDE.md — the repo conventions a cloud
    // (Claude Code) session gets for free but a local model otherwise never sees.
    const baseSystemPrompt = params.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const projectInstructions = await readProjectInstructions(params.workspacePath);
    const systemPrompt = projectInstructions
      ? `${baseSystemPrompt}\n\n## Project conventions — read and FOLLOW these (where files go, how things are laid out, how to run them)\n${projectInstructions}`
      : baseSystemPrompt;
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
      numCtx: DEFAULT_AUTO_CTX,
    };

    const specs = this.config.mcpServers ?? [];
    const connect = this.config.connectMcp ?? defaultConnectMcp;
    await Promise.all(
      specs.map((spec) => this.connectMcpServer(spec, session, connect, params.workspacePath))
    );
    warnIfLargeToolSet(session.mcpTools.length);

    // Nudge the model to actually USE its MCP tools. Local models otherwise leave
    // docs/context tools (e.g. context7) unused and stall on unfamiliar library
    // APIs, framework conventions, or error messages they cannot resolve from
    // memory — their top failure mode. Naming the concrete aggregated tools and
    // telling the model WHEN to reach for them is what turns availability into use.
    if (session.mcpTools.length > 0) {
      const toolNames = session.mcpTools.map((t) => t.function.name).join(', ');
      session.messages[0] = {
        role: 'system',
        content:
          `${systemPrompt} You also have documentation/context tools available: ${toolNames}. ` +
          `When you hit an unfamiliar library API, a framework or testing-library convention, ` +
          `or an error message you cannot confidently resolve from memory, CALL these tools to ` +
          `look up the correct usage BEFORE guessing or repeating a failed edit.`,
      };
    }

    session.numCtx = await this.resolveNumCtx(resolvedModel);

    return Ok(session);
  }

  /**
   * Connect one MCP server and merge its tools into `session` (namespaced,
   * built-in-safe). A connect/list failure — or a hang past the timeout — is
   * warned and skipped so one bad server never breaks the session; a client
   * that resolves after the timeout is closed so no subprocess leaks.
   */
  private async connectMcpServer(
    spec: McpServerSpec,
    session: OllamaSession,
    connect: NonNullable<OllamaBackendConfig['connectMcp']>,
    workspacePath: string
  ): Promise<void> {
    const cwd = spec.cwd ?? workspacePath;
    // Keep the underlying connect promise so a server that resolves AFTER the
    // timeout can still be closed — otherwise its live client (a spawned
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
      for (const tool of filterServerTools(spec, tools)) {
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
  }

  async *runTurn(
    session: AgentSession,
    params: TurnParams
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    const ollamaSession = session as OllamaSession;
    ollamaSession.aborted = false;
    // Reasoning is disabled via native `think:false` on the /api/chat body (see
    // callModel), not a prompt hack — the user turn carries the prompt verbatim.
    ollamaSession.messages.push({ role: 'user', content: params.prompt });

    const usage = { input: 0, output: 0 };
    const fail = (error: string): TurnResult => {
      this.notify(this.config.onModelFailed, ollamaSession.resolvedModel);
      return { success: false, sessionId: session.sessionId, usage: usageTotals(usage), error };
    };

    // Progress-based termination: end early only when the model repeats the
    // IDENTICAL tool call for STALL_REPEAT_LIMIT consecutive turns (genuine
    // thrash). maxTurnsPerRun is just the runaway backstop for the rest.
    let lastSignature: string | null = null;
    let repeats = 0;
    for (let iter = 0; iter < this.maxTurnsPerRun; iter++) {
      if (ollamaSession.aborted) {
        return fail('Ollama turn aborted by stopSession');
      }
      const step = yield* this.runModelStep(ollamaSession, usage, fail);
      if (step.done) return step.result;
      if (step.signature === lastSignature) {
        repeats += 1;
        if (repeats >= STALL_REPEAT_LIMIT) {
          return fail(
            `Ollama turn stalled: repeated the identical tool call ${repeats + 1} times without progress`
          );
        }
      } else {
        repeats = 0;
        lastSignature = step.signature;
      }
    }

    return fail(`Ollama turn exceeded maxTurnsPerRun (${this.maxTurnsPerRun})`);
  }

  /**
   * Drive one model round-trip: call the model, account usage (yielding a
   * `usage` event the orchestrator reads), append the assistant turn, then
   * either finish (TASK_COMPLETE, a premature stop, or an error) or execute the
   * requested tools and ask the caller to loop again. A tool-less turn is only
   * "done" when it signals completion; otherwise `fail` re-prompts the model.
   */
  private async *runModelStep(
    session: OllamaSession,
    usage: { input: number; output: number },
    fail: (error: string) => TurnResult
  ): AsyncGenerator<AgentEvent, TurnStep, void> {
    let response: OllamaChatResponse;
    try {
      response = yield* this.withHeartbeat(this.callModel(session), session.sessionId, 'model');
    } catch (err) {
      if (session.aborted)
        return { done: true, result: fail('Ollama turn aborted by stopSession') };
      const message = err instanceof Error ? err.message : String(err);
      yield this.errorEvent(session.sessionId, message);
      return { done: true, result: fail(message) };
    }

    const message = response.choices[0]?.message;
    if (!message) {
      return { done: true, result: fail('Ollama response contained no message') };
    }

    // Accumulate usage and surface it on a yielded event so the orchestrator
    // state machine (which reads `event.usage`, not TurnResult.usage) advances
    // session totals + rate-limit windows.
    if (response.usage) {
      usage.input += response.usage.prompt_tokens ?? 0;
      usage.output += response.usage.completion_tokens ?? 0;
      yield {
        type: 'usage',
        timestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        usage: usageTotals(usage),
      };
    }

    const toolCalls = message.tool_calls ?? [];

    // Append the assistant turn (with its tool_calls, if any) to the
    // conversation before executing tools, mirroring the OpenAI protocol.
    session.messages.push({
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
      const content = message.content ?? '';
      // Surface the model's final assistant text as a `result` event so the workflow
      // stage runner captures it (`run.output`). Without this, a DOCUMENT stage's
      // generated spec/plan content is produced but never captured — so it can be
      // neither persisted to its documentPath nor threaded to the next stage.
      // A reasoning model (`think:true`) can end a tool-less turn with all its work
      // in `thinking` and an EMPTY `content` (observed: a design stage where the
      // reasoner gathered context then emitted 0 content tokens). Fall back to the
      // reasoning trace so its output is captured instead of dropped.
      const finalText = content.trim() !== '' ? content : (message.thinking ?? '');
      if (finalText.trim() !== '') {
        yield {
          type: 'result',
          timestamp: new Date().toISOString(),
          sessionId: session.sessionId,
          content: finalText,
        };
      }
      // Completion is signaled via VISIBLE content, never a hidden reasoning trace,
      // so key the TASK_COMPLETE check on `content` (not the thinking fallback).
      if (TASK_COMPLETE_MARKER.test(content)) {
        this.notify(this.config.onModelUsed, session.resolvedModel);
        return {
          done: true,
          result: { success: true, sessionId: session.sessionId, usage: usageTotals(usage) },
        };
      }
      return {
        done: true,
        result: fail('agent stopped without signaling completion (no TASK_COMPLETE)'),
      };
    }

    yield* this.runToolCalls(session, toolCalls);
    // Signature of this turn's actions, for the stall detector: same name + same
    // args across consecutive turns ⇒ the model is repeating itself (thrash).
    const signature = JSON.stringify(toolCalls.map((t) => [t.function.name, t.function.arguments]));
    return { done: false, signature };
  }

  /**
   * Execute each native `tool_call` in order: emit start/end events, resolve the
   * result via {@link dispatchToolCall}, and append the `tool` message to the
   * conversation so the next model turn sees it.
   */
  private async *runToolCalls(
    session: OllamaSession,
    toolCalls: ToolCall[]
  ): AsyncGenerator<AgentEvent, void, void> {
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

      const result = yield* this.dispatchToolCall(session, name, argsJson);

      yield {
        type: 'tool_execution_end',
        subtype: name,
        timestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        content: truncate(result),
      };

      session.messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: truncate(result),
      });
    }
  }

  /**
   * Resolve one tool call to its result string, yielding heartbeat events while
   * it runs. A built-in name wins; otherwise an aggregated MCP tool is invoked
   * through its client. A malformed arguments blob or a thrown call becomes an
   * `ERROR:` result the model can see and correct — never a silent empty call.
   */
  private async *dispatchToolCall(
    session: OllamaSession,
    name: string,
    argsJson: string
  ): AsyncGenerator<AgentEvent, string, void> {
    const isBuiltin =
      name === 'bash' || name === 'write_file' || name === 'edit' || name === 'read_file';
    const mcpEntry = isBuiltin ? undefined : session.mcpToolMap.get(name);
    if (!mcpEntry) {
      return yield* this.withHeartbeat(
        this.executeTool(session, name, argsJson),
        session.sessionId,
        name
      );
    }

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      // Mirror the built-in path: a malformed arguments blob is a real failure
      // the model must see — do not silently forward empty args.
      return `ERROR: could not parse arguments for ${name}: ${argsJson}`;
    }
    try {
      const callRes = yield* this.withHeartbeat(
        mcpEntry.client.callTool({ name: mcpEntry.toolName, arguments: args }),
        session.sessionId,
        name
      );
      return truncate(extractMcpText(callRes));
    } catch (err) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /** Native base = endpoint with a trailing `/v1` stripped (probe stays on `/v1`). */
  private nativeBase(): string {
    return this.endpoint.replace(/\/v1\/?$/, '');
  }

  /** D3: resolve the session's num_ctx once at startSession (override | min(modelMax, cap) | default). */
  private async resolveNumCtx(model: string): Promise<number> {
    if (this.config.numCtx !== undefined) return this.config.numCtx;
    const cap = this.config.maxContextTokens ?? DEFAULT_AUTO_CTX;
    const modelMax = await this.fetchModelMax(model);
    return Math.min(modelMax ?? DEFAULT_AUTO_CTX, cap);
  }

  /** POST /api/show and read the first `model_info` key ending `.context_length`; null on any failure. */
  private async fetchModelMax(model: string): Promise<number | null> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.config.apiKey !== undefined) headers.Authorization = `Bearer ${this.config.apiKey}`;
      const res = await fetch(`${this.nativeBase()}/api/show`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { model_info?: Record<string, unknown> };
      const info = json.model_info ?? {};
      const key = Object.keys(info).find((k) => k.endsWith('.context_length'));
      const val = key ? info[key] : undefined;
      return typeof val === 'number' ? val : null;
    } catch {
      return null;
    }
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
      const res = await fetch(`${this.nativeBase()}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: session.resolvedModel,
          messages: toNativeMessages(session.messages),
          tools: [...(TOOL_SCHEMAS as unknown as OpenAITool[]), ...session.mcpTools],
          stream: false,
          keep_alive: this.config.keepAlive ?? DEFAULT_KEEP_ALIVE,
          ...(this.config.disableReasoning ? { think: false } : {}),
          options: {
            num_ctx: session.numCtx,
            ...(this.config.numPredict !== undefined
              ? { num_predict: this.config.numPredict }
              : {}),
            // Sampling controls — unset ⇒ Ollama model default. Lower/tighter values
            // improve precise agentic coding (Qwen thinking-mode guidance: 0.6/0.95/20).
            ...(this.config.temperature !== undefined
              ? { temperature: this.config.temperature }
              : {}),
            ...(this.config.topP !== undefined ? { top_p: this.config.topP } : {}),
            ...(this.config.topK !== undefined ? { top_k: this.config.topK } : {}),
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Ollama HTTP ${res.status} ${res.statusText}: ${truncate(body)}`);
      }

      return fromNativeResponse((await res.json()) as NativeChatResponse);
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
        case 'edit':
          return await this.runEditFile(
            session.workspacePath,
            asString(args.path),
            asString(args.old_string),
            asString(args.new_string),
            args.replace_all === true
          );
        case 'read_file':
          return await this.runReadFile(
            session.workspacePath,
            asString(args.path),
            typeof args.offset === 'number' ? args.offset : undefined,
            typeof args.limit === 'number' ? args.limit : undefined
          );
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
      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        const body = out.length > 0 ? out : '(no output)';
        if (killed) {
          resolve(truncate(`ERROR: command killed after ${this.bashTimeoutMs}ms\n${body}`));
          return;
        }
        // Surface the exit code so the model can tell success from failure
        // without parsing output (parity with Claude Code / Codex). A zero exit
        // is the expected case, so only annotate a non-zero exit to avoid noise.
        const suffix = code !== null && code !== 0 ? `\n[command exited with code ${code}]` : '';
        resolve(truncate(body) + suffix);
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

  /**
   * Targeted edit: replace the single exact occurrence of `oldStr` with `newStr`
   * in an existing file. Mirrors Claude Code `Edit` semantics so the local agent
   * can make surgical changes instead of rewriting the whole file (the write_file
   * thrash the wrapper otherwise forces). Every failure mode returns an actionable
   * ERROR string (never throws for the model) so the model can self-correct.
   *
   * Matching is literal via index/slice — never `String.replace`, which replaces
   * only the first match and interprets `$&`/`$1` sequences in the replacement.
   */
  private async runEditFile(
    workspacePath: string,
    requested: string,
    oldStr: string,
    newStr: string,
    replaceAll = false
  ): Promise<string> {
    const target = resolveInsideWorkspace(workspacePath, requested);
    if (target === null) {
      return `ERROR: refusing to edit outside workspace: ${requested}`;
    }
    if (oldStr.length === 0) {
      return `ERROR: old_string is empty; provide the exact existing text to replace`;
    }
    if (oldStr === newStr) {
      return `ERROR: old_string and new_string are identical (no-op)`;
    }
    let content: string;
    try {
      content = await fs.readFile(target, 'utf8');
    } catch {
      return `ERROR: file not found: ${requested} — use write_file to create a new file`;
    }
    const first = content.indexOf(oldStr);
    if (first === -1) {
      return `ERROR: old_string not found in ${requested}`;
    }
    if (replaceAll) {
      // Literal replace-every via split/join (never String.replaceAll's `$&`/`$1` interpretation).
      const count = content.split(oldStr).length - 1;
      const updated = content.split(oldStr).join(newStr);
      await fs.writeFile(target, updated, 'utf8');
      return `edited ${requested} (replaced ${count} occurrence${count === 1 ? '' : 's'}, ${content.length} → ${updated.length} bytes)`;
    }
    if (content.indexOf(oldStr, first + oldStr.length) !== -1) {
      const count = content.split(oldStr).length - 1;
      return `ERROR: old_string is not unique in ${requested} (appears ${count} times); add surrounding context to make it unique, or pass replace_all:true`;
    }
    const updated = content.slice(0, first) + newStr + content.slice(first + oldStr.length);
    await fs.writeFile(target, updated, 'utf8');
    return `edited ${requested} (replaced 1 occurrence, ${content.length} → ${updated.length} bytes)`;
  }

  private async runReadFile(
    workspacePath: string,
    requested: string,
    offset?: number,
    limit?: number
  ): Promise<string> {
    const target = resolveInsideWorkspace(workspacePath, requested);
    if (target === null) {
      return `ERROR: refusing to read outside workspace: ${requested}`;
    }
    let content: string;
    try {
      content = await fs.readFile(target, 'utf8');
    } catch {
      return `ERROR: file not found: ${requested}`;
    }
    const lines = content.split('\n');
    const start = offset !== undefined && offset > 0 ? offset - 1 : 0;
    const end = limit !== undefined && limit > 0 ? start + limit : lines.length;
    const slice = lines.slice(start, end);
    // Line-numbered (`<n>\t<line>`, 1-based) for reference — display-only, mirrors
    // Claude Code's Read so the model can cite lines; the prefix must not leak into edits.
    const numbered = slice
      .map((line, i) => `${String(start + i + 1).padStart(6, ' ')}\t${line}`)
      .join('\n');
    const paged =
      start > 0 || end < lines.length
        ? `\n[showing lines ${start + 1}-${Math.min(end, lines.length)} of ${lines.length}]`
        : '';
    return truncate(numbered) + paged;
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
    message?: { content?: string | null; thinking?: string | null; tool_calls?: ToolCall[] };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}
