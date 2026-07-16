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
}

/** Max characters returned from a tool result before truncation. */
const MAX_TOOL_OUTPUT = 4000;

const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434/v1';
const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_TURNS = 50;

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

  constructor(config: OllamaBackendConfig = {}) {
    this.config = config;
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxTurnsPerRun = config.maxTurnsPerRun ?? DEFAULT_MAX_TURNS;
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
    };
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
        response = await this.callModel(ollamaSession);
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

        const result = await this.executeTool(ollamaSession, name, argsJson);

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
          tools: TOOL_SCHEMAS,
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
    return new Promise((resolve) => {
      childProcess.execFile(
        '/bin/sh',
        ['-c', command],
        { cwd: workspacePath, timeout: 300_000, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const combined = `${stdout}${stderr}`;
          if (error && combined.length === 0) {
            resolve(truncate(`ERROR: ${error.message}`));
            return;
          }
          resolve(truncate(combined.length > 0 ? combined : '(no output)'));
        }
      );
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
