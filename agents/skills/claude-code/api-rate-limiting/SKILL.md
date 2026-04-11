# API Rate Limiting

> RATE LIMIT DESIGN IS A CONSUMER CONTRACT — QUOTA TIERS, BURST ALLOWANCES, AND FAIR-USE POLICIES SET EXPECTATIONS THAT CLIENTS DEPEND ON FOR SLA PLANNING, AND SILENT THROTTLING WITHOUT CLEAR LIMITS FORCES CONSUMERS TO GUESS WHAT BEHAVIOR IS SAFE, PRODUCING FRAGILE INTEGRATIONS THAT FAIL UNPREDICTABLY UNDER LOAD.

## When to Use

- Designing the rate limiting strategy for a new public or partner API
- Auditing an existing API for missing or inconsistently applied rate limits
- Defining quota tiers for a developer platform with free, standard, and enterprise plans
- Deciding between per-user, per-app, and per-IP rate limit strategies for a multi-tenant API
- Writing the rate limiting section of an API style guide or developer documentation
- Responding to a fair-use violation or abuse incident that overwhelmed API infrastructure
- Implementing a grace period policy for consumers who temporarily exceed their quota

## Instructions

### Key Concepts

1. **Quota tiers as a consumer contract** — Rate limits are not internal implementation details — they are a published API contract that consumers use to architect their integrations. A consumer building a bulk processing pipeline needs to know their sustained limit to plan batch sizes; a consumer building an interactive UI needs to know their burst limit to avoid throttling during usage spikes. Publish quota tiers in the developer documentation alongside the endpoint reference: requests per second (burst), requests per minute (sustained), requests per day (quota), and the tier they apply to (free, standard, enterprise).

2. **Burst vs. sustained limits** — Burst limits govern short-window spike behavior (e.g., 100 requests per second for up to 10 seconds). Sustained limits govern longer-window averages (e.g., 1,000 requests per minute). A consumer sending 100 req/s for 30 seconds violates the sustained limit even if each individual second is within the burst limit. Model both windows explicitly; token bucket algorithms handle burst naturally while sliding window counters are better for sustained enforcement. The combination prevents both micro-burst abuse and sustained overconsumption.

3. **Per-user vs. per-app limits** — Per-user limits apply to the authenticated end user's token; per-app limits apply to the OAuth2 client ID or API key regardless of which user. Most public APIs apply both: per-user limits protect against individual users monopolizing shared capacity; per-app limits protect against a single application's code error cascading into abuse. GitHub applies both: each user has a personal rate limit, and each OAuth2 App has a separate per-app limit that does not draw from the user's personal quota.

4. **Fair-use policy and quota negotiation** — Document what constitutes fair use of the API alongside the rate limits. Enterprise customers with higher-volume requirements should have a documented process for quota negotiation — a support request or a self-service upgrade flow that adjusts their tier. Undocumented hard limits that cannot be negotiated push high-volume consumers toward workarounds (multiple accounts, IP rotation) that are harder to manage than legitimate quota increases.

5. **Grace period and soft throttling** — First-time limit violations should return a 429 response with a `Retry-After` header and a clear error message explaining which limit was hit. Repeat violations within a short window may trigger longer cool-down periods. Provide a grace period (e.g., allow 10% overage before throttling) to prevent rate limit errors from cascading during legitimate traffic spikes. Hard kills at the exact quota boundary cause consumer SLA violations for traffic that is slightly bursty but globally within acceptable use.

6. **Exemptions and allowlists** — Internal services, monitoring systems, and health check endpoints must be exempted from rate limits. A health check that returns 429 will cause orchestrators to restart healthy instances. Rate limit exemptions should be encoded in the gateway configuration, not in business logic, and audited regularly to prevent credential drift.

### Worked Example

**GitHub REST API rate limiting** is the most-documented public API rate limit design and serves as a reference for the per-user + per-app model.

**Authenticated user limits:**

```http
GET /repos/octocat/Hello-World
Authorization: Bearer ghp_xxx

→ HTTP/1.1 200 OK
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 4999
X-RateLimit-Reset: 1704070800
X-RateLimit-Used: 1
X-RateLimit-Resource: core
```

Authenticated users receive 5,000 requests/hour for core API endpoints. Search endpoints have a separate 30 requests/minute limit. GraphQL has 5,000 points/hour with a cost model.

**Rate limit exceeded — 429 response:**

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1704070800
Retry-After: 3600
Content-Type: application/json

