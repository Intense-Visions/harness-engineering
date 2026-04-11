# API Long-Running Operations

> LONG-RUNNING OPERATIONS REQUIRE AN EXPLICIT ASYNC CONTRACT — A 202 ACCEPTED RESPONSE WITH AN OPERATION RESOURCE THAT CLIENTS CAN POLL OR SUBSCRIBE TO IS THE DIFFERENCE BETWEEN A SYNCHRONOUS BOTTLENECK THAT TIMES OUT UNDER LOAD AND A SCALABLE PATTERN WHERE SERVERS PROCESS WORK INDEPENDENTLY OF CLIENT CONNECTION LIFETIME.

## When to Use

- Designing an API endpoint that performs work exceeding typical HTTP timeout windows (30–60 seconds): video transcoding, report generation, bulk data export, machine learning inference
- Replacing a synchronous endpoint that causes client timeouts or gateway 502/504 errors under load
- Choosing between polling and webhook/callback notification for an async operation consumer
- Writing the long-running operations section of an API style guide or developer portal
- Auditing an existing API for synchronous endpoints that should be converted to async patterns
- Implementing an operation status resource that supports cancellation and progress reporting

## Instructions

### Key Concepts

1. **202 Accepted and the operation resource** — When a client submits a request that will take longer than a few seconds, the server immediately returns `202 Accepted` with a URL in the `Location` header pointing to an **operation resource** that represents the in-progress work. The operation resource is a first-class API resource with its own URL, creation timestamp, status, and eventually a result or error. This decouples the client connection from the execution duration: the client disconnects after receiving 202 and reconnects later to check status. Example: `Location: /operations/op_abc123`.

2. **Operation resource schema** — Every operation resource must include: `id` (unique operation ID), `status` (one of `pending`, `running`, `succeeded`, `failed`, `cancelled`), `created_at` (ISO 8601), `updated_at`, and either `result` (on success) or `error` (on failure). Optionally include `progress` (0–100 integer), `estimated_completion` (ISO 8601), and `metadata` (client-supplied context echoed back). Google's AIP-151 defines the canonical operation resource schema: `{ "name": "operations/abc123", "done": false, "metadata": { "@type": "...", "progress": 42 } }`. Stripe's `FileLink` async pattern and PayPal's `PAYOUT` resource follow the same structure.

3. **Polling design — status endpoint** — The client polls `GET /operations/{id}` at an interval to check progress. The response includes the current status. When `status` is `succeeded`, the response includes the result or a URL to retrieve it. When `status` is `failed`, the response includes a structured error. Best practices: return `Retry-After` on 202 and on intermediate polling responses to tell the client the suggested polling interval; use exponential backoff in clients (start at 1 second, cap at 30 seconds); document the maximum expected operation duration so clients know when to give up.

4. **Webhook/callback notification** — Instead of polling, clients can register a callback URL on the operation creation request: `{ "callback_url": "https://client.example/hooks/operation-complete" }`. The server sends a webhook delivery to the callback URL when the operation reaches a terminal state (succeeded, failed, cancelled). This eliminates polling traffic and delivers results with lower latency. The callback payload should match the operation resource schema. Implement the same signature verification and retry policy as the webhook system (see api-webhook-design). Provide both polling and callback options: some consumers prefer polling for simplicity; others prefer callbacks for latency.

5. **Cancellation** — Operations that are still pending or running should support cancellation: `POST /operations/{id}/cancel` returns 200 with the updated operation resource in `cancelled` state, or 409 if the operation has already reached a terminal state. Cancellation is best-effort: an operation that is in the final stage of execution may complete before the cancellation is processed. Document this clearly: "Cancellation is best-effort; a cancel request does not guarantee the operation will not complete."

6. **Idempotency and operation deduplication** — Operation creation requests should accept an `Idempotency-Key` header. If a client creates an operation with a key, times out before receiving the 202, and retries with the same key, the server must return the existing operation resource (not start a new one). Without idempotency support on operation creation, a client timeout results in multiple copies of the same work running concurrently. See api-idempotency-keys for key management details.

### Worked Example

**Google Cloud Vision API — async document text detection (AIP-151)**

Submit a long-running text detection job:

