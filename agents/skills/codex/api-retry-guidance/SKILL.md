# API Retry Guidance

> RETRY GUIDANCE SIGNALS CLIENTS WHEN AND HOW TO RETRY FAILED REQUESTS — CLASSIFYING ERRORS AS TRANSIENT OR PERMANENT, EMITTING Retry-After HEADERS, AND REQUIRING IDEMPOTENCY FOR SAFE RETRIES PREVENTS BOTH THUNDERING-HERD AMPLIFICATION AND UNNECESSARY REQUEST ABANDONMENT UNDER TEMPORARY LOAD.

## When to Use

- Designing rate-limiting responses that tell clients exactly when to retry
- Reviewing a `503 Service Unavailable` response that lacks a `Retry-After` header
- Choosing whether to return `429 Too Many Requests` or `503 Service Unavailable` for capacity-related refusals
- Implementing exponential backoff with jitter in a client SDK or HTTP middleware
- Classifying error responses in a client library as retryable vs. non-retryable
- Building a job queue or background worker that must handle transient downstream failures
- Documenting retry behavior expectations in an API style guide or SLA
- Implementing circuit-breaker logic that needs authoritative signals from the server to open and reset

## Instructions

### Key Concepts

1. **Transient vs. permanent errors** — A transient error is a temporary condition that may resolve without client-side changes: network timeout, service overload, brief database unavailability. A permanent error will not resolve on retry without action: invalid credentials, missing resource, malformed request. Retrying a permanent error wastes resources and delays diagnosis. Classifying errors correctly in the response allows clients to decide immediately whether to retry. As a rule: `4xx` errors (except `429`) are permanent — they require the client to change the request. `5xx` errors (except `501`) are potentially transient — the server, not the request, is the problem.

2. **`Retry-After` header** — The HTTP standard header that tells clients when they may safely retry a request. It accepts two formats:
   - **Integer (seconds):** `Retry-After: 60` — retry after 60 seconds from now.
   - **HTTP-date:** `Retry-After: Fri, 11 Apr 2026 09:00:00 GMT` — retry after this absolute timestamp.
     `Retry-After` is mandatory for `429 Too Many Requests` and strongly recommended for `503 Service Unavailable`. Servers that omit it on `429` responses leave clients to implement their own backoff, producing unpredictable retry storms.

3. **Exponential backoff** — A retry strategy where the wait time doubles after each failed attempt: 1s, 2s, 4s, 8s, 16s, up to a configured maximum. Exponential backoff reduces the probability that all retrying clients hit the server at the same moment. The base interval and multiplier should be configurable. Backoff should respect the `Retry-After` header as a floor — never retry before the server-specified delay, regardless of the computed backoff value.

4. **Jitter** — Randomization added to the backoff interval to desynchronize retry storms. Without jitter, all clients that received the same `429` at the same moment compute the same retry interval and submit simultaneously. With full jitter (`sleep(random_between(0, computed_backoff))`), retries are spread across the backoff window, dramatically reducing peak retry load. AWS's builders library recommends "decorrelated jitter" as the most effective pattern for high-concurrency workloads.

5. **`429 Too Many Requests` vs `503 Service Unavailable`** — These are commonly confused:
   - `429` — The server is healthy, but this client has exceeded its rate limit. The server can still serve other clients. The issue is client-specific. Retry after `Retry-After` elapses; the same client will succeed if the rate is respected.
   - `503` — The server is temporarily unavailable to all clients. The issue is server-wide: maintenance, overload, deployment in progress. Retry after `Retry-After` elapses; success is not guaranteed even after waiting (the outage may continue). Use `503` for circuit-breaker open states; use `429` for rate limiting.

### Worked Example

AWS API Gateway rate-limiting and retry patterns in production:

**Rate limit exceeded (429 with Retry-After):**

```http
GET /v1/metrics?start=2026-01-01&end=2026-04-01
Authorization: Bearer tok_...
```

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 30
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1744271400

{
  "type": "https://api.example.com/errors/rate-limit-exceeded",
  "title": "Rate Limit Exceeded",
  "status": 429,
  "detail": "You have exceeded 100 requests per minute. Retry after 30 seconds.",
  "instance": "/errors/correlation/f1a2-b3c4",
  "limit": 100,
  "remaining": 0,
  "reset": 1744271400
}
```

The client reads `Retry-After: 30` and waits at least 30 seconds. `X-RateLimit-Reset` provides the absolute timestamp for clients that prefer UTC synchronization. The body echoes the policy for logging and debugging.

**Service temporarily unavailable (503 with Retry-After):**

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/problem+json
Retry-After: 120

{
  "type": "https://api.example.com/errors/service-unavailable",
  "title": "Service Temporarily Unavailable",
  "status": 503,
  "detail": "The service is undergoing scheduled maintenance. Expected recovery in 2 minutes.",
  "instance": "/errors/correlation/d5e6-f7a8"
}
```

**Exponential backoff with jitter (pseudo-code):**

