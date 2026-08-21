# Plan — Actionable 429 rate-limit error body (#1456)

## Problem

`checkRateLimit` in `packages/orchestrator/src/server/http.ts` returns a bare human
string on rate-limit rejection:

```js
res.end(JSON.stringify({ error: 'Too Many Requests' }));
```

This only restates the HTTP status. A consumer cannot branch on it (no stable machine
`code`), and the retry budget lives only in the `Retry-After` header, not the body.
Filed by craft-fleet (api-craft API-R005) as a `file`-tier quality item — an observable
HTTP contract change, so it must go through the normal build pipeline.

## Approach

Return an actionable, machine-branchable error envelope from the `429` branch while
keeping the existing `Retry-After` header:

```js
res.end(
  JSON.stringify({
    error: {
      code: 'rate_limited',
      message: 'Rate limit exceeded',
      retryAfterSeconds: retryAfter,
    },
  })
);
```

- `code: 'rate_limited'` — stable machine identifier the client can switch on.
- `message` — human-readable summary.
- `retryAfterSeconds` — the same numeric budget already computed for `Retry-After`,
  now also exposed in the body so a JSON-only consumer has it.

The header is preserved (not replaced) so existing header-based clients keep working.

### Convention note

Other error responses in `http.ts` use a flat `{ error: '<string>' }` shape (404, 401,
insufficient-scope). There is no pre-existing nested error-envelope convention, so this
introduces the actionable shape specified in the issue for the 429 branch only. Scoped
narrowly to the rate-limit path to avoid touching unrelated observable contracts.

## Files

- `packages/orchestrator/src/server/http.ts` — the `429` branch of `checkRateLimit`.
- `packages/orchestrator/tests/server/http.test.ts` — new test asserting the body shape.
- `.changeset/*.md` — patch changeset for `@harness-engineering/orchestrator`.

## Test strategy

Add a test that:

1. Starts the server with `HARNESS_RATE_LIMIT_LOCALHOST=1` and `HARNESS_RATE_LIMIT=1`
   so a second request from localhost trips the limiter deterministically.
2. Issues enough requests to a non-state route (state routes bypass the limiter) to get
   a 429.
3. Asserts `statusCode === 429`, `body.error.code === 'rate_limited'`,
   `typeof body.error.retryAfterSeconds === 'number'`, and that the `Retry-After`
   response header is still present.

## Risk / rollback

Low risk — single branch, additive body field, header unchanged. Rollback = revert the
one-file diff. The body shape change is consumer-visible (hence the tracked pipeline
build), but no known internal consumer parses the 429 body today.
