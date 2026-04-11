# API Idempotency Keys

> IDEMPOTENCY KEYS ARE A SAFETY CONTRACT — THEY ALLOW CLIENTS TO SAFELY RETRY FAILED OR AMBIGUOUS REQUESTS WITHOUT RISK OF DUPLICATE SIDE EFFECTS, AND THE DIFFERENCE BETWEEN AT-LEAST-ONCE AND EXACTLY-ONCE SEMANTICS IS ENTIRELY DETERMINED BY WHETHER THE SERVER STORES AND ENFORCES IDEMPOTENCY KEY UNIQUENESS WITHIN THE CONFIGURED TTL WINDOW.

## When to Use

- Designing mutation endpoints (POST, PATCH, DELETE) that perform financial transactions, order creation, or other non-idempotent operations
- Adding retry-safe semantics to an API that currently requires clients to manually deduplicate responses
- Writing the idempotency section of an API style guide or developer portal
- Auditing an existing API for missing idempotency support on operations where duplicate execution causes financial or data integrity harm
- Implementing client-side retry logic and needing to generate and attach idempotency keys correctly
- Building a distributed system where network partitions can cause ambiguous request outcomes

## Instructions

### Key Concepts

1. **Idempotency key generation (UUID v4)** — Clients generate a UUID v4 before sending a mutation request and include it in the `Idempotency-Key` request header. UUID v4 provides sufficient entropy (122 random bits) to make collisions negligible at any realistic request volume. The client stores the key alongside the pending request; if the request times out or returns a network error, the client retries with the same key. The server uses the key to detect the retry and return the cached result of the original execution without re-executing the operation. Example: `Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000`.

2. **Server-side key storage and TTL** — The server stores a mapping from idempotency key to response: `{ key, request_hash, response_status, response_body, created_at }`. On receiving a request, the server checks the key store before executing the operation. If the key exists and the request hash matches, return the stored response immediately. The TTL for the key store is conventionally 24 hours — long enough to cover client retry windows but short enough to prevent unbounded storage growth. Stripe uses 24 hours; document your TTL so clients know how long they can safely retry.

3. **At-least-once vs. exactly-once semantics** — An idempotency key implementation achieves **exactly-once** semantics for the server-side operation: the underlying business logic (charge, create, transfer) executes at most once per unique key. Delivery to the client remains **at-least-once**: the client may receive the response multiple times (original + retries). Clients must handle receiving the same success response on multiple retries — this is expected behavior, not an error. Document this distinction explicitly: "The operation executes exactly once; you may receive the success response more than once."

4. **Request fingerprinting and key misuse detection** — When the server receives a key it has seen before but with a different request body (different amount, different recipient, etc.), it must return a 422 Unprocessable Entity error — not re-execute with the new parameters. This prevents a class of bugs where clients reuse keys across logically different operations. Store a hash of the original request body alongside the key and compare on each retry. Stripe returns HTTP 422 with `"error.type": "idempotency_error"` when a key is reused with a different request body.

5. **Safe retry scope — which operations need idempotency keys** — Idempotency keys are required for operations that are not naturally idempotent: POST (create), DELETE with side effects, PATCH with non-idempotent transformations (e.g., `increment amount by 10`). GET, HEAD, and PUT (full replacement) are naturally idempotent and do not require idempotency keys. Clearly document which endpoints accept the `Idempotency-Key` header, and return 400 if the header is sent to an endpoint that does not support it to prevent clients from incorrectly believing they have idempotency protection on GET requests.

6. **Concurrent request handling** — Two requests with the same idempotency key that arrive simultaneously (before the first has completed) must be handled safely. The standard pattern is to use the key as a distributed lock: the first request acquires the lock and executes; concurrent requests with the same key return 409 Conflict ("A request with this idempotency key is currently in progress") until the lock is released and the result is cached. This prevents double-execution from parallel retries.

### Worked Example

**Stripe payment intent creation with idempotency key**

Client generates a UUID v4 before the request:

```http
POST /v1/payment_intents
Authorization: Bearer sk_live_xxx
Content-Type: application/x-www-form-urlencoded
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

amount=2000&currency=usd&payment_method=pm_xxx&confirm=true
```

First execution — Stripe charges the card and returns:

```http
HTTP/1.1 200 OK
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "id": "pi_3OxQ5xLkdIwHu7ix1",
  "object": "payment_intent",
  "amount": 2000,
  "currency": "usd",
  "status": "succeeded"
}
```

Network timeout — client retries with the same key:

```http
POST /v1/payment_intents
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

amount=2000&currency=usd&payment_method=pm_xxx&confirm=true
```

Stripe detects the duplicate key, returns the cached response — the card is **not** charged again:

```http
HTTP/1.1 200 OK
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Stripe-Should-Retry: false

{
  "id": "pi_3OxQ5xLkdIwHu7ix1",
  "status": "succeeded"
}
```

Key reuse with different body — Stripe returns 422:

```http
POST /v1/payment_intents
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

amount=5000&currency=usd&payment_method=pm_yyy&confirm=true
```

