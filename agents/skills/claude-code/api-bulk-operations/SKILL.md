# Bulk Operations

> BULK ENDPOINTS AMORTIZE PER-REQUEST OVERHEAD ACROSS MANY OPERATIONS IN A SINGLE HTTP CALL — BUT THE REAL DESIGN CHALLENGE IS WHAT TO RETURN WHEN SOME OPERATIONS SUCCEED AND OTHERS FAIL: TRANSACTIONAL SEMANTICS ROLL BACK EVERYTHING ON ANY ERROR WHILE BEST-EFFORT SEMANTICS COMMIT SUCCESSES AND REPORT FAILURES INDIVIDUALLY, AND CHOOSING THE WRONG MODEL PRODUCES SILENT DATA CORRUPTION OR WASTED RETRIES.

## When to Use

- Designing an import endpoint that creates or updates hundreds of records from a CSV upload
- Implementing a bulk delete for a UI that allows multi-select and mass removal
- Building a notification service that sends messages to thousands of recipients in a single API call
- Reducing the number of round trips for a client that must create 50 resources sequentially
- Reviewing a PR that loops over individual create/update/delete endpoints in a batch job
- Choosing between all-or-nothing transaction semantics and best-effort per-item semantics for a batch endpoint
- Adding `Idempotency-Key` support to a bulk create endpoint that may be retried on network failure
- Designing partial failure responses and deciding which HTTP status code to return when some items fail

## Instructions

### Key Concepts

1. **Bulk Create, Update, and Delete** — A bulk endpoint accepts an array of operation items in the request body and executes them as a collection. The three primary patterns are:
   - **Bulk create:** `POST /resources/bulk` with a body `{"items": [...]}` creates multiple resources in one request.
   - **Bulk update:** `PATCH /resources/bulk` applies a set of patch operations to multiple existing resources.
   - **Bulk delete:** `DELETE /resources/bulk` with a body listing resource IDs, or `POST /resources/bulk-delete` for clients that cannot send DELETE bodies.

2. **Transactional vs. Best-Effort Semantics** — This is the most consequential design decision for a bulk endpoint:
   - **Transactional:** All items are applied in a single database transaction. If any item fails validation or encounters an error, the entire batch is rolled back. The response is either `200 OK` (all succeeded) or `422 Unprocessable Entity` / `400 Bad Request` (none were applied, with per-item errors). Use this when partial application would leave data in an inconsistent state.
   - **Best-effort:** Each item is applied independently. Successes are committed; failures are reported per-item. The response uses `207 Multi-Status` with a per-item result array. Use this when partial success is acceptable (e.g., sending notifications — some succeed, others fail) and callers can retry only the failed items.

3. **207 Multi-Status Response** — When using best-effort semantics, return `207 Multi-Status` with a body that maps each input item to an individual status code and optional error detail:

   ```json
   {
     "results": [
       { "index": 0, "status": 201, "id": "res_001" },
       {
         "index": 1,
         "status": 422,
         "error": { "code": "validation_failed", "message": "name is required" }
       },
       { "index": 2, "status": 201, "id": "res_003" }
     ]
   }
   ```

   The outer HTTP status is `207` regardless of how many items failed. Never return `200 OK` for a best-effort batch where some items failed — it misleads callers into thinking all items succeeded.

4. **Idempotency-Key on Bulk Endpoints** — A bulk create endpoint that fails mid-way through leaves the caller uncertain about which items were created. Re-submitting the full batch without an idempotency key will duplicate items. Accept an `Idempotency-Key` header on bulk create and bulk update endpoints. Store the key with a short TTL and replay the previous response on a duplicate submission. For best-effort batches, the idempotency key covers the entire batch — if the batch partially succeeded and the client retries with the same key, replay the original (partial success) response rather than re-executing.

5. **Request Size Limits** — Impose an explicit maximum on the number of items per batch and the total request body size in bytes. Document both limits. Common limits: 100–1,000 items per batch, 5–10 MB body size. Requests exceeding these limits should return `413 Content Too Large` (body size) or `400 Bad Request` (item count) with the limits stated in the error body. Do not silently truncate the input.

6. **Ordering and Dependency** — Document whether the items in a bulk request are processed in order and whether later items may depend on earlier ones (e.g., bulk create where item 2 references the ID of item 1). Most bulk endpoints treat items as independent and process them in unspecified order. If ordering matters, process sequentially in input order and stop on first failure (transactional) or continue and report each failure (best-effort).

### Worked Example

Stripe's Bulk operations pattern via the Batch API demonstrates the design of a transactional batch using per-operation result codes:

**Bulk create price and product in a single batch call:**

```http
POST /v1/batch
Content-Type: application/json
Authorization: Bearer sk_live_...
Idempotency-Key: batch_20240315_import_001

{
  "requests": [
    {
      "method": "POST",
      "url": "/v1/products",
      "body": "name=Widget+Pro&description=Our+flagship+product"
    },
    {
      "method": "POST",
      "url": "/v1/prices",
      "body": "product=prod_abc&unit_amount=2999&currency=usd"
    }
  ]
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "results": [
    {
      "status": 200,
      "body": {
        "id": "prod_abc123",
        "object": "product",
        "name": "Widget Pro"
      }
    },
    {
      "status": 200,
      "body": {
        "id": "price_xyz789",
        "object": "price",
        "unit_amount": 2999,
        "currency": "usd",
        "product": "prod_abc123"
      }
    }
  ]
}
```

**Bulk delete with best-effort semantics (207 Multi-Status):**

