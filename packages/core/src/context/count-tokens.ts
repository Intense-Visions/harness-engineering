/**
 * Exact token counting via Anthropic's `/v1/messages/count_tokens` endpoint.
 *
 * The `chars / 4` heuristic in {@link estimateTokens} systematically miscounts
 * Claude tokens (code and non-English text especially). This module returns the
 * tokenizer-exact count instead — but only when a key is available. With no
 * API key it returns `null` so callers fall back to the heuristic, and a failed
 * request throws so the report's per-entry fallback degrades that entry rather
 * than hard-failing. Never throws at construction and never hard-fails a report.
 */

import type { TokenCounter } from './attribution';
import { heuristicTokenCounter } from './attribution';

/** Default model whose tokenizer is used for exact counts. */
export const DEFAULT_COUNT_TOKENS_MODEL = 'claude-opus-4-8';

/** Default Anthropic API base URL. */
const DEFAULT_BASE_URL = 'https://api.anthropic.com';

/** Anthropic API version header value. */
const ANTHROPIC_VERSION = '2023-06-01';

/** Minimal `fetch` shape we depend on — lets tests inject a fake. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface AnthropicTokenCounterOptions {
  /** API key. Defaults to `process.env.ANTHROPIC_API_KEY`. */
  apiKey?: string;
  /** Model whose tokenizer to use. Defaults to {@link DEFAULT_COUNT_TOKENS_MODEL}. */
  model?: string;
  /** Base URL. Defaults to the public Anthropic API. */
  baseUrl?: string;
  /** Injectable `fetch`. Defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
}

function resolveApiKey(explicit?: string): string | undefined {
  const key = explicit ?? process.env.ANTHROPIC_API_KEY;
  const trimmed = key?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Create an exact {@link TokenCounter} backed by `/v1/messages/count_tokens`.
 *
 * Returns `null` when no API key is resolvable — the caller then uses the
 * heuristic (this is the "no key / offline" graceful path). The returned counter
 * throws on a failed request so that {@link buildAttributionReport} degrades the
 * offending entry to the heuristic; it does not swallow errors silently.
 */
export function createAnthropicTokenCounter(
  options: AnthropicTokenCounterOptions = {}
): TokenCounter | null {
  const apiKey = resolveApiKey(options.apiKey);
  if (!apiKey) return null;

  const model = options.model ?? DEFAULT_COUNT_TOKENS_MODEL;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);

  if (!fetchImpl) {
    // No fetch available (very old runtime) — behave as "no exact counter".
    return null;
  }

  return async (text: string): Promise<number> => {
    const response = await fetchImpl(`${baseUrl}/v1/messages/count_tokens`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!response.ok) {
      throw new Error(`count_tokens request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as { input_tokens?: unknown };
    const count = payload.input_tokens;
    if (typeof count !== 'number' || !Number.isFinite(count)) {
      throw new Error('count_tokens response missing a numeric input_tokens field');
    }
    return count;
  };
}

/** How a resolved counter produces its counts. */
export type ResolvedCounterMode = 'exact' | 'heuristic';

export interface ResolvedTokenCounter {
  counter: TokenCounter;
  /** `exact` when an API-backed counter was resolved, else `heuristic`. */
  mode: ResolvedCounterMode;
}

/**
 * Resolve the best available token counter: the exact API counter when a key is
 * present, otherwise the heuristic. Convenience over
 * {@link createAnthropicTokenCounter} for callers that always want a usable
 * counter plus a mode label.
 */
export function resolveTokenCounter(
  options: AnthropicTokenCounterOptions = {}
): ResolvedTokenCounter {
  const exact = createAnthropicTokenCounter(options);
  if (exact) return { counter: exact, mode: 'exact' };
  return { counter: heuristicTokenCounter, mode: 'heuristic' };
}
