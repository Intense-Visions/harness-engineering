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
}

const DEFAULT_MODEL = 'deepseek-coder-v2';
const DEFAULT_MAX_TOKENS = 4096;

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

  constructor(options: OpenAICompatibleProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
    });
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL;
  }

  async analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>> {
    const model = request.model ?? this.defaultModel;
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const jsonSchema = zodToJsonSchema(request.responseSchema);

    const systemParts: string[] = [];
    if (request.systemPrompt) systemParts.push(request.systemPrompt);
    systemParts.push(
      'You MUST respond with valid JSON matching this schema:\n' +
        JSON.stringify(jsonSchema, null, 2) +
        '\n\nRespond ONLY with the JSON object, no other text.'
    );

    const startMs = performance.now();

    const response = await this.client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemParts.join('\n\n') },
        { role: 'user', content: request.prompt },
      ],
    });

    const latencyMs = Math.round(performance.now() - startMs);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(
        'OpenAI-compatible response did not contain content. ' +
          `Finish reason: ${response.choices[0]?.finish_reason}`
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
