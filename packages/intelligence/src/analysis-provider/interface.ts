import type { z } from 'zod';

export interface AnalysisRequest {
  prompt: string;
  systemPrompt?: string;
  responseSchema: z.ZodType;
  model?: string;
  maxTokens?: number;
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
