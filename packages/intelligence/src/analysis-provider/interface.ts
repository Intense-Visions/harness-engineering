import type { z } from 'zod';

export interface AnalysisRequest {
  prompt: string;
  systemPrompt?: string;
  responseSchema: z.ZodType;
  model?: string;
  maxTokens?: number;
  /**
   * Request that the backend suppress any chain-of-thought / `<think>` reasoning for THIS call.
   * Intended for narrow structured-extraction calls where a reasoning trace adds latency but not
   * quality. Advisory + best-effort: a provider that can honor it (e.g. Ollama's native
   * `think:false`) does; one that cannot ignores it and answers normally. Never changes the
   * response contract — only whether the model reasons out loud first.
   */
  disableThinking?: boolean;
}

export interface AnalysisResponse<T> {
  result: T;
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  model: string;
  latencyMs: number;
}

export interface AnalysisProvider {
  analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>>;
}
