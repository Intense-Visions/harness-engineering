/**
 * `HuggingFaceClient` — typed wrapper around `huggingface.co/api/models`.
 *
 * The client gives the ranker (Phase 2b) a single deterministic surface for
 * listing model families and fetching per-model metadata. Network failures,
 * non-2xx responses, and decode errors never throw — they resolve to a
 * `HuggingFaceFetchResult` whose `warnings` array carries the diagnostic,
 * matching the S4 contract that the eventual `harness models status`
 * surface degrades gracefully when HF is unreachable.
 *
 * The client is constructor-injected with an `HttpFetcher` and an optional
 * `HuggingFaceCache` so tests stay deterministic and the production
 * scheduler can plug a `FileHuggingFaceCache` in without further wiring.
 */

import type { HuggingFaceCache } from './cache.js';
import { defaultHttpFetcher } from './http.js';
import type { HttpFetcher } from './http.js';
import type {
  HuggingFaceFetchResult,
  HuggingFaceListOptions,
  HuggingFaceModelSummary,
  HuggingFaceWarning,
} from './types.js';
import { decodeModelSummaries } from './types.js';

/** HF's documented base URL. */
const DEFAULT_BASE_URL = 'https://huggingface.co';

/** Default ceiling on pages followed when `paginate: true` is set. */
const DEFAULT_MAX_PAGES = 5;

/** Default cache TTL applied by the client when one isn't passed per-call. */
const DEFAULT_CACHE_TTL_MS = 86_400_000;

/** Half-TTL applied to 404 tombstones so deleted repos don't hammer HF. */
const TOMBSTONE_TTL_RATIO = 0.5;

/** Constructor options for `HuggingFaceClient`. */
export interface HuggingFaceClientOptions {
  /** Pluggable HTTP client. Defaults to the `fetch`-backed runner. */
  http?: HttpFetcher;
  /** Optional cache; when present, identical queries within TTL skip the network. */
  cache?: HuggingFaceCache;
  /** Override the API base URL. Useful for self-hosted mirrors. */
  baseUrl?: string;
  /** Cache TTL in ms applied to successful reads. */
  cacheTtlMs?: number;
}

/**
 * Construct the canonical query string for `listModels`. The keys are
 * appended in a fixed order so the resulting cache key is stable across
 * calls with identical options.
 */
function buildListQuery(opts: HuggingFaceListOptions): string {
  const params = new URLSearchParams();
  if (opts.author !== undefined) params.set('author', opts.author);
  if (opts.search !== undefined) params.set('search', opts.search);
  if (opts.filter !== undefined) params.set('filter', opts.filter);
  if (opts.tags && opts.tags.length > 0) params.set('tags', opts.tags.join(','));
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  return params.toString();
}

/**
 * Stable cache key for a `listModels` call. Exported (named) so the cache
 * tests can construct expected keys without re-implementing the canonical
 * ordering. Internal — not part of the public API surface contract.
 */
export function cacheKeyForList(opts: HuggingFaceListOptions): string {
  return `hf:list:${buildListQuery(opts)}`;
}

/** Stable cache key for a `getModel` call. */
export function cacheKeyForGet(repoId: string): string {
  return `hf:get:${repoId}`;
}

/**
 * Parse a `Link: <url>; rel="next"` header. Returns the next URL or
 * `undefined` if no `next` link is present. Implemented inline rather than
 * pulling in `parse-link-header` for a 5-line job.
 */