{
  "message": "API rate limit exceeded for user ID 12345.",
  "documentation_url": "https://docs.github.com/rest/overview/rate-limits"
}
```

**OAuth2 App per-app limits — separate quota pool:**

GitHub OAuth2 Apps receive up to 12,500 requests/hour per authenticated user (higher than PAT limits), and the app has its own rate limit pool for unauthenticated requests. The separation means a single user's PAT exhaustion does not affect other users accessing the same app.

**Quota tier comparison (Google Maps Platform pattern):**

| Tier       | Requests/day | Burst (req/s) | Negotiable |
| ---------- | ------------ | ------------- | ---------- |
| Free       | 25,000       | 10            | No         |
| Standard   | 100,000      | 50            | No         |
| Enterprise | 1,000,000+   | 500           | Yes        |

### Anti-Patterns

1. **Undocumented rate limits.** Applying rate limits that are not published in developer documentation forces consumers to discover them through 429 errors in production. Consumers cannot architect around limits they do not know exist. Publish all limits — burst, sustained, per-user, per-app — before the API is available to external consumers.

2. **Silent throttling (200 with degraded responses).** Returning 200 OK with empty or truncated responses instead of 429 when limits are exceeded hides the throttling from consumers. Their monitoring shows no errors; their data is silently incomplete. Always return 429 with a `Retry-After` header so consumers can detect and respond to throttling explicitly.

3. **No per-resource differentiation.** Applying a single rate limit across all endpoints ignores the cost differential between a `GET /users/1` (memory lookup, microseconds) and a `POST /exports` (full database scan, seconds). Expensive operations should have lower individual limits; cheap operations can have higher limits. Treating all endpoints identically under-protects expensive endpoints and over-restricts cheap ones.

4. **Rate limiting without `Retry-After`.** A 429 response without a `Retry-After` or `X-RateLimit-Reset` header forces consumers to implement exponential backoff blind — they cannot know when it is safe to retry. Always include the reset time so consumers can sleep precisely until the window resets rather than backing off with jitter.

## Details

### Rate Limit Algorithms

**Token bucket:** A bucket holds up to `capacity` tokens; tokens are added at rate `r` per second. Each request consumes one token. Burst is handled naturally — a full bucket allows a burst of `capacity` requests before throttling kicks in. Redis-based token bucket implementations (e.g., `redis-cell`) are widely used for distributed rate limiting. Best for burst-tolerant APIs where short spikes are acceptable.

**Sliding window counter:** Track request counts in a rolling time window (last 60 seconds). More accurate than fixed windows for preventing the "window boundary burst" — where a client sends requests at the end of one window and the start of the next, doubling their effective rate. Costlier to implement than fixed windows; Redis sorted sets with timestamps as members implement sliding windows efficiently.

**Fixed window counter:** Simplest algorithm — count requests in fixed time windows (e.g., the current minute). Subject to boundary bursts but predictable for consumers: limits reset at the top of each window, which is easy to document and reason about. GitHub uses fixed hourly windows; the reset time is published in `X-RateLimit-Reset`.

### Real-World Case Study: Stripe Rate Limiting and the Test Mode Exception

Stripe applies rate limits in live mode (100 requests/second per account by default, negotiable) but applies more generous limits in test mode to avoid blocking automated test suites. The distinction — different limits for different operational contexts — reflects a product insight: developer experience in test mode determines API adoption, and throttling test suites is a friction point that slows integration work. Stripe also applies per-endpoint cost multipliers for expensive operations (e.g., search endpoints have 3x cost per request). Customers who need higher live-mode limits can request a quota increase through Stripe's dashboard. This combination of documented defaults, test mode exceptions, and a quota negotiation flow covers the full range of consumer types without requiring manual intervention for standard integrations.

## Source

- [Google API Design Guide — Rate Limiting](https://cloud.google.com/apis/design/design_patterns#rate_limiting)
- [GitHub REST API Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [Stripe Rate Limiting Documentation](https://stripe.com/docs/rate-limits)
- [IETF draft-ietf-httpapi-ratelimit-headers](https://ietf-wg-httpapi.github.io/ratelimit-headers/)
- [OWASP API Security — API4:2023 Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)

## Process

1. Define quota tiers (free, standard, enterprise) with burst, sustained, and daily limits before any endpoint work begins; publish them in developer documentation.
2. Apply rate limits at the API gateway layer, not in individual service business logic, so limits are enforced consistently regardless of which service handles the request.
3. Return 429 responses with `Retry-After` and `X-RateLimit-Reset` headers on every throttled request; include a `documentation_url` pointing to the rate limit reference.
4. Implement per-resource cost weights for expensive endpoints (search, export, bulk); lighter endpoints can share a higher shared pool.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-rate-limit-headers, owasp-rate-limiting, api-retry-guidance, api-authentication-patterns

## Success Criteria

- All rate limits (burst, sustained, daily) are published in developer documentation before the API is available externally.
- Every 429 response includes `Retry-After` and at least one `X-RateLimit-*` header indicating the reset time.
- Per-user and per-app limits are applied separately; a single user's limit exhaustion does not affect other users of the same application.
- Expensive endpoints (search, export) have lower individual limits than cheap endpoints (simple lookups).
- A quota negotiation process exists for enterprise consumers who require limits above the published maximums.