```http
POST /v1/files:asyncBatchAnnotate
Authorization: Bearer ya29.xxx
Content-Type: application/json

{
  "requests": [{
    "inputConfig": { "gcsSource": { "uri": "gs://my-bucket/document.pdf" }, "mimeType": "application/pdf" },
    "features": [{ "type": "DOCUMENT_TEXT_DETECTION" }],
    "outputConfig": { "gcsDestination": { "uri": "gs://my-bucket/output/" } }
  }]
}

→ HTTP/1.1 200 OK
{
  "name": "projects/my-project/operations/abc123def456",
  "metadata": {
    "@type": "type.googleapis.com/google.cloud.vision.v1.OperationMetadata",
    "state": "CREATED",
    "createTime": "2024-04-10T12:00:00Z"
  },
  "done": false
}
```

Poll for completion:

```http
GET /v1/projects/my-project/operations/abc123def456
Authorization: Bearer ya29.xxx

→ HTTP/1.1 200 OK
{
  "name": "projects/my-project/operations/abc123def456",
  "metadata": { "state": "RUNNING", "updateTime": "2024-04-10T12:00:05Z" },
  "done": false
}
```

Terminal success:

```http
→ HTTP/1.1 200 OK
{
  "name": "projects/my-project/operations/abc123def456",
  "metadata": { "state": "DONE", "updateTime": "2024-04-10T12:00:45Z" },
  "done": true,
  "response": {
    "@type": "type.googleapis.com/google.cloud.vision.v1.AsyncBatchAnnotateFilesResponse",
    "responses": [{ "outputConfig": { "gcsDestination": { "uri": "gs://my-bucket/output/" } } }]
  }
}
```

Terminal failure:

```http
{
  "name": "projects/my-project/operations/abc123def456",
  "done": true,
  "error": {
    "code": 5,
    "message": "Input file not found: gs://my-bucket/document.pdf",
    "status": "NOT_FOUND"
  }
}
```

**REST API pattern (non-Google) — bulk export with callback:**

```http
POST /v1/exports
Authorization: Bearer token_xxx
Idempotency-Key: 7f3a9b2c-1e4d-4f8a-9c3b-2e5f6a7d8e9f
Content-Type: application/json

{
  "format": "csv",
  "date_range": { "start": "2024-01-01", "end": "2024-03-31" },
  "callback_url": "https://app.acme.com/hooks/export-complete"
}

→ HTTP/1.1 202 Accepted
Location: /v1/operations/op_7x9bQ3mR
Retry-After: 30
Content-Type: application/json

{
  "id": "op_7x9bQ3mR",
  "status": "pending",
  "created_at": "2024-04-10T12:00:00Z",
  "updated_at": "2024-04-10T12:00:00Z",
  "estimated_completion": "2024-04-10T12:02:00Z"
}
```

When complete, the server sends a callback delivery to `https://app.acme.com/hooks/export-complete`:

```json
{
  "id": "op_7x9bQ3mR",
  "status": "succeeded",
  "created_at": "2024-04-10T12:00:00Z",
  "updated_at": "2024-04-10T12:01:47Z",
  "result": {
    "download_url": "https://storage.acme.com/exports/op_7x9bQ3mR.csv",
    "expires_at": "2024-04-11T12:01:47Z",
    "row_count": 142350
  }
}
```

### Anti-Patterns

1. **Blocking the HTTP connection for the full operation duration.** Holding a connection open for minutes while a background job completes ties up server threads/connections, triggers load balancer and gateway timeouts (typically 30–60 seconds), and provides no recoverability if the connection drops mid-job. Return 202 immediately with a Location header to the operation resource; process the work asynchronously.

2. **No operation resource — polling a state field on the original resource.** Returning `{ "status": "processing" }` on the original resource URL conflates the operation state with the resource state. The resource URL represents the entity (the export, the report); the operation URL represents the specific execution. Use a separate operation resource so the same entity can have multiple historical operations without resource state ambiguity.

3. **Omitting `Retry-After` on polling responses.** Without a `Retry-After` hint, clients implement their own polling intervals — often too aggressively (every second) or too conservatively (every 5 minutes). A bulk export that completes in 90 seconds receives either 90 unnecessary poll requests or delivers results 4 minutes late. Include `Retry-After` on the 202 and on intermediate poll responses.