```http
HTTP/1.1 422 Unprocessable Entity

{
  "error": {
    "type": "idempotency_error",
    "message": "Keys for idempotent requests can only be used with the same parameters they were first used with."
  }
}
```

**Server-side key store schema (PostgreSQL):**

```sql
CREATE TABLE idempotency_keys (
  key           UUID PRIMARY KEY,
  request_hash  CHAR(64) NOT NULL,           -- SHA-256 of normalized request body
  response_status  SMALLINT NOT NULL,
  response_body    JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

CREATE INDEX ON idempotency_keys (expires_at);  -- for TTL cleanup job
```

### Anti-Patterns

1. **Generating a new key on every retry attempt.** The entire purpose of an idempotency key is that the same key is sent on all retry attempts for a single logical operation. Generating a new UUID on each retry means each attempt is treated as a new, independent operation — no deduplication occurs. Generate the key once, before the first attempt, and store it alongside the request state until the operation is confirmed complete.

2. **Using non-unique key generation strategies.** Using a hash of the request body as the idempotency key creates false sharing: two different users who happen to create an order for the same amount at the same time will collide on the key and one will receive the other's cached response. Idempotency keys must be globally unique and client-generated — UUID v4 is the correct approach. Request body hashes are appropriate only as a secondary tamper-detection fingerprint, not as the key itself.

3. **Accepting the header on GET requests.** Advertising that GET endpoints support `Idempotency-Key` creates a false sense of safety. GET requests are inherently idempotent and the header has no effect. Clients who include the key on a GET request may believe they have protection they do not. Return 400 if the header is sent to an endpoint that does not support idempotency keys, or simply document clearly which endpoints accept it.

4. **No TTL on the key store.** Without expiration, the key store grows unboundedly. A key from 6 months ago will never be retried; keeping it consumes storage and increases lookup time. Set a TTL (24 hours is the standard), implement a background cleanup job, and document the TTL so clients know the safe retry window.

## Details

### Idempotency Key Implementation Patterns

**Redis-based implementation** is common for high-throughput APIs: the key is stored as a Redis hash with a 24-hour TTL. The `SET NX PX` command (set if not exists, with expiry) provides atomic key reservation, handling the concurrent request race condition without a separate locking step. If `SET NX` returns nil, the key is already in use — return 409.

**Database-based implementation** (PostgreSQL `INSERT ... ON CONFLICT DO NOTHING`) is more durable and suitable for financial APIs where key store loss would be catastrophic. The trade-off is higher write latency than Redis.

**Key header naming:** The `Idempotency-Key` header name is the emerging standard (Stripe, PayPal, Adyen). Some older APIs use `X-Idempotency-Key` or `X-Request-ID`. Prefer `Idempotency-Key` for new APIs. The IETF draft `draft-ietf-httpapi-idempotency-key-header` standardizes this header.

### Real-World Case Study: Stripe Idempotency Keys in Practice

Stripe's idempotency key implementation handles tens of millions of payment operations per day. Their published guidance documents two categories of failures that idempotency keys address:

1. **Client-side timeout** — The client sends a charge request, the network call times out before a response arrives. Was the charge applied? The client cannot know. Without idempotency keys, the client must choose between potentially double-charging (retry without key) or abandoning the transaction (no retry). With idempotency keys, the client retries safely.

2. **Server-side processing failure** — The charge API accepted the request but a downstream processing error caused it to fail after partial execution. Stripe uses idempotency keys internally to ensure that a failed partial execution is detected and the clean result (either success or failure) is returned consistently on retry.

Stripe's measured outcome: introducing idempotency keys reduced duplicate charge support tickets by over 95% within the first year of the feature's availability.

## Source

- [Stripe — Idempotent Requests](https://stripe.com/docs/api/idempotent_requests)
- [IETF draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)
- [PayPal — Idempotency](https://developer.paypal.com/api/rest/requests/#link-paypalrequestidheader)
- [Adyen — Idempotency Keys](https://docs.adyen.com/development-resources/api-idempotency/)
- [Google API Design Guide — Idempotency](https://google.aip.dev/155)

## Process

1. Generate a UUID v4 idempotency key on the client before the first request attempt; persist the key alongside the pending operation state until a definitive outcome (success or terminal failure) is received.
2. Attach the key in the `Idempotency-Key` request header on all attempts for the same logical operation; never reuse a key for a different operation.
3. On the server, look up the key in the key store before executing; if found with matching request hash, return the cached response; if found with different request hash, return 422; if not found, execute and store the result with a 24-hour TTL.
4. Implement concurrent request protection using atomic key reservation (Redis `SET NX` or database `INSERT ON CONFLICT DO NOTHING`); return 409 if the key is actively in use.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-http-methods, events-idempotency-pattern, api-bulk-operations, api-retry-guidance

## Success Criteria

- Mutation endpoints that create or modify resources with side effects accept and enforce the `Idempotency-Key` header.
- The server returns the cached response (not a new execution) when a key is retried within the TTL window with a matching request body.
- The server returns 422 when a key is reused with a different request body.
- The key store has a documented 24-hour TTL; a cleanup process removes expired keys.
- Client documentation explains that the operation executes at most once but the success response may be received multiple times on retry.
