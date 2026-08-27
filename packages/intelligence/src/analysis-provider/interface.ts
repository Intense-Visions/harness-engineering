import type { z } from 'zod';

/**
 * A single image attached to an {@link AnalysisRequest} for a vision-capable
 * `analyze` call. Supply exactly one of `base64` or `url`.
 *
 * Providers that cannot see images (claude-cli, openai-compatible today)
 * ignore this field and answer from the text prompt alone — vision is
 * best-effort, never a contract change. Only the Anthropic backend renders
 * these as image content blocks.
 */
export interface AnalysisImage {
  /** Base64-encoded image bytes (no `data:` prefix). Mutually exclusive with `url`. */
  base64?: string;
  /** Publicly-fetchable image URL. Mutually exclusive with `base64`. */
  url?: string;
  /** MIME type of the image; defaults to `image/png` when omitted. */
  mediaType?: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface AnalysisRequest {
  prompt: string;
  systemPrompt?: string;
  responseSchema: z.ZodType;
  model?: string;
  maxTokens?: number;
  /**
   * Images to attach to the call, in order, ahead of the text prompt. Enables
   * vision judgment (e.g. scoring a rendered screenshot). Backends that lack a
   * vision channel ignore this and answer from `prompt` alone.
   */
  images?: AnalysisImage[];
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
