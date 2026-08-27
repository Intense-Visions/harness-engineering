/**
 * Shared HTTP plumbing for the Phase 2 GitHub Issues tracker adapter.
 * Mirrors `fetchWithRetry` and `headers()` from the existing sync adapter
 * (packages/core/src/roadmap/adapters/github-issues.ts) without reaching
 * across the tracker/sync directory boundary.
 *
 * NOT intended to replace the sync adapter's HTTP code in this phase
 * (out of scope; would touch a green file). Future cleanup may
 * consolidate (decision D-P2-C).
 */
import {
  RateBudget,
  sharedRateBudget,
  ThrottledFetchError,
  TruncatedFetchError,
} from '../../../fleet/rate-budget';

export interface GitHubHttpOptions {
  token: string;
  fetchFn?: typeof fetch;
  apiBase?: string;
  maxRetries?: number;
  baseDelayMs?: number;
  /**
   * Shared per-resource fan-out budget (#1532). Every request `acquire`s a slot
   * before it fetches, and a 403/429 `penalize`s the SHARED budget so sibling
   * leaves back off together. Defaults to the process-wide `sharedRateBudget`.
   */
  budget?: RateBudget;
  /** Budget resource key for this client (e.g. `github.core`, `github.search`). */
  resource?: string;
}

const DEFAULTS = { maxRetries: 5, baseDelayMs: 1000 };

export class GitHubHttp {
  private readonly token: string;
  private readonly fetchFn: typeof fetch;
  readonly apiBase: string;
  private readonly retryOpts: { maxRetries: number; baseDelayMs: number };
  private readonly budget: RateBudget;
  private readonly resource: string;

  constructor(opts: GitHubHttpOptions) {
    this.token = opts.token;
    this.fetchFn = opts.fetchFn ?? globalThis.fetch;
    this.apiBase = opts.apiBase ?? 'https://api.github.com';
    this.retryOpts = {
      maxRetries: opts.maxRetries ?? DEFAULTS.maxRetries,
      baseDelayMs: opts.baseDelayMs ?? DEFAULTS.baseDelayMs,
    };
    this.budget = opts.budget ?? sharedRateBudget;
    this.resource = opts.resource ?? 'github.core';
  }

  headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(extra ?? {}),
    };
  }

  async request(
    url: string,
    init: RequestInit & { extraHeaders?: Record<string, string> }
  ): Promise<Response> {
    const { extraHeaders, ...rest } = init;
    const merged: RequestInit = {
      ...rest,
      headers: this.headers(extraHeaders),
    };
    return this.fetchWithRetry(url, merged);
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let last: Response | undefined;
    for (let attempt = 0; attempt <= this.retryOpts.maxRetries; attempt++) {
      // Consult the shared per-resource budget BEFORE every attempt so a fan-out
      // paces itself proactively (and observes any cooldown a sibling installed).
      await this.budget.acquire(this.resource);
      const res = await this.fetchFn(url, init);
      if (res.status !== 403 && res.status !== 429 && res.status < 500) return res;
      last = res;
      const isThrottle = res.status === 403 || res.status === 429;
      const retryAfter = res.headers.get('Retry-After');
      let delayMs: number;
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        delayMs = isNaN(seconds) ? this.retryOpts.baseDelayMs : seconds * 1000;
      } else {
        delayMs = this.retryOpts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
      }
      // Shared backoff: record the cooldown on the SHARED budget so every leaf on
      // this resource — not just this one — waits it out (what actually clears a
      // secondary rate limit).
      if (isThrottle) this.budget.penalize(this.resource, delayMs);
      if (attempt === this.retryOpts.maxRetries) break;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    // Fail-the-leaf (#1532): a fetch that is still throttled after the retry
    // budget must NOT be returned as if it were data — a caller could mistake the
    // 403/429 body for "zero results". Throw so the leaf fails loudly.
    if (last && (last.status === 403 || last.status === 429)) {
      throw new ThrottledFetchError(this.resource, last.status);
    }
    return last!;
  }

  /**
   * Walk all pages of a paginated GET. Stops when a page returns < perPage items.
   *
   * Status semantics:
   * - `status: 304` is returned ONLY when the first page returned 304 (the
   *   server confirmed the caller's If-None-Match matched and there are no
   *   items to read). Callers may then serve cached data.
   * - `status: 200` is returned in all other terminal cases, including the
   *   mid-walk case where page 1 returned 200 (with items) and a later page
   *   returned 304. Mid-walk 304 is treated as "no further items"; already-
   *   accumulated items are preserved and `lastEtag` is the latest ETag seen.
   */
  async paginate<T>(
    buildUrl: (page: number) => string,
    perPage = 100,
    extraHeaders?: Record<string, string>
  ): Promise<{ items: T[]; lastEtag: string | null; status: number }> {
    const items: T[] = [];
    let page = 1;
    let lastEtag: string | null = null;
    let status = 200;
    for (;;) {
      const init: RequestInit & { extraHeaders?: Record<string, string> } = { method: 'GET' };
      if (extraHeaders) init.extraHeaders = extraHeaders;
      const res = await this.request(buildUrl(page), init);
      const etag = res.headers.get('ETag');
      if (res.status === 304) {
        // First-page 304: server confirms cache hit, nothing to walk.
        if (page === 1) return { items, lastEtag: etag, status: 304 };
        // Mid-walk 304: preserve what we have, stop walking.
        if (etag) lastEtag = etag;
        break;
      }
      if (!res.ok) {
        throw new Error(`GitHub ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as T[];
      items.push(...data);
      lastEtag = etag;
      status = res.status;
      if (data.length < perPage) {
        // A short page normally means "genuinely done". But if the server ALSO
        // advertises a next page (`Link: …; rel="next"`), the page was
        // truncated and stopping here would silently under-fetch. Fail the leaf
        // (#1532) rather than return an incomplete list.
        if (hasNextLink(res.headers.get('Link'))) {
          throw new TruncatedFetchError(this.resource, buildUrl(page));
        }
        break;
      }
      page++;
    }
    return { items, lastEtag, status };
  }

  /**
   * Walk all pages of a GitHub **Search** API query (`/search/*`), which — unlike
   * the list endpoints `paginate()` handles — returns an envelope
   * `{ total_count, incomplete_results, items }` rather than a bare array.
   *
   * Fail-the-leaf on server truncation (#1532, search slice): the Search API sets
   * `incomplete_results: true` when a query timed out or was truncated
   * server-side. Reading `items` as if it were the complete set is the same
   * silent under-fetch that `paginate()` guards against for rel="next" — so a
   * page reporting `incomplete_results: true` throws `TruncatedFetchError`
   * instead of returning the partial `items`.
   *
   * Distinct from paginate's truncation signal: for Search, a `Link: rel="next"`
   * header is *ordinary* paging (the result set spans multiple pages), NOT
   * truncation — `incomplete_results` is the truncation signal. So rel="next" is
   * followed here rather than treated as a failure.
   *
   * Byte-identical when `incomplete_results` is `false` or absent: the `=== true`
   * guard is false, nothing throws, and accumulation proceeds unchanged.
   */
  async search<T>(
    buildUrl: (page: number) => string,
    perPage = 100,
    extraHeaders?: Record<string, string>
  ): Promise<{ items: T[]; totalCount: number }> {
    const items: T[] = [];
    let page = 1;
    let totalCount = 0;
    for (;;) {
      const init: RequestInit & { extraHeaders?: Record<string, string> } = { method: 'GET' };
      if (extraHeaders) init.extraHeaders = extraHeaders;
      const url = buildUrl(page);
      const res = await this.request(url, init);
      if (!res.ok) {
        throw new Error(`GitHub ${res.status}: ${await res.text()}`);
      }
      const body = (await res.json()) as {
        total_count?: number;
        incomplete_results?: boolean;
        items?: T[];
      };
      // Server-truncated search: fail the leaf (#1532) rather than return a
      // partial `items` array a caller could mistake for the complete set.
      if (body.incomplete_results === true) {
        throw new TruncatedFetchError(this.resource, url);
      }
      const pageItems = body.items ?? [];
      items.push(...pageItems);
      totalCount = body.total_count ?? totalCount;
      // A full page implies more may exist; Search paginates via rel="next".
      if (pageItems.length < perPage) break;
      if (!hasNextLink(res.headers.get('Link'))) break;
      page++;
    }
    return { items, totalCount };
  }
}

/**
 * True when a GitHub `Link` header advertises a `rel="next"` page. Used to
 * distinguish a genuinely-final short page from a server-truncated one.
 */
function hasNextLink(link: string | null): boolean {
  if (!link) return false;
  return /;\s*rel="next"/.test(link);
}

// External-ID parse/build come from the one canonical module (../../external-id);
// re-exported here so this adapter's importers keep a single import site.
export { parseExternalId, buildExternalId } from '../../external-id';
