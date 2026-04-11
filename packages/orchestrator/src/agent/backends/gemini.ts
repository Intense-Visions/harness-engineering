import { GoogleGenerativeAI } from '@google/generative-ai';
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
import { GeminiCacheAdapter } from '@harness-engineering/core';

export interface GeminiBackendConfig {
  /** Gemini model to use. Defaults to 'gemini-2.0-flash'. */
  model?: string;
  /** API key. Defaults to process.env.GEMINI_API_KEY or process.env.GOOGLE_API_KEY. */
  apiKey?: string;
}

export interface GeminiSession extends AgentSession {
  systemPrompt?: string;
}

export class GeminiBackend implements AgentBackend {
  readonly name = 'gemini';
  private config: Required<GeminiBackendConfig>;
  private cacheAdapter: GeminiCacheAdapter;

  constructor(config: GeminiBackendConfig = {}) {
    this.config = {
      model: config.model ?? 'gemini-2.0-flash',
      apiKey: config.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '',
    };
    this.cacheAdapter = new GeminiCacheAdapter();
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    if (!this.config.apiKey) {
      return Err({
        category: 'agent_not_found',
        message: 'GEMINI_API_KEY is not set',
      });
    }

    const session: GeminiSession = {
      sessionId: `gemini-session-${Date.now()}`,
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
    const geminiSession = session as GeminiSession;

    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let cacheCreationTokens = 0;
    let cacheReadTokens = 0;

    try {
      const genAI = new GoogleGenerativeAI(this.config.apiKey);
      const model = genAI.getGenerativeModel({
        model: this.config.model,
        ...(geminiSession.systemPrompt !== undefined && {
          systemInstruction: geminiSession.systemPrompt,
        }),
      });

      const result = await model.generateContentStream(params.prompt);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          const event: AgentEvent = {
            type: 'text',
            timestamp: new Date().toISOString(),
            content: text,
            sessionId: session.sessionId,
          };
          yield event;
        }

        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
          outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
          totalTokens = chunk.usageMetadata.totalTokenCount ?? 0;
          const cacheUsage = this.cacheAdapter.parseCacheUsage(chunk);
          cacheCreationTokens = cacheUsage.cacheCreationTokens;
          cacheReadTokens = cacheUsage.cacheReadTokens;
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Gemini request failed';
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
        cacheCreationTokens,
        cacheReadTokens,
      },
    };
  }

  async stopSession(_session: AgentSession): Promise<Result<void, AgentError>> {
    return Ok(undefined);
  }

  async healthCheck(): Promise<Result<void, AgentError>> {
    try {
      const genAI = new GoogleGenerativeAI(this.config.apiKey);
      // Construct the model as a lightweight connectivity check (SDK has no dedicated ping)
      genAI.getGenerativeModel({ model: this.config.model });
      return Ok(undefined);
    } catch (err) {
      return Err({
        category: 'response_error',
        message: err instanceof Error ? err.message : 'Gemini health check failed',
      });
    }
  }
}
