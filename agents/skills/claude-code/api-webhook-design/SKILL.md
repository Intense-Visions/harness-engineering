# API Webhook Design

> WEBHOOKS ARE A PUSH-BASED CONTRACT — REGISTRATION, PAYLOAD SCHEMA, DELIVERY GUARANTEES, AND RETRY POLICIES ARE ALL CONSUMER-FACING COMMITMENTS THAT DETERMINE WHETHER INTEGRATIONS REMAIN RELIABLE UNDER PARTIAL FAILURES, AND DESIGNING THESE PROPERTIES EXPLICITLY UPFRONT PREVENTS AN AD-HOC SYSTEM THAT FAILS SILENTLY AT THE WORST POSSIBLE MOMENT.

## When to Use

- Designing the webhook system for a new platform API that needs to notify external consumers of events
- Auditing an existing webhook implementation for missing retry logic, payload versioning, or delivery guarantees
- Deciding between at-least-once and exactly-once delivery and documenting the implications for consumers
- Implementing fan-out from a single internal event to multiple registered subscriber endpoints
- Writing the webhook reference section of a developer portal or API style guide
- Responding to a consumer report of missed webhook deliveries or ordering anomalies
- Adding webhook support to an existing REST API without disrupting current consumers

## Instructions

### Key Concepts

1. **Webhook registration and lifecycle** — Consumers register a publicly reachable HTTPS endpoint (the "webhook URL") with the provider, along with an event type filter (e.g., `payment.succeeded`, `order.created`). The registration should store: the endpoint URL, the event types subscribed, a shared signing secret, and metadata for auditing (created by, created at). Provide a management API or dashboard UI to create, list, test, pause, and delete registrations. GitHub's webhook management API (`POST /repos/{owner}/{repo}/hooks`) is the canonical reference: consumers can subscribe per-repository, per-organization, or at the App level.

2. **Payload design and versioning** — Every webhook payload must include: an `id` (unique delivery ID for deduplication), an `event` field (event type string), a `created` timestamp (ISO 8601), an `api_version` field (the schema version that generated the payload), and a `data` object (the event subject). Never omit the `api_version` — consumers need it to route the payload to the correct handler when you introduce breaking schema changes. Stripe's payload envelope is the industry standard: `{ "id": "evt_xxx", "object": "event", "api_version": "2024-04-10", "created": 1712800000, "type": "payment_intent.succeeded", "data": { "object": { ... } } }`.

3. **At-least-once delivery and consumer idempotency** — Webhook systems guarantee at-least-once delivery by design: a delivery is considered successful only when the consumer returns a 2xx response within the timeout window (typically 5–30 seconds). Any non-2xx response or timeout triggers a retry. Consequently, consumers will occasionally receive the same event more than once. Document this guarantee explicitly, and instruct consumers to use the delivery `id` field as an idempotency key to deduplicate retried deliveries. Never promise exactly-once delivery unless you have a distributed transaction mechanism backing it.

4. **Retry policy with exponential backoff** — Failed deliveries (non-2xx or timeout) must be retried with exponential backoff: attempt 1 at T+1 min, attempt 2 at T+5 min, attempt 3 at T+30 min, attempt 4 at T+2 h, attempt 5 at T+5 h. After the maximum retry count (commonly 5–10 attempts over 24–72 hours), mark the delivery as failed and optionally surface an alert to the webhook owner. GitHub retries for 3 days with exponential backoff. Stripe retries for 3 days across up to 17 attempts with escalating intervals.

5. **Ordering guarantees and fan-out** — Webhooks are not guaranteed to arrive in the order events occurred. Network and retry interactions can invert order. Tell consumers to use the `created` timestamp to establish event ordering rather than arrival order. For fan-out (one internal event dispatched to N registered endpoints), use an async queue per subscriber so a slow or failing subscriber cannot block delivery to other subscribers. Each subscriber's queue is independent; backpressure on one does not affect others.

6. **Endpoint health and circuit breaking** — Track consecutive delivery failures per endpoint. After a configurable threshold (e.g., 5 consecutive failures or >50% failure rate over 1 hour), automatically pause the endpoint and notify the webhook owner. A paused endpoint stops receiving new deliveries; the owner must investigate and re-enable it. Sending to a consistently failing endpoint wastes resources and can cause queue buildup. GitHub auto-disables webhooks that fail for 7 consecutive days.

### Worked Example

**GitHub Webhooks — repository push event**

Register a webhook on a repository:

```http
POST /repos/acme/payments/hooks
Authorization: Bearer ghp_xxx
Content-Type: application/json

{
  "name": "web",
  "active": true,
  "events": ["push", "pull_request"],
  "config": {
    "url": "https://ci.acme.com/hooks/github",
    "content_type": "json",
    "secret": "s3cr3t_abc123",
    "insecure_ssl": "0"
  }
}

→ HTTP/1.1 201 Created
{
  "id": 12345678,
  "type": "Repository",
  "active": true,
  "events": ["push", "pull_request"],
  "config": { "url": "https://ci.acme.com/hooks/github", "content_type": "json" },
  "created_at": "2024-04-10T12:00:00Z"
}
```

Incoming delivery payload:

```json
{
  "ref": "refs/heads/main",
  "before": "abc123",
  "after": "def456",
  "repository": { "id": 99887766, "name": "payments", "full_name": "acme/payments" },
  "pusher": { "name": "alice", "email": "alice@acme.com" },
  "commits": [{ "id": "def456", "message": "fix: handle nil pointer in checkout" }]
}
```

