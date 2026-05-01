import { randomUUID } from 'node:crypto';
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

export interface PiBackendConfig {
  /** Static model identifier (e.g., 'gemma-4-e4b'). Ignored if `getModel` is provided. */
  model?: string | undefined;
  /** Endpoint URL for the model server (e.g., 'http://localhost:1234/v1') */
  endpoint?: string | undefined;
  /** API key for the model server (default: 'lm-studio') */
  apiKey?: string | undefined;
  /** Lazy resolver. Called once at `startSession()`. Returning `null` causes `startSession()` to fail with typed `agent_not_found`. */
  getModel?: (() => string | null) | undefined;
}

interface PiSession extends AgentSession {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  piSession: any;
  unsubscribe: (() => void) | null;
}

/** Events that are internal lifecycle and should not be surfaced. */
const SILENT_EVENTS = new Set([
  'turn_end',
  'message_start',
  'message_end',
  'compaction_start',
  'compaction_end',
  'queue_update',
  'auto_retry_start',
]);

/** Map delta subtypes from message_update to AgentEvent types. */
const DELTA_TYPE_MAP: Record<string, string> = {
  text_delta: 'text',
  thinking_delta: 'thought',
  toolcall_delta: 'status',
};

/**
 * Surface per-turn usage on a yielded event so the orchestrator state machine's
 * `+=` accumulator sees each turn's tokens. TurnResult.usage alone is invisible —
 * the for-await-of loop drops the generator's return value.
 */
function maybeUsageEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawEvent: any,
  sessionId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUsage: (usage: any) => void
): AgentEvent | null {
  if (rawEvent.type !== 'turn_end' || !rawEvent.message?.usage) return null;
  const raw = rawEvent.message.usage;
  onUsage(raw);
  const inputTokens = raw.inputTokens ?? raw.input_tokens ?? 0;
  const outputTokens = raw.outputTokens ?? raw.output_tokens ?? 0;
  return {
    type: 'usage',
    timestamp: new Date().toISOString(),
    sessionId,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stringify(value: any): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? '');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMessageUpdate(rawEvent: any, sessionId: string, timestamp: string): AgentEvent | null {
  const delta = rawEvent.assistantMessageEvent;
  if (!delta) return null;

  const mappedType = DELTA_TYPE_MAP[delta.type];
  if (!mappedType) return null;

  return { type: mappedType, timestamp, content: delta.delta ?? '', sessionId };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToolEvent(rawEvent: any, sessionId: string, timestamp: string): AgentEvent | null {
  switch (rawEvent.type) {
    case 'tool_execution_start':
      return {
        type: 'call',
        timestamp,
        content: `Calling ${rawEvent.toolName}(${stringify(rawEvent.args ?? rawEvent.input ?? {})})`,
        sessionId,
      };
    case 'tool_execution_update':
      return { type: 'status', timestamp, content: stringify(rawEvent.partialResult), sessionId };
    case 'tool_execution_end':
      return {
        type: 'status',
        timestamp,
        content: stringify(rawEvent.result ?? 'Tool completed'),
        sessionId,
      };
    default:
      return null;
  }
}

/**
 * Map a pi AgentSessionEvent to our AgentEvent interface.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPiEvent(rawEvent: any, sessionId: string): AgentEvent | null {
  if (SILENT_EVENTS.has(rawEvent.type)) return null;

  const timestamp = new Date().toISOString();

  if (rawEvent.type === 'message_update') {
    return mapMessageUpdate(rawEvent, sessionId, timestamp);
  }

  if (rawEvent.type.startsWith('tool_execution_')) {
    return mapToolEvent(rawEvent, sessionId, timestamp);
  }

  if (rawEvent.type === 'agent_end') {
    return { type: 'result', timestamp, content: 'Agent completed', sessionId };
  }

  if (rawEvent.type === 'agent_start' || rawEvent.type === 'turn_start') {
    const type = rawEvent.type === 'turn_start' ? 'turn_start' : 'status';
    return { type, timestamp, content: rawEvent.type, sessionId };
  }

  return null;
}

/**
 * Build a pi Model object from simple endpoint + model config.
 * Uses the openai-completions API which works with LM Studio, Ollama, and vLLM.
 */
function buildLocalModel(config: PiBackendConfig) {
  if (!config.model) return undefined;
  return {
    id: config.model,
    name: config.model,
    api: 'openai-completions' as const,
    provider: 'harness-local',
    baseUrl: config.endpoint ?? 'http://localhost:1234/v1',
    reasoning: false,
    input: ['text' as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 8192,
    headers: { Authorization: `Bearer ${config.apiKey ?? 'lm-studio'}` },
  };
}

/**
 * Agent backend that embeds the pi coding agent SDK in-process.
 *
 * Pi is a full agentic coding tool with file read/write/edit, bash, grep,
 * and find tools. This backend uses the SDK directly (createAgentSession)
 * rather than spawning a subprocess, enabling custom tool injection and
 * native event streaming.
 *
 * @see https://github.com/badlogic/pi-mono
 */
export class PiBackend implements AgentBackend {
  readonly name = 'pi';
  private config: PiBackendConfig;

  constructor(config: PiBackendConfig = {}) {
    this.config = config;
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    try {
      let resolvedModelName: string | undefined;
      if (this.config.getModel) {
        const candidate = this.config.getModel();
        if (candidate === null) {
          return Err({
            category: 'agent_not_found',
            message: 'No local model available; check dashboard for details.',
          });
        }
        resolvedModelName = candidate;
      } else {
        resolvedModelName = this.config.model;
      }

      const piSdk = await import('@mariozechner/pi-coding-agent');
      const model = buildLocalModel({
        model: resolvedModelName,
        endpoint: this.config.endpoint,
        apiKey: this.config.apiKey,
      });

      const { session: piSession } = await piSdk.createAgentSession({
        cwd: params.workspacePath,
        ...(model !== undefined && { model }),
        tools: piSdk.codingTools,
        sessionManager: piSdk.SessionManager.inMemory(),
      });

      const session: PiSession = {
        sessionId: randomUUID(),
        workspacePath: params.workspacePath,
        backendName: this.name,
        startedAt: new Date().toISOString(),
        piSession,
        unsubscribe: null,
      };

      return Ok(session);
    } catch (err) {
      return Err({
        category: 'response_error',
        message: `Failed to create pi session: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  async *runTurn(
    session: AgentSession,
    params: TurnParams
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    const piSession = (session as PiSession).piSession;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventQueue: any[] = [];
    let resolveWait: (() => void) | null = null;
    let promptDone = false;
    let promptErrorMsg: string | null = null;

    const signal = () => {
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribe = piSession.subscribe((event: any) => {
      eventQueue.push(event);
      signal();
    });

    (session as PiSession).unsubscribe = unsubscribe;

    const promptPromise = piSession.prompt(params.prompt).then(
      () => {
        promptDone = true;
        signal();
      },
      (err: Error) => {
        promptErrorMsg = err.message;
        promptDone = true;
        signal();
      }
    );

    let inputTokens = 0;
    let outputTokens = 0;

    try {
      yield* this.consumeEvents(eventQueue, session.sessionId, () => promptDone, {
        onUsage(usage) {
          inputTokens += usage.inputTokens ?? usage.input_tokens ?? 0;
          outputTokens += usage.outputTokens ?? usage.output_tokens ?? 0;
        },
        waitForEvent: () =>
          new Promise<void>((r) => {
            resolveWait = r;
          }),
      });
    } finally {
      // Unblock any suspended waitForEvent() to prevent dangling promises
      // resolveWait is assigned inside a closure, so TS can't track it — cast is safe
      (resolveWait as (() => void) | null)?.();
      resolveWait = null;
      unsubscribe();
      (session as PiSession).unsubscribe = null;
      await promptPromise.catch(() => {});
    }

    const totalTokens = inputTokens + outputTokens;

    if (promptErrorMsg) {
      return {
        success: false,
        sessionId: session.sessionId,
        error: promptErrorMsg,
        usage: { inputTokens, outputTokens, totalTokens },
      };
    }

    return {
      success: true,
      sessionId: session.sessionId,
      usage: { inputTokens, outputTokens, totalTokens },
    };
  }

  /**
   * Consume events from the queue, yielding mapped AgentEvents until agent_end or prompt completion.
   */
  private async *consumeEvents(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queue: any[],
    sessionId: string,
    isDone: () => boolean,
    hooks: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onUsage: (usage: any) => void;
      waitForEvent: () => Promise<void>;
    }
  ): AsyncGenerator<AgentEvent, void, void> {
    while (true) {
      if (queue.length === 0) {
        if (isDone()) return;
        await hooks.waitForEvent();
        continue;
      }

      const rawEvent = queue.shift();
      const usageEvent = maybeUsageEvent(rawEvent, sessionId, hooks.onUsage);
      if (usageEvent) yield usageEvent;

      const mapped = mapPiEvent(rawEvent, sessionId);
      if (mapped) yield mapped;

      if (rawEvent.type === 'agent_end') return;
    }
  }

  async stopSession(session: AgentSession): Promise<Result<void, AgentError>> {
    const piSession = (session as PiSession).piSession;
    try {
      if ((session as PiSession).unsubscribe) {
        (session as PiSession).unsubscribe!();
        (session as PiSession).unsubscribe = null;
      }
      await piSession.abort();
    } catch {
      // Session may already be stopped
    }
    return Ok(undefined);
  }

  async healthCheck(): Promise<Result<void, AgentError>> {
    try {
      await import('@mariozechner/pi-coding-agent');
      return Ok(undefined);
    } catch (err) {
      return Err({
        category: 'agent_not_found',
        message: `Pi SDK not available: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}
