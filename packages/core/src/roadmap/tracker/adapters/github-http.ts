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
export interface GitHubHttpOptions {
  token: string;
  fetchFn?: typeof fetch;
  apiBase?: string;
  maxRetries?: number;
  baseDelayMs?: number;
}

const DEFAULTS = { maxRetries: 5, baseDelayMs: 1000 };

export class GitHubHttp {
  private readonly token: string;
  private readonly fetchFn: typeof fetch;
  readonly apiBase: string;
  private readonly retryOpts: { maxRetries: number; baseDelayMs: number };

  constructor(opts: GitHubHttpOptions) {
    this.token = opts.token;
    this.fetchFn = opts.fetchFn ?? globalThis.fetch;
    this.apiBase = opts.apiBase ?? 'https://api.github.com';
    this.retryOpts = {
      maxRetries: opts.maxRetries ?? DEFAULTS.maxRetries,
      baseDelayMs: opts.baseDelayMs ?? DEFAULTS.baseDelayMs,
    };
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
      const res = await this.fetchFn(url, init);
      if (res.status !== 403 && res.status !== 429 && res.status < 500) return res;
      last = res;
      if (attempt === this.retryOpts.maxRetries) break;
      const retryAfter = res.headers.get('Retry-After');
      let delayMs: number;
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        delayMs = isNaN(seconds) ? this.retryOpts.baseDelayMs : seconds * 1000;
      } else {
        delayMs = this.retryOpts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
      }
      await new Promise((r) => setTimeout(r, delayMs));
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
      if (data.length < perPage) break;
      page++;
    }
    return { items, lastEtag, status };
  }
}

export function parseExternalId(
  externalId: string
): { owner: string; repo: string; number: number } | null {
  const m = externalId.match(/^github:([^/]+)\/([^#]+)#(\d+)$/);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!, number: parseInt(m[3]!, 10) };
}

export function buildExternalId(owner: string, repo: string, n: number): string {
  return `github:${owner}/${repo}#${n}`;
}