```python
import random, time

def retry_with_backoff(fn, max_attempts=5, base_delay=1.0, max_delay=60.0):
    for attempt in range(max_attempts):
        response = fn()
        if response.status_code not in (429, 503):
            return response  # success or permanent error — stop retrying

        # Respect server-specified Retry-After as a floor
        retry_after = float(response.headers.get("Retry-After", 0))

        # Compute exponential backoff with full jitter
        computed = min(base_delay * (2 ** attempt), max_delay)
        jittered = random.uniform(0, computed)

        wait = max(retry_after, jittered)
        time.sleep(wait)

    raise MaxRetriesExceeded(f"Failed after {max_attempts} attempts")
```

The critical line is `wait = max(retry_after, jittered)` — the server's `Retry-After` is always respected as a minimum, and jitter is added on top of it to desynchronize concurrent retrying clients.

### Anti-Patterns

1. **Omitting `Retry-After` from `429` responses.** Without `Retry-After`, clients have no authoritative signal for when to retry. Common outcomes: aggressive retrying every few hundred milliseconds (worsening the rate-limit breach), or backing off so conservatively that legitimate requests are delayed for minutes. Fix: always include `Retry-After` on `429` responses, set to the actual reset window in seconds.

2. **Retrying `4xx` errors other than `429`.** A `400`, `401`, `403`, `404`, or `422` response will not succeed on retry without a change to the request. Retrying them wastes quota, delays error propagation, and produces confusing logs. Fix: only retry on `429` (rate limit) and `5xx` (server fault) responses. All other `4xx` codes should surface as immediate errors to the caller.

3. **Exponential backoff without jitter.** Synchronized backoff (all clients waiting exactly 2, 4, 8 seconds) produces retry bursts at each interval boundary. If 1000 clients all received `503` at the same moment, they will all retry at T+2s, T+4s, T+8s — each interval triggers a new overload spike. Fix: add randomized jitter to desynchronize the retry distribution across the backoff window.

4. **Using `503` for per-client rate limiting.** Returning `503 Service Unavailable` when a specific client exceeds its rate limit misleads other clients (and monitoring systems) into thinking the server is globally down. It also prevents clients from distinguishing "my rate limit" from "server outage" — different actions are required. Fix: use `429` for client-specific rate limits and `503` for server-wide unavailability.

## Details

### Idempotency Requirement for Safe Retries

Retrying a request that is not idempotent may produce duplicate side effects: a charge processed twice, a message sent twice, a record created twice. Before implementing retry logic, classify the endpoint:

- **Safe and idempotent:** `GET`, `HEAD`, `OPTIONS` — retry freely.
- **Idempotent by HTTP semantics:** `PUT`, `DELETE` — retry is safe if the server implements idempotency correctly.
- **Not inherently idempotent:** `POST` — requires explicit idempotency keys (see `api-idempotency-keys`) to retry safely.

Clients must never retry a `POST` without an idempotency key unless the server documents that the endpoint is safe to re-invoke (e.g., a pure query wrapped in POST).

### Circuit Breaker Integration

Server-side `Retry-After` signals can drive client-side circuit breakers. When consecutive `503` responses arrive with `Retry-After` headers, the circuit breaker should open for at least the server-specified duration. When the `Retry-After` window expires, a single probe request determines whether to close the circuit. This prevents the thundering-herd problem where all clients simultaneously probe the recovering service.

### Real-World Case Study: Stripe Retry Design

Stripe's client libraries implement a retry strategy that the Stripe engineering team has published: up to 2 automatic retries on `429` and `5xx` responses, with exponential backoff starting at 0.5 seconds and capped at 2 seconds, with `Retry-After` honored as a floor. Stripe found in production analysis that the combination of (a) emitting accurate `Retry-After` values, (b) client jitter, and (c) idempotency keys on all mutating requests reduced duplicate charge incidents by over 95% compared to client implementations that retried blindly on any error. The key insight: the server's `Retry-After` signal is the coordination mechanism that transforms a retry storm into a smooth recovery curve.

## Source

- [Timeouts, Retries, and Backoff with Jitter — AWS Builders' Library](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [RFC 9110 — HTTP Semantics, Section 10.2.3 (Retry-After)](https://rfc-editor.org/rfc/rfc9110#section-10.2.3)
- [Stripe — Error Handling and Retries](https://stripe.com/docs/error-handling)
- [Google Cloud — Exponential Backoff](https://cloud.google.com/storage/docs/retry-strategy)
- [Microsoft Azure — Transient Fault Handling](https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults)

## Process

1. Classify all error responses as transient (`429`, `5xx`) or permanent (`4xx` except `429`) and document the classification in the API reference.
2. Add `Retry-After` headers to all `429` responses, set to the actual rate-limit reset window in seconds.
3. Add `Retry-After` headers to `503` responses when the expected recovery time is known; omit when the outage duration is unknown.
4. Ensure all `POST` endpoints that may be retried support idempotency keys (see `api-idempotency-keys`).
5. Run `harness validate` to confirm skill files are well-formed and cross-references are correct.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-rate-limit-headers, api-idempotency-keys, api-status-codes, api-error-contracts

## Success Criteria

- All `429` responses include a `Retry-After` header set to the rate-limit reset window in seconds.
- `429` is used for client-specific rate limits; `503` is used for server-wide unavailability — never interchanged.
- Client retry logic only retries on `429` and `5xx` responses; `4xx` errors (except `429`) are surfaced immediately.
- Retry implementations include jitter to desynchronize concurrent retry storms.
- Non-idempotent `POST` endpoints require idempotency keys before retries are safe.
