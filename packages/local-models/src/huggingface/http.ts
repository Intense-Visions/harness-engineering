/**
 * `HttpFetcher` — the dependency-injection seam for HuggingFace HTTP I/O.
 *
 * The HuggingFace client takes an `HttpFetcher` instead of importing the
 * global `fetch` directly so tests can drop in deterministic stubs and the
 * production code can plug in retry / proxy / metric wrappers without
 * touching the client itself.
 *
 * The default implementation wraps `globalThis.fetch` (Node ≥ 18) with an
 * `AbortController` timeout and a `User-Agent` header. It exposes a minimal
 * subset of the Fetch `Response` so the surface stays stable even if we
 * later swap to `undici` directly.
 */

import { LOCAL_MODELS_VERSION } from '../version.js';

/** Minimal subset of `RequestInit` the client needs. */
export interface HttpFetchInit {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/** Minimal subset of `Response` the client consumes. */
export interface HttpResponse {
  status: number;
  headers: Headers;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

/**
 * Pluggable HTTP client. Tests inject a `vi.fn()`-backed stub; production
 * uses the `defaultHttpFetcher` below.
 */
export interface HttpFetcher {
  fetch(url: string, init?: HttpFetchInit): Promise<HttpResponse>;
}

/** Default 10s timeout per HF request. HF's `/api/models` is fast in steady state. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** User-Agent so HF can identify our traffic if they ever need to. */
const DEFAULT_USER_AGENT = `harness-engineering-local-models/${LOCAL_MODELS_VERSION}`;

/** Production `HttpFetcher` backed by global `fetch`. */
export const defaultHttpFetcher: HttpFetcher = {
  async fetch(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    // If the caller provided a signal, abort our controller when theirs fires.
    const callerSignal = init?.signal;
    const onCallerAbort = (): void => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
    try {
      const response = await globalThis.fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Accept: 'application/json',
          ...(init?.headers ?? {}),
        },
      });
      return {
        status: response.status,
        headers: response.headers,
        text: () => response.text(),
        json: <T>() => response.json() as Promise<T>,
      };
    } finally {
      clearTimeout(timer);
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
    }
  },
};
