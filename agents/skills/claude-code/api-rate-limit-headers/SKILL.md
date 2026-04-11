# API Rate Limit Headers

> RATE LIMIT HEADERS ARE THE CONSUMER'S INSTRUMENTATION — WITHOUT X-RATELIMIT-REMAINING AND X-RATELIMIT-RESET, CLIENTS CANNOT IMPLEMENT PROACTIVE THROTTLING AND ARE FORCED INTO REACTIVE RETRY LOOPS THAT AMPLIFY LOAD ON ALREADY-STRESSED INFRASTRUCTURE PRECISELY WHEN THE API NEEDS RELIEF MOST.

## When to Use

- Implementing rate limit response headers for a new or existing API
- Auditing an API that returns 429 errors without actionable throttling context
- Migrating from ad-hoc `X-RateLimit-*` headers to the IETF RateLimit draft standard
- Writing client-side SDK code that needs to read rate limit state and implement proactive throttling
- Documenting the rate limit header contract in an API style guide
- Debugging an integration where the client is exceeding rate limits despite implementing backoff

## Instructions

### Key Concepts

1. **`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` — the de facto standard** — These three headers form the widely-adopted informal standard for rate limit signaling, used by GitHub, Twitter, Stripe, and hundreds of other APIs before any formal RFC existed. `X-RateLimit-Limit` is the total quota for the current window. `X-RateLimit-Remaining` is the requests left in the current window. `X-RateLimit-Reset` is the Unix timestamp when the window resets and `X-RateLimit-Remaining` returns to `X-RateLimit-Limit`. Emit all three on every response — not only on 429 — so clients can monitor their quota consumption proactively.

2. **IETF RateLimit Headers Draft (draft-ietf-httpapi-ratelimit-headers)** — The IETF HTTPAPI working group is standardizing rate limit headers under the names `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` (without the `X-` prefix, as `X-` prefixed headers are deprecated per RFC 6648). The draft also introduces `RateLimit-Policy`, which describes the quota policy in a machine-readable format. Adopt the draft standard for new implementations; emit both the `X-RateLimit-*` variants and the draft standard variants during the transition period for backward compatibility.

3. **`Retry-After` semantics** — `Retry-After` appears on 429 responses and specifies when the client may safely retry. It accepts two formats: a delay in seconds (`Retry-After: 60`) or an HTTP-date (`Retry-After: Wed, 01 Jan 2025 00:00:00 GMT`). The delay format is simpler to implement and parse; the date format is more precise for long windows. A 429 response without `Retry-After` forces clients into guesswork; a 429 with a precise `Retry-After` enables clients to sleep exactly the right amount and retry once with confidence.

4. **Multiple quota windows — named resources** — Some APIs apply different limits to different endpoint groups. GitHub uses `X-RateLimit-Resource: core`, `X-RateLimit-Resource: search`, and `X-RateLimit-Resource: graphql` to distinguish quota pools. Each resource has its own `Limit`, `Remaining`, and `Reset` values. When an API has multiple quota dimensions (per-user, per-app, per-endpoint-group), use named resource headers so clients know which quota they are consuming and which limit they hit.

5. **`RateLimit-Policy` — machine-readable quota description** — The IETF draft's `RateLimit-Policy` header describes the quota policy in a structured format: `RateLimit-Policy: 100;w=60;burst=20` means 100 requests per 60-second window with a burst allowance of 20. This enables SDK authors and monitoring tools to parse quota policies without scraping documentation pages. Include `RateLimit-Policy` on all responses when adopting the IETF draft format.

6. **Header emission timing — on all responses, not just 429** — Rate limit headers must be emitted on successful responses (200, 201, 204) in addition to throttled responses (429). Clients need to track their remaining quota on every response to implement proactive throttling — slowing down before they hit the limit rather than reacting after a 429. A client that only sees rate limit headers on 429 responses cannot avoid the 429 in the first place.

### Worked Example

**GitHub REST API rate limit headers** — the most-referenced public implementation.

**Successful response (quota tracking):**

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 4987
X-RateLimit-Reset: 1704070800
X-RateLimit-Used: 13
X-RateLimit-Resource: core
```

The client can compute: 13 requests used, 4987 remaining, window resets at Unix timestamp `1704070800`. If the client needs to make 5000 requests, it can calculate that it will exhaust its quota and needs to spread the work across multiple windows.

**Rate limit exceeded — 429 with Retry-After:**

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1704070800
X-RateLimit-Used: 5000
X-RateLimit-Resource: core
Retry-After: 3587
Content-Type: application/json

{
  "message": "API rate limit exceeded.",
  "documentation_url": "https://docs.github.com/rest/overview/rate-limits"
}
```

`Retry-After: 3587` tells the client to sleep for 3587 seconds (until the reset timestamp). No guessing, no exponential backoff to a random interval — a precise sleep.

**IETF draft format (forward-compatible):**

