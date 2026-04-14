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
  /** Model name (e.g., deepseek-coder-v2). Defaults to 'deepseek-coder-v2'. */
  model?: string;
  /** Optional API key (some servers require a dummy key). */
  apiKey?: string;
}

export interface LocalSession extends AgentSession {
  systemPrompt?: string;
}

export class LocalBackend implements AgentBackend {
  readonly name = 'local';
  private config: Required<LocalBackendConfig>;
  private client: OpenAI;

  constructor(config: LocalBackendConfig = {}) {
    this.config = {
      endpoint: config.endpoint ?? 'http://localhost:11434/v1',
      model: config.model ?? 'deepseek-coder-v2',
      apiKey: config.apiKey ?? 'ollama',
    };
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.endpoint,
    });
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    const session: LocalSession = {
      sessionId: `local-session-${Date.now()}`,
      workspacePath: params.workspacePath,
      backendName: this.name,
      startedAt: new Date().toISOString(),
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
        model: this.config.model,
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

    return {
      success: true,
      sessionId: session.sessionId,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
      },
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
