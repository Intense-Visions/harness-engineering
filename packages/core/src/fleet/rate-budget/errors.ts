// packages/core/src/fleet/rate-budget/errors.ts
//
// Typed failures that enforce the #1532 correctness rule: a throttled or
// truncated fetch FAILS the leaf instead of returning partial/silent-zero data.

/**
 * Thrown when a fetch was rate-limited (HTTP 403/429) and could not complete
 * within the retry budget. The leaf must fail — it must NOT return the throttle
 * response as if it were data.
 */
export class ThrottledFetchError extends Error {
  readonly resource: string;
  readonly status: number;

  constructor(resource: string, status: number, message?: string) {
    super(
      message ??
        `Fetch throttled on resource '${resource}' (HTTP ${status}); failing the leaf rather than returning partial data.`
    );
    this.name = 'ThrottledFetchError';
    this.resource = resource;
    this.status = status;
  }
}

/**
 * Thrown when a fetch/pagination was server-truncated (e.g. GitHub search
 * `incomplete_results: true`). Returning the accumulated-so-far items would be
 * a silent under-fetch, so the leaf fails instead.
 */
export class TruncatedFetchError extends Error {
  readonly resource: string;
  readonly url: string;

  constructor(resource: string, url: string, message?: string) {
    super(
      message ??
        `Fetch truncated on resource '${resource}' at ${url}; failing the leaf rather than returning partial data.`
    );
    this.name = 'TruncatedFetchError';
    this.resource = resource;
    this.url = url;
  }
}
