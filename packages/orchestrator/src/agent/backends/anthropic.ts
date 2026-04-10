import Anthropic from '@anthropic-ai/sdk';
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
import { AnthropicCacheAdapter } from '@harness-engineering/core';

export interface AnthropicBackendConfig {
  /** Anthropic model to use. Defaults to 'claude-sonnet-4-20250514'. */
  model?: string;
  /** API key. Defaults to process.env.ANTHROPIC_API_KEY. */
  apiKey?: string;
  /** Maximum output tokens. Defaults to 4096. */
  maxTokens?: number;
}

export interface AnthropicSession extends AgentSession {
  systemPrompt?: string;
}

export class AnthropicBackend implements AgentBackend {
  readonly name = 'anthropic';
  private config: Required<AnthropicBackendConfig>;
  private client: Anthropic;
  private cacheAdapter: AnthropicCacheAdapter;

  constructor(config: AnthropicBackendConfig = {}) {
    this.config = {
      model: config.model ?? 'claude-sonnet-4-20250514',
      apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '',
      maxTokens: config.maxTokens ?? 4096,
    };
    this.client = new Anthropic({ apiKey: this.config.apiKey });
    this.cacheAdapter = new AnthropicCacheAdapter();
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    if (!this.config.apiKey) {
      return Err({
        category: 'agent_not_found',
        message: 'ANTHROPIC_API_KEY is not set',
      });
    }

    const session: AnthropicSession = {
      sessionId: `anthropic-session-${Date.now()}`,
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
    const anthropicSession = session as AnthropicSession;

    const systemBlocks = anthropicSession.systemPrompt
      ? [this.cacheAdapter.wrapSystemBlock(anthropicSession.systemPrompt, 'session')]
      : undefined;

    try {
      const stream = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        ...(systemBlocks && { system: systemBlocks }),
        messages: [{ role: 'user', content: params.prompt }],
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && 'text' in event.delta) {
          yield {
            type: 'text',
            timestamp: new Date().toISOString(),
            content: (event.delta as { text: string }).text,
            sessionId: session.sessionId,
          };
        }
      }

      // Extract final usage from the stream
      const finalMessage = await stream.finalMessage();
      const usage = finalMessage.usage as Record<string, number>;
      const cacheUsage = this.cacheAdapter.parseCacheUsage(finalMessage);

      return {
        success: true,
        sessionId: session.sessionId,
        usage: {
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
          cacheCreationTokens: cacheUsage.cacheCreationTokens,
          cacheReadTokens: cacheUsage.cacheReadTokens,
        },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Anthropic request failed';
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
  }

  async stopSession(_session: AgentSession): Promise<Result<void, AgentError>> {
    return Ok(undefined);
  }

  async healthCheck(): Promise<Result<void, AgentError>> {
    if (!this.config.apiKey) {
      return Err({
        category: 'response_error',
        message: 'ANTHROPIC_API_KEY is not set',
      });
    }
    return Ok(undefined);
  }
}
