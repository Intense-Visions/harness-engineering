import OpenAI from 'openai';
import type { AnalysisProvider, AnalysisRequest, AnalysisResponse } from './interface.js';
import { zodToJsonSchema } from './schema.js';

export interface OpenAICompatibleProviderOptions {
  /** API key (some local servers accept any string, e.g., 'ollama'). */
  apiKey: string;
  /** Base URL for the OpenAI-compatible endpoint (e.g., http://localhost:11434/v1). */
  baseUrl: string;
  /** Default model name (e.g., 'deepseek-coder-v2'). */
  defaultModel?: string;
  /** Request timeout in ms (default: 90000). */
  timeoutMs?: number;
  /**
   * String appended to user prompts for structured-output requests.
   * Useful for disabling thinking/reasoning modes (e.g., '/no_think' for Qwen3).
   */
  promptSuffix?: string;
  /**
   * Whether to send `response_format: { type: 'json_schema' }` with the full
   * schema to the server for grammar-constrained decoding. When false, relies
   * on the system prompt alone to produce valid JSON. Default: true.
   */
  jsonMode?: boolean;
}

const DEFAULT_MODEL = 'deepseek-coder-v2';
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * AnalysisProvider for OpenAI-compatible endpoints (Ollama, LM Studio, vLLM, etc.).
 *
 * Uses JSON mode with a system prompt instructing structured output.
 * Falls back to parsing raw text as JSON if the model doesn't support
 * response_format natively.
 */
export class OpenAICompatibleAnalysisProvider implements AnalysisProvider {
  private readonly client: OpenAI;
  private readonly defaultModel: string;
  private readonly promptSuffix: string | null;
  private readonly jsonMode: boolean;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL;
    this.promptSuffix = options.promptSuffix ?? null;
    this.jsonMode = options.jsonMode ?? true;
  }

  async analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>> {
    const model = request.model ?? this.defaultModel;
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const jsonSchema = zodToJsonSchema(request.responseSchema);

    const systemParts: string[] = [];
    if (request.systemPrompt) systemParts.push(request.systemPrompt);
    if (this.jsonMode) {
      // Schema is enforced server-side via response_format — keep prompt lean
      systemParts.push(
        'Respond ONLY with the JSON object, no other text. Be concise — use short sentences in string fields and limit arrays to the most important items.'
      );
    } else {
      // No server-side enforcement — include full schema in prompt
      systemParts.push(
        'You MUST respond with valid JSON matching this schema:\n' +
          JSON.stringify(jsonSchema, null, 2) +
          '\n\nRespond ONLY with the JSON object, no other text.'
      );
    }

    const startMs = performance.now();

    const responseFormat = this.jsonMode
      ? {
          type: 'json_schema' as const,
          json_schema: { name: 'analysis_response', strict: true, schema: jsonSchema },
        }
      : undefined;

    const response = await this.client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      ...(responseFormat && { response_format: responseFormat }),
      messages: [
        { role: 'system', content: systemParts.join('\n\n') },
        {
          role: 'user',
          content: this.promptSuffix ? `${request.prompt}\n\n${this.promptSuffix}` : request.prompt,
        },
      ],
    });

    const latencyMs = Math.round(performance.now() - startMs);

    const choice = response.choices[0];
    const content = choice?.message?.content;
    if (!content) {
      throw new Error(
        'OpenAI-compatible response did not contain content. ' +
          `Finish reason: ${choice?.finish_reason}`
      );
    }

    // Detect truncation before attempting JSON parse
    if (choice.finish_reason === 'length') {
      throw new Error(
        `Response truncated at max_tokens (${maxTokens}). ` +
          'Increase max_tokens or simplify the request.'
      );
    }

    const parsed = JSON.parse(content) as unknown;
    const result = request.responseSchema.parse(parsed) as T;

    const usage = response.usage;
    const tokenUsage = {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    };

    return { result, tokenUsage, model, latencyMs };
  }
}