function extractNextLink(linkHeader: string | null): string | undefined {
  if (!linkHeader) return undefined;
  // Format: `<url>; rel="next", <url2>; rel="prev"` — we want the entry tagged rel="next".
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

/** Typed HuggingFace API client. Never throws after construction. */
export class HuggingFaceClient {
  private readonly http: HttpFetcher;
  private readonly cache: HuggingFaceCache | undefined;
  private readonly baseUrl: string;
  private readonly cacheTtlMs: number;

  constructor(opts: HuggingFaceClientOptions = {}) {
    this.http = opts.http ?? defaultHttpFetcher;
    this.cache = opts.cache;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  /**
   * List models matching `opts`. When `opts.paginate` is true, follows the
   * `Link: rel="next"` header up to `opts.maxPages` (default 5) and
   * concatenates rows.
   */
  async listModels(
    opts: HuggingFaceListOptions = {}
  ): Promise<HuggingFaceFetchResult<HuggingFaceModelSummary[]>> {
    const key = cacheKeyForList(opts);
    const cached = await this.readCache<HuggingFaceModelSummary[]>(key);
    if (cached) {
      return { value: cached, warnings: [], source: 'cache' };
    }

    const warnings: HuggingFaceWarning[] = [];
    const all: HuggingFaceModelSummary[] = [];
    const maxPages = Math.max(1, opts.maxPages ?? DEFAULT_MAX_PAGES);
    const query = buildListQuery(opts);
    let url = `${this.baseUrl}/api/models${query ? `?${query}` : ''}`;
    let page = 0;

    while (url) {
      page += 1;
      const fetched = await this.fetchJson<unknown>(url);
      if (fetched.warning) {
        warnings.push(fetched.warning);
        break;
      }
      const decoded = decodeModelSummaries(fetched.value);
      all.push(...decoded.models);
      if (decoded.dropped > 0) {
        warnings.push({
          code: 'hf_decode_dropped_rows',
          message: `Dropped ${decoded.dropped} row(s) from HF response that failed schema decode`,
        });
      }
      if (!opts.paginate || page >= maxPages) break;
      const next = fetched.linkHeader ? extractNextLink(fetched.linkHeader) : undefined;
      if (!next) break;
      url = next;
    }

    if (warnings.length === 0 || all.length > 0) {
      await this.writeCache(key, all, this.cacheTtlMs);
    }
    return { value: all, warnings, source: 'live' };
  }

  /**
   * Fetch a single model's metadata. Returns `value: null` and a warning
   * on 404; the tombstone is cached at half TTL so a deleted repo can't
   * hammer HF on every refresh.
   */
  async getModel(repoId: string): Promise<HuggingFaceFetchResult<HuggingFaceModelSummary | null>> {
    if (!repoId || !repoId.includes('/')) {
      return {
        value: null,
        warnings: [
          {
            code: 'hf_invalid_repo_id',
            message: `Repo id "${repoId}" must be in <org>/<name> form`,
          },
        ],
        source: 'live',
      };
    }
    const key = cacheKeyForGet(repoId);
    const cached = await this.readCache<HuggingFaceModelSummary | null>(key);
    if (cached !== undefined) {
      return { value: cached, warnings: [], source: 'cache' };
    }

    const url = `${this.baseUrl}/api/models/${repoId}`;
    const fetched = await this.fetchJson<unknown>(url);
    if (fetched.warning) {
      const tombstone = fetched.warning.code === 'hf_fetch_status_404';
      if (tombstone) {
        await this.writeCache(key, null, Math.round(this.cacheTtlMs * TOMBSTONE_TTL_RATIO));
      }
      return { value: null, warnings: [fetched.warning], source: 'live' };
    }
    const decoded = decodeModelSummaries([fetched.value]);
    const model = decoded.models[0] ?? null;
    if (!model) {
      return {
        value: null,
        warnings: [
          {
            code: 'hf_decode_failed',
            message: `Model "${repoId}" returned a row that failed schema decode`,
          },
        ],
        source: 'live',
      };
    }
    await this.writeCache(key, model, this.cacheTtlMs);
    return { value: model, warnings: [], source: 'live' };
  }

  /**
   * Single-URL fetch helper. Wraps the injected fetcher with consistent
   * error → warning translation and surfaces the response's `Link` header
   * so callers can follow pagination.
   */
  private async fetchJson<T>(url: string): Promise<{
    value: T | undefined;
    warning: HuggingFaceWarning | undefined;
    linkHeader: string | null;
  }> {
    try {
      const response = await this.http.fetch(url);
      if (response.status === 404) {
        return {
          value: undefined,
          warning: {
            code: 'hf_fetch_status_404',
            message: `HF returned 404 for ${url}`,
          },
          linkHeader: null,
        };
      }
      if (response.status < 200 || response.status >= 300) {
        return {
          value: undefined,
          warning: {
            code: 'hf_fetch_failed',
            message: `HF returned ${response.status} for ${url}`,
          },
          linkHeader: null,
        };
      }
      const text = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch (err) {
        return {
          value: undefined,
          warning: {
            code: 'hf_decode_failed',
            message: `HF response for ${url} was not valid JSON`,
            cause: err instanceof Error ? err.message : String(err),
          },
          linkHeader: null,
        };
      }
      return {
        value: parsed as T,
        warning: undefined,
        linkHeader: response.headers.get('link'),
      };
    } catch (err) {
      return {
        value: undefined,
        warning: {
          code: 'hf_fetch_failed',
          message: `HF fetch threw for ${url}`,
          cause: err instanceof Error ? err.message : String(err),
        },
        linkHeader: null,
      };
    }
  }

  private async readCache<T>(key: string): Promise<T | undefined> {
    if (!this.cache) return undefined;
    try {
      return await this.cache.get<T>(key);
    } catch {
      // Cache failures must never break a live read. The cache itself
      // surfaces its own warnings; we just degrade silently here.
      return undefined;
    }
  }

  private async writeCache<T>(key: string, value: T, ttlMs: number): Promise<void> {
    if (!this.cache) return;
    try {
      await this.cache.set(key, value, ttlMs);
    } catch {
      // Same reasoning as readCache: swallow so the live path stays solid.
    }
  }
}