Delivery headers:

```http
X-GitHub-Event: push
X-GitHub-Delivery: 72d3162e-cc78-11e3-81ab-4c9367dc0958
X-Hub-Signature-256: sha256=abc123...
```

Consumer responds with `200 OK` and an empty body — GitHub marks the delivery as successful. The `X-GitHub-Delivery` UUID is the idempotency key consumers use to deduplicate retries.

**Fan-out architecture:**

```
Internal Event Bus
      │
      ▼
  Dispatcher Service
      │
  ┌───┴───────────────────────┐
  ▼                           ▼
Queue: endpoint-A         Queue: endpoint-B
  │                           │
  ▼                           ▼
Worker → POST /hook/A     Worker → POST /hook/B
```

Each subscriber queue is independent. A 30-second timeout on endpoint-B does not delay endpoint-A's delivery.

### Anti-Patterns

1. **Synchronous delivery in the request path.** Firing the webhook HTTP call synchronously during the transaction that generated the event couples event delivery latency to the consumer's endpoint response time. A slow consumer endpoint (or network partition) can cause your transaction to time out or roll back. Always dispatch webhook deliveries asynchronously via a queue after the originating transaction commits.

2. **No delivery `id` in the payload.** Without a unique delivery identifier, consumers cannot implement idempotency. Every retry looks identical to the first delivery. The consumer has no reliable way to detect or handle duplicates. Include a UUID delivery ID in every payload regardless of whether the consumer currently uses it.

3. **Fixed retry interval (no backoff).** Retrying at a fixed 1-minute interval after a consumer endpoint goes down hammers the endpoint with traffic exactly when it is least able to respond — during an outage or deployment. Exponential backoff with jitter reduces thundering-herd behavior and gives the consumer time to recover before the next attempt.

4. **Delivering to HTTP endpoints.** Allowing webhook registrations to plain HTTP (non-TLS) URLs exposes the payload — which may contain sensitive business data — to network interception. Require HTTPS for all webhook URLs and reject registrations that specify HTTP. Surface a clear validation error: `"config.url must use HTTPS"`.

5. **No test delivery mechanism.** Consumers integrating a webhook system need a way to trigger a test delivery without generating a real event. Without it, they must create real objects in production to test their handler. Provide a `POST /hooks/{id}/test` endpoint that sends a sample payload and returns the delivery result.

## Details

### Payload Envelope Standardization

A consistent payload envelope across all event types reduces the cognitive load on consumers who handle multiple event types. The envelope fields (`id`, `event`, `created`, `api_version`, `data`) are stable; only `data` varies by event type. This pattern enables consumers to write generic middleware that extracts the envelope before routing to event-specific handlers.

Consider publishing a JSON Schema or OpenAPI schema for each event type's `data` payload. Stripe publishes event object schemas in their OpenAPI spec; consumers can generate typed client models from them. When you evolve a payload (rename a field, add a required property), bump `api_version` and publish a changelog.

### Real-World Case Study: Stripe Webhook Reliability

Stripe processes billions of webhook deliveries per month. Their published reliability figures show that >99.9% of events are delivered within 30 seconds on the first attempt under normal conditions. The remaining <0.1% are retried across up to 17 attempts over 72 hours. Stripe's key design decisions that achieve this:

1. Deliveries are enqueued after the originating database write commits — no synchronous delivery.
2. Per-endpoint queues prevent a single slow consumer from causing head-of-line blocking.
3. The `api_version` field in every payload is the API version at the time the event was created, not the current API version — consumers always receive the schema they integrated against.
4. Stripe's webhook dashboard shows delivery attempt history, response codes, response bodies, and the ability to replay any delivery — dramatically reducing consumer debugging time.

Outcome: Stripe's webhook retry architecture became the reference design for Twilio, GitHub, and most SaaS platforms that launched webhook support after 2015.

## Source

- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [GitHub Webhooks Documentation](https://docs.github.com/en/webhooks)
- [webhooks.fyi — Webhook Standards Reference](https://webhooks.fyi)
- [Google AIP-151 — Long-running Operations](https://aip.dev/151)
- [Standard Webhooks Specification](https://www.standardwebhooks.com)

## Process

1. Define the event catalog (event type strings, payload schemas, `api_version`) before implementing delivery infrastructure — consumers build against the schema.
2. Implement delivery as an async queue-based system; commit the event to the queue after the originating transaction commits, never inline.
3. Set per-subscriber independent queues for fan-out; configure retry policy with exponential backoff and a maximum attempt count (5–10 attempts over 24–72 hours).
4. Expose a `POST /hooks/{id}/test` endpoint and a delivery history dashboard so consumers can verify integration without generating real events.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-webhook-security, events-webhooks-pattern, api-idempotency-keys, api-long-running-operations

## Success Criteria

- Every webhook payload includes a unique delivery `id`, an `event` type string, a `created` timestamp, and an `api_version` field.
- Deliveries are dispatched asynchronously after the originating transaction commits; no synchronous delivery in the request path.
- The retry policy uses exponential backoff with a defined maximum attempt count and total retry window.
- Fan-out to multiple subscribers uses per-subscriber independent queues so one failing subscriber cannot block others.
- A test delivery mechanism (`POST /hooks/{id}/test`) is available for consumers to verify handler integration without generating real events.
