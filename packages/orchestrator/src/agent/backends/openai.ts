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

export interface OpenAIBackendConfig {
  /** OpenAI model to use. Defaults to 'gpt-4o'. */
  model?: string;
  /** API key. Defaults to process.env.OPENAI_API_KEY. */
  apiKey?: string;
}

interface OpenAISession extends AgentSession {
  systemPrompt?: string;
}

export class OpenAIBackend implements AgentBackend {
  readonly name = 'openai';
  private config: Required<OpenAIBackendConfig>;
  private client: OpenAI;

  constructor(config: OpenAIBackendConfig = {}) {
    this.config = {
      model: config.model ?? 'gpt-4o',
      apiKey: config.apiKey ?? process.env.OPENAI_API_KEY ?? '',
    };
    this.client = new OpenAI({ apiKey: this.config.apiKey });
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    const session: OpenAISession = {
      sessionId: `openai-session-${Date.now()}`,
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
    const openAISession = session as OpenAISession;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (openAISession.systemPrompt) {
      messages.push({ role: 'system', content: openAISession.systemPrompt });
    }

    messages.push({ role: 'user', content: params.prompt });

    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    });

    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;

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
        message: err instanceof Error ? err.message : 'OpenAI health check failed',
      });
    }
  }
}