```http
POST /api/v1/messages/bulk-delete
Content-Type: application/json
Authorization: Bearer token_...

{
  "ids": ["msg_001", "msg_002", "msg_003"]
}
```

```http
HTTP/1.1 207 Multi-Status
Content-Type: application/json

{
  "results": [
    { "id": "msg_001", "status": 204 },
    { "id": "msg_002", "status": 404, "error": { "code": "not_found", "message": "Message not found" } },
    { "id": "msg_003", "status": 204 }
  ],
  "summary": { "succeeded": 2, "failed": 1 }
}
```

### Anti-Patterns

1. **Returning `200 OK` when some items in a best-effort batch failed.** A `200 OK` response signals complete success to HTTP clients, middleware, and monitoring systems. If item 3 of 10 failed and the response is `200 OK`, automated retry logic and dashboards will not flag the failure. Return `207 Multi-Status` for any best-effort batch response that contains a mixture of success and failure, or `422`/`400` for a transactional batch that failed entirely.

2. **Silently truncating batches that exceed the size limit.** If a client sends 500 items and the server's limit is 100, silently processing only the first 100 and returning success causes the caller to believe all 500 were processed. The remaining 400 items are silently dropped. Always validate the item count before processing and return `400 Bad Request` with the limit in the error body if exceeded.

3. **Applying transactional semantics to operations that cannot be rolled back.** If a bulk endpoint sends emails, charges cards, or triggers external webhooks as each item is processed, these side effects cannot be rolled back when a later item fails. Applying transactional semantics implies rollback is possible. Use best-effort semantics for operations with irreversible external side effects, document the semantics clearly, and design callers to handle partial success.

4. **Omitting per-item indexing in the error response.** A `207` response that lists errors without correlating them to the input items forces callers to guess which items failed. Always include the input index (0-based or 1-based, consistently) or the input item's client-provided ID in every result entry. This allows callers to retry only the failed items without re-submitting the entire batch.

## Details

### Choosing Transactional vs. Best-Effort

| Factor                          | Transactional                         | Best-Effort                         |
| ------------------------------- | ------------------------------------- | ----------------------------------- |
| Data consistency requirement    | Strong — all or nothing               | Eventual — partial success OK       |
| External side effects           | None or fully reversible              | Possible; cannot be rolled back     |
| Retry behavior                  | Client retries full batch             | Client retries failed items only    |
| Response status on partial fail | `400`/`422` — nothing applied         | `207` — successes committed         |
| Database transaction            | Single transaction                    | Per-item transactions               |
| Use cases                       | Financial ledger, referential imports | Notifications, bulk tag application |

### Idempotency Key Scope for Bulk

When a client retries a bulk request with the same `Idempotency-Key`:

- **Transactional batch that fully succeeded:** Replay the original `200 OK` response. Do not re-execute.
- **Transactional batch that fully failed:** Re-execute (the original transaction was rolled back; no state change occurred).
- **Best-effort batch:** Replay the original `207` response. Do not re-execute any item, including failed items. The client should re-submit only the failed items with a new idempotency key.

### Real-World Case Study: Mailchimp Batch API

Mailchimp's `/3.0/batches` endpoint processes bulk subscriber list updates asynchronously. Synchronous per-subscriber API calls for a 10,000-subscriber import produced approximately 35 minutes of sequential HTTP round trips from clients with standard connection limits. After migrating to the batch API, the same 10,000-subscriber import completed in under 90 seconds — a 23x throughput improvement. The batch API uses best-effort semantics and returns an operation ID immediately; clients poll `GET /3.0/batches/{batch_id}` for completion and retrieve a per-item error report from a signed S3 URL included in the completed batch response.

## Source

- [Stripe Batch API](https://stripe.com/docs/api/bulk)
- [RFC 4918 — HTTP Extensions for WebDAV (207 Multi-Status)](https://www.rfc-editor.org/rfc/rfc4918#section-13)
- [Mailchimp Batch Operations](https://mailchimp.com/developer/marketing/api/batch-operations/)
- [Microsoft Graph Batch Requests](https://learn.microsoft.com/en-us/graph/json-batching)
- [Stripe Idempotency Keys](https://stripe.com/docs/api/idempotent_requests)

## Process

1. Decide on semantics: transactional (all-or-nothing, single DB transaction, return `400`/`422` on any failure) or best-effort (per-item commit, return `207 Multi-Status` with per-item results). Document the choice in the API reference.
2. Define and enforce request limits: maximum item count, maximum body size in bytes. Return `413 Content Too Large` or `400 Bad Request` with limits in the error body for violations.
3. Add `Idempotency-Key` header support. Store the key with the full response and TTL. On duplicate submission, replay the stored response without re-executing.
4. Implement per-item result reporting: every result entry must include the input index or client-provided ID, the HTTP status for that item, and for failures, a machine-readable error code and human-readable message.
5. For best-effort batches with external side effects (email, webhooks, charges), document that failed items are not retried by the server and callers are responsible for resubmitting failures.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-idempotency-keys, api-error-contracts, api-http-methods, api-status-codes

## Success Criteria

- Bulk endpoints with best-effort semantics return `207 Multi-Status`, never `200 OK`, when any item fails.
- Per-item results in `207` responses include the input index or client-provided ID for every item, success or failure.
- Request size limits (item count and body bytes) are enforced and documented; violations return `400`/`413` with the limit values in the error body.
- Bulk create and bulk update endpoints accept and honor `Idempotency-Key` headers; duplicate submissions replay the stored response without re-executing.
- API documentation explicitly states whether semantics are transactional or best-effort for every bulk endpoint.
