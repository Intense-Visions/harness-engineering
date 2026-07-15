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
  /**
   * Consumption Phase 1 (T3): live model resolver, read at request time. When
   * provided and it returns a non-empty name, that name is used in preference to
   * `defaultModel` so a pool install/swap is consumed by analysis without a
   * restart. `request.model` (an explicit per-call override) still wins; a
   * null/undefined/empty return falls through to `defaultModel`.
   */
  getModel?: () => string | null | undefined;
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
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly defaultModel: string;
  private readonly getModel?: () => string | null | undefined;
  private readonly promptSuffix: string | null;
  private readonly jsonMode: boolean;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      timeout: this.timeoutMs,
    });
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL;
    if (options.getModel !== undefined) {
      this.getModel = options.getModel;
    }
    this.promptSuffix = options.promptSuffix ?? null;
    this.jsonMode = options.jsonMode ?? true;
  }

  async analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>> {
    // Model precedence: explicit per-request override → live resolver
    // (getModel, read fresh each call) → static defaultModel.
    const resolved = this.getModel?.();
    const model =
      request.model ?? (resolved != null && resolved !== '' ? resolved : this.defaultModel);
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const jsonSchema = zodToJsonSchema(request.responseSchema);
    const { systemContent, userContent } = this.buildMessages(request, jsonSchema);

    // Reasoning models (Qwen3 et al.) emit a `<think>` trace that Ollama's OpenAI-compatible
    // `/v1` endpoint neither suppresses nor bounds — it ignores `/no_think`, `think:false`, and
    // `chat_template_kwargs`. For a narrow structured-extraction call where that trace adds
    // latency but not quality, the caller passes `disableThinking`, and we take Ollama's NATIVE
    // `/api/chat` with `think:false` (~100× fewer tokens). Any failure — a non-Ollama endpoint
    // (vLLM / LM Studio have no `/api/chat`), network, or parse — falls through to the
    // OpenAI-compatible path below, which is always correct (just slower). The optimization can
    // never break a working call.
    if (request.disableThinking === true) {
      try {
        return await this.analyzeViaOllamaNative<T>(
          request,
          model,
          maxTokens,
          jsonSchema,
          systemContent,
          userContent
        );
      } catch {
        // fall through to the OpenAI-compatible path (thinking stays on, still correct)
      }
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
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
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

  /** Build the system + user message content shared by both the OpenAI-compat and native paths. */
  private buildMessages(
    request: AnalysisRequest,
    jsonSchema: object
  ): { systemContent: string; userContent: string } {
    const systemParts: string[] = [];
    if (request.systemPrompt) systemParts.push(request.systemPrompt);
    if (this.jsonMode) {
      // Schema is enforced server-side (response_format / native `format`) — keep prompt lean.
      systemParts.push(
        'Respond ONLY with the JSON object, no other text. Be concise — use short sentences in string fields and limit arrays to the most important items.'
      );
    } else {
      // No server-side enforcement — include full schema in prompt.
      systemParts.push(
        'You MUST respond with valid JSON matching this schema:\n' +
          JSON.stringify(jsonSchema, null, 2) +
          '\n\nRespond ONLY with the JSON object, no other text.'
      );
    }
    const userContent = this.promptSuffix
      ? `${request.prompt}\n\n${this.promptSuffix}`
      : request.prompt;
    return { systemContent: systemParts.join('\n\n'), userContent };
  }

  /** Ollama's native chat route, derived from the configured `/v1` base URL. */
  private ollamaNativeChatUrl(): string {
    return this.baseUrl.replace(/\/v1\/?$/, '') + '/api/chat';
  }

  /**
   * Take Ollama's NATIVE `/api/chat` with `think:false` — the only way to actually suppress a
   * Qwen3-style reasoning trace (the OpenAI-compatible `/v1` shim ignores every thinking knob).
   * Schema is enforced via native `format`; `num_predict` bounds output. Throws on any non-2xx,
   * missing content, or schema-parse failure so `analyze` can fall back to the OpenAI-compatible
   * path (e.g. when the endpoint is not actually Ollama).
   */
  private async analyzeViaOllamaNative<T>(
    request: AnalysisRequest,
    model: string,
    maxTokens: number,
    jsonSchema: object,
    systemContent: string,
    userContent: string
  ): Promise<AnalysisResponse<T>> {
    const startMs = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.ollamaNativeChatUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          think: false,
          stream: false,
          format: jsonSchema,
          options: { num_predict: maxTokens },
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Ollama native /api/chat returned ${res.status}`);
      }
      const data = (await res.json()) as {
        message?: { content?: string };
        done_reason?: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };
      // Truncation guard, mirroring the OpenAI-compat `finish_reason === 'length'` check: Ollama
      // sets `done_reason: 'length'` when `num_predict` is hit. A `format`-constrained decode can
      // still leave a *parseable* partial object, so without this a truncated result would be
      // returned as complete. Throw so `analyze` falls back to the compat path (full budget +
      // thinking) instead of silently accepting a cut-off answer.
      if (data.done_reason === 'length') {
        throw new Error('Ollama native /api/chat response truncated (done_reason=length)');
      }
      const content = data.message?.content;
      if (!content) {
        throw new Error('Ollama native /api/chat response missing message content');
      }
      const parsed = JSON.parse(content) as unknown;
      const result = request.responseSchema.parse(parsed) as T;
      const inputTokens = data.prompt_eval_count ?? 0;
      const outputTokens = data.eval_count ?? 0;
      return {
        result,
        tokenUsage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        model,
        latencyMs: Math.round(performance.now() - startMs),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
