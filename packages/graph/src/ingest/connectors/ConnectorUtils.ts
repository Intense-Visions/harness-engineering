import type { GraphStore } from '../../store/GraphStore.js';
import type { EdgeType } from '../../types.js';
import type { HttpClient } from './ConnectorInterface.js';

const CODE_NODE_TYPES = ['file', 'function', 'class', 'method', 'interface', 'variable'] as const;

/** Status codes that indicate a transient failure worth retrying. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;
  /** Initial backoff delay in ms (default: 1000). */
  baseDelayMs?: number;
  /** Maximum backoff delay in ms (default: 30000). */
  maxDelayMs?: number;
}

/** Resolved retry configuration with all defaults applied. */
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/** Exponential backoff with jitter; jitter prevents a thundering herd. */
function computeBackoffDelay(config: RetryConfig, attempt: number): number {
  const exponentialDelay = config.baseDelayMs * 2 ** attempt;
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  return cappedDelay * (0.5 + Math.random() * 0.5);
}

/**
 * Decide whether the loop should return `response` immediately: either it
 * succeeded / is non-retryable, or it is retryable but no retries remain.
 */
function shouldReturnResponse(
  response: Awaited<ReturnType<HttpClient>>,
  attempt: number,
  maxRetries: number
): boolean {
  if (response.ok || !RETRYABLE_STATUSES.has(response.status ?? 0)) {
    return true;
  }
  return attempt === maxRetries;
}

/** Run the request with retries, sleeping between attempts. */
async function executeWithRetry(
  client: HttpClient,
  url: Parameters<HttpClient>[0],
  requestOptions: Parameters<HttpClient>[1],
  config: RetryConfig
): Promise<Awaited<ReturnType<HttpClient>>> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await client(url, requestOptions);
      if (shouldReturnResponse(response, attempt, config.maxRetries)) {
        return response;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Network error with no retries left — re-throw
      if (attempt === config.maxRetries) {
        throw lastError;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, computeBackoffDelay(config, attempt)));
  }

  // Unreachable — the loop always returns or throws on the last attempt.
  // Satisfy TypeScript:
  throw lastError ?? new Error('Request failed after retries');
}

/**
 * Wrap an HttpClient with exponential backoff + jitter.
 *
 * Retries on:
 *   - HTTP 429 (rate-limited) / 5xx (server error)
 *   - Network-level throws (DNS, connection refused, timeout)
 *
 * Jitter formula: `delay * (0.5 + random * 0.5)` prevents thundering herd.
 * After exhausting retries the last response is returned (or the last error thrown).
 */
export function withRetry(client: HttpClient, options?: RetryOptions): HttpClient {
  const config: RetryConfig = {
    maxRetries: options?.maxRetries ?? 3,
    baseDelayMs: options?.baseDelayMs ?? 1000,
    maxDelayMs: options?.maxDelayMs ?? 30_000,
  };

  return (url, requestOptions) => executeWithRetry(client, url, requestOptions, config);
}

/**
 * Sanitization rules applied in order. Each rule removes or replaces
 * patterns commonly used in prompt injection attacks.
 */
const SANITIZE_RULES: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  // Strip XML/HTML-like instruction tags that could be interpreted as system prompts
  {
    pattern:
      /<\/?(?:system|instruction|prompt|role|context|tool_call|function_call|assistant|human|user)[^>]*>/gi,
    replacement: '',
  },
  // Strip markdown-style system prompt markers (including trailing space)
  {
    pattern: /^#{1,3}\s*(?:system|instruction|prompt)\s*[:：]\s*/gim,
    replacement: '',
  },
  // Strip common injection prefixes
  {
    pattern:
      /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?|context)/gi,
    replacement: '[filtered]',
  },
  // Strip "you are now" re-roling attempts (only when followed by AI/agent role words)
  {
    pattern:
      /you\s+are\s+now\s+(?:a\s+)?(?:helpful\s+)?(?:an?\s+)?(?:assistant|system|ai|bot|agent|tool)\b/gi,
    replacement: '[filtered]',
  },
];

/**
 * Sanitize text from external sources (Jira, Slack, Confluence, CI) before
 * storing in graph nodes. These nodes may be returned to LLMs via MCP tools,
 * so we strip patterns commonly used in prompt injection attacks.
 */
export function sanitizeExternalText(text: string, maxLength = 2000): string {
  let sanitized = text;
  for (const rule of SANITIZE_RULES) {
    sanitized = sanitized.replace(rule.pattern, rule.replacement);
  }

  // Truncate to prevent context stuffing
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + '…';
  }

  return sanitized;
}

export function linkToCode(
  store: GraphStore,
  content: string,
  sourceNodeId: string,
  edgeType: EdgeType,
  options?: { checkPaths?: boolean }
): number {
  let edgesCreated = 0;
  for (const type of CODE_NODE_TYPES) {
    const nodes = store.findNodes({ type });
    for (const node of nodes) {
      if (node.name.length < 3) continue;
      const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
      let matched = pattern.test(content);
      if (!matched && options?.checkPaths && node.path) {
        matched = content.includes(node.path);
      }
      if (matched) {
        store.addEdge({ from: sourceNodeId, to: node.id, type: edgeType });
        edgesCreated++;
      }
    }
  }
  return edgesCreated;
}
