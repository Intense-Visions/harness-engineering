import OpenAI from 'openai';
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

export interface LocalBackendConfig {
  /** Endpoint URL (e.g., http://localhost:11434/v1). Defaults to http://localhost:11434/v1. */
  endpoint?: string;
  /** Static model name (e.g., deepseek-coder-v2). Ignored if `getModel` is provided. Defaults to 'deepseek-coder-v2'. */
  model?: string;
  /** Lazy resolver. Called once at `startSession()`. Returning `null` causes `startSession()` to fail with typed `agent_not_found`. */
  getModel?: () => string | null;
  /** Optional API key (some servers require a dummy key). */
  apiKey?: string;
  /** Request timeout in ms (default: 90000). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 90_000;

export interface LocalSession extends AgentSession {
  systemPrompt?: string;
  /** Model name resolved at session start (from getModel() if provided, else config.model). */
  resolvedModel: string;
}

export class LocalBackend implements AgentBackend {
  readonly name = 'local';
  private config: Required<Omit<LocalBackendConfig, 'getModel'>>;
  private getModel: (() => string | null) | undefined;
  private client: OpenAI;

  constructor(config: LocalBackendConfig = {}) {
    this.config = {
      endpoint: config.endpoint ?? 'http://localhost:11434/v1',
      model: config.model ?? 'deepseek-coder-v2',
      apiKey: config.apiKey ?? 'ollama',
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
    this.getModel = config.getModel;
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.endpoint,
      timeout: this.config.timeoutMs,
    });
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    let resolvedModel: string;
    if (this.getModel) {
      const candidate = this.getModel();
      if (candidate === null) {
        return Err({
          category: 'agent_not_found',
          message: 'No local model available; check dashboard for details.',
        });
      }
      resolvedModel = candidate;
    } else {
      resolvedModel = this.config.model;
    }

    const session: LocalSession = {
      sessionId: `local-session-${Date.now()}`,
      workspacePath: params.workspacePath,
      backendName: this.name,
      startedAt: new Date().toISOString(),
      resolvedModel,
      ...(params.systemPrompt !== undefined && { systemPrompt: params.systemPrompt }),
    };
    return Ok(session);
  }

  async *runTurn(
    session: AgentSession,
    params: TurnParams
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    const localSession = session as LocalSession;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (localSession.systemPrompt) {
      messages.push({ role: 'system', content: localSession.systemPrompt });
    }

    messages.push({ role: 'user', content: params.prompt });

    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;

    try {
      const stream = await this.client.chat.completions.create({
        model: localSession.resolvedModel,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          const event: AgentEvent = {
            type: 'text',
            timestamp: new Date().toISOString(),
            content: delta.content,
            sessionId: session.sessionId,
          };
          yield event;
        }

        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? 0;
          outputTokens = chunk.usage.completion_tokens ?? 0;
          totalTokens = chunk.usage.total_tokens ?? 0;
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Local backend request failed';
      yield {
        type: 'error',
        timestamp: new Date().toISOString(),
        content: errorMessage,
        sessionId: session.sessionId,
      };
      return {
        success: false,
        sessionId: session.sessionId,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        error: errorMessage,
      };
    }

    const usage = { inputTokens, outputTokens, totalTokens };

    // Surface usage on a yielded event so the orchestrator state machine can
    // advance session totals and rate-limit windows. TurnResult.usage alone is
    // dropped by the for-await-of consumption loop in runAgentInBackgroundTask.
    yield {
      type: 'usage',
      timestamp: new Date().toISOString(),
      sessionId: session.sessionId,
      usage,
    };

    return {
      success: true,
      sessionId: session.sessionId,
      usage,
    };
  }

  async stopSession(_session: AgentSession): Promise<Result<void, AgentError>> {
    return Ok(undefined);
  }

  async healthCheck(): Promise<Result<void, AgentError>> {
    try {
      await this.client.models.list();
      return Ok(undefined);
    } catch (err) {
      return Err({
        category: 'response_error',
        message: err instanceof Error ? err.message : 'Local backend health check failed',
      });
    }
  }
}