```http
HTTP/1.1 200 OK
RateLimit-Limit: 100
RateLimit-Remaining: 87
RateLimit-Reset: 60
RateLimit-Policy: 100;w=60;burst=20
```

`RateLimit-Reset: 60` is a relative delay in seconds in the draft format (unlike `X-RateLimit-Reset`, which is an absolute Unix timestamp). Clients must parse both formats differently; document which format your API uses.

**Twilio rate limit headers — per-endpoint differentiation:**

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704067260
X-Home-Region: us1
```

Twilio scopes limits per account + region, allowing higher limits for regional endpoints without a global quota.

### Anti-Patterns

1. **Emitting `X-RateLimit-*` headers only on 429 responses.** Headers emitted only on throttled responses prevent clients from implementing proactive throttling. The client's first signal of approaching the limit is the 429 itself — at which point the request has already been rejected. Emit rate limit headers on every response.

2. **`X-RateLimit-Reset` as a relative delay in seconds.** The `X-RateLimit-Reset` header (de facto standard) is conventionally an absolute Unix timestamp. Using a relative delay (seconds until reset) is inconsistent with GitHub, Twitter, and Stripe implementations and will break clients that parse it as an absolute timestamp. The IETF draft standard uses a relative delay — but that is a different header name (`RateLimit-Reset`). Do not mix the two conventions.

3. **Omitting `Retry-After` from 429 responses.** A 429 without `Retry-After` tells the client it has been throttled but not when it can retry. The client must implement exponential backoff with jitter to avoid thundering herd behavior. `Retry-After` makes the retry safe and deterministic. `Retry-After` is a MUST in RFC 6585 for 429 responses when the server knows the reset time.

4. **Different `X-RateLimit-Reset` semantics across endpoints.** Using Unix timestamps for some endpoints and relative delays for others within the same API creates parsing complexity in clients. Standardize on one format — preferably Unix timestamp for the `X-RateLimit-*` headers — and document it clearly.

## Details

### Client-Side Proactive Throttling

A well-implemented API client reads `X-RateLimit-Remaining` and `X-RateLimit-Reset` on every response and slows down before hitting the limit. A simple proactive strategy: when `X-RateLimit-Remaining` drops below 10% of `X-RateLimit-Limit`, insert a delay between requests equal to `(X-RateLimit-Reset - now) / X-RateLimit-Remaining`. This spreads the remaining quota evenly across the remaining window, preventing a burst at the end that triggers 429 errors. Octokit (GitHub's official SDK) implements this pattern natively, making rate limit management transparent to SDK consumers.

### Concurrent Request Challenges

Rate limit headers reflect the server's view at the time the response is sent. In a distributed system, multiple concurrent requests may be in flight simultaneously, all returning `X-RateLimit-Remaining: 50` — but each consuming quota. The client-side view of remaining quota is always stale by the number of in-flight requests. High-concurrency clients should track in-flight request count and subtract it from the server-reported remaining value to get a more accurate estimate of true remaining capacity.

### Real-World Case Study: Twitter API Rate Limit Header Adoption

Twitter's v1.1 API introduced `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` in 2012, and the pattern spread rapidly across the API industry. Before standardized headers, developers had to scrape error message text to determine when a rate limit would reset, leading to fragile string-parsing logic in client libraries. Twitter's headers enabled a generation of Twitter client libraries to implement reliable rate limit tracking. When Twitter moved to API v2, they maintained the same header names for backward compatibility — demonstrating that once a rate limit header contract is published, changing it imposes migration costs on every consumer's client library.

## Source

- [IETF draft-ietf-httpapi-ratelimit-headers](https://ietf-wg-httpapi.github.io/ratelimit-headers/)
- [RFC 6585 — Additional HTTP Status Codes (429 Too Many Requests)](https://datatracker.ietf.org/doc/html/rfc6585)
- [GitHub Rate Limit Headers Documentation](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [RFC 6648 — Deprecating the "X-" Prefix in Application Protocols](https://datatracker.ietf.org/doc/html/rfc6648)
- [Stripe Rate Limiting Headers](https://stripe.com/docs/rate-limits)

## Process

1. Emit `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` (Unix timestamp) on every API response — not only on 429.
2. Add `Retry-After` (seconds until reset) to every 429 response; compute it as `X-RateLimit-Reset - current_unix_time`.
3. For APIs with multiple quota dimensions, add `X-RateLimit-Resource` to identify which quota pool the response consumes.
4. Add `RateLimit-Policy` header when adopting the IETF draft format to enable machine-readable quota policy discovery.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-rate-limiting, api-retry-guidance, api-http-methods

## Success Criteria

- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` are present on every API response, including successful 200 responses.
- Every 429 response includes `Retry-After` with a value equal to the seconds until the rate limit window resets.
- `X-RateLimit-Reset` uses a consistent format (Unix timestamp) across all endpoints in the API.
- APIs with multiple quota pools use `X-RateLimit-Resource` to distinguish which limit is being reported.
- Client SDK documentation explains how to read rate limit headers and implement proactive throttling.