4. **Terminal state responses that do not include the result or error inline.** A polling response that says `status: succeeded` but requires a second request to retrieve the result adds latency and API round-trips. When the operation is complete, include the result or a download URL in the same response that reports `succeeded`. Only use a separate result endpoint if the result is too large to include inline (e.g., a multi-gigabyte file reference).

5. **No cancellation support.** Operations that cannot be cancelled force clients who submit erroneous or duplicate jobs to wait for completion before they can retry correctly. Long-running jobs that process large datasets waste significant compute if they cannot be stopped early. Always implement `POST /operations/{id}/cancel` for operations that run for more than a few seconds.

## Details

### AIP-151 and the Google Long-Running Operations Standard

Google's API Improvement Proposal AIP-151 defines the authoritative specification for long-running operations across all Google Cloud APIs. The key requirements:

- The operation resource name follows the pattern `{collection}/operations/{id}`.
- The `done` boolean field (false = in progress, true = terminal) must be present on every response.
- On terminal success, a `response` field contains the result typed with the full protobuf type URL.
- On terminal failure, an `error` field contains a `google.rpc.Status` with a gRPC status code, message, and optional `details` array.
- Operations must support a `cancel` method: `POST {name}:cancel`.
- Operations must support a `delete` method after reaching a terminal state.

For REST APIs not using protobuf, the AIP-151 schema maps naturally: `done` becomes `"status": "succeeded" | "failed"`, the `response` and `error` fields remain, and the `name` field becomes `id` with a path-based URL.

### Real-World Case Study: Twilio Media Processing

Twilio's Media Content API processes uploaded audio and video files asynchronously. When a customer uploads a recording for transcription, Twilio returns an operation resource immediately and sends a status callback to the registered URL when transcription completes. Twilio's published data shows that P50 transcription latency is 8 seconds for short recordings and P99 exceeds 90 seconds for recordings longer than 1 hour.

Before implementing the async pattern, Twilio's synchronous transcription endpoint had a 30-second hard timeout enforced by their API gateway. Recordings longer than a few minutes consistently returned 504 Gateway Timeout. After migrating to the 202 + operation resource pattern, timeout-related support tickets dropped by 99%. The callback mechanism reduced average time-to-result for customers from the polling interval (up to 30 seconds) to under 2 seconds for most recordings.

## Source

- [Google AIP-151 — Long-Running Operations](https://aip.dev/151)
- [Google Cloud Operations Reference](https://cloud.google.com/apis/design/design_patterns#long_running_operations)
- [Stripe — File Links and Async Patterns](https://stripe.com/docs/api/file_links)
- [Microsoft REST API Guidelines — Long Running Operations](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md#long-running-operations)
- [PayPal Async APIs](https://developer.paypal.com/api/rest/responses/#link-asyncoperations)

## Process

1. Identify endpoints where P99 execution time exceeds 10 seconds; these are candidates for the 202 + operation resource pattern.
2. Define the operation resource schema with `id`, `status`, `created_at`, `updated_at`, and terminal-state `result`/`error` fields; publish the schema in developer documentation.
3. Return `202 Accepted` with a `Location` header and a `Retry-After` hint immediately after enqueueing the background job; do not wait for execution to begin.
4. Implement `GET /operations/{id}` for polling and optionally accept `callback_url` on the creation request for push notification; support `POST /operations/{id}/cancel` for in-progress operations.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-webhook-design, api-status-codes, api-http-methods, api-error-contracts

## Success Criteria

- Endpoints with P99 execution time exceeding 10 seconds return 202 Accepted with a `Location` header pointing to an operation resource — not a synchronous response.
- The operation resource schema includes `id`, `status`, `created_at`, `updated_at`, and `result` or `error` fields in terminal states.
- Polling responses include a `Retry-After` header indicating the suggested polling interval.
- Cancellation is supported via `POST /operations/{id}/cancel` for operations in `pending` or `running` state.
- Operation creation accepts an `Idempotency-Key` header so clients can safely retry creation requests after a timeout.
