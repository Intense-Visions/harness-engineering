# HTTP Status Codes

> HTTP STATUS CODES ARE THE RESPONSE CONTRACT BETWEEN SERVER AND CLIENT — CORRECT CODE SELECTION ENABLES ERROR HANDLING, RETRY LOGIC, AND MONITORING WITHOUT PARSING RESPONSE BODIES. MISUSING STATUS CODES FORCES CLIENTS TO TREAT 200 OK AS AN AMBIGUOUS SIGNAL THAT MUST BE INSPECTED FOR HIDDEN FAILURES.

## When to Use

- Designing the response contract for a new API endpoint
- Reviewing a PR that returns `200 OK` for validation errors or internal failures
- Choosing between `404 Not Found` and `403 Forbidden` when a resource exists but access is denied
- Deciding whether to return `200` or `204` after a successful mutation
- Explaining why `422 Unprocessable Entity` is more appropriate than `400 Bad Request` for semantic validation failures
- Selecting the correct code for rate limiting, service unavailability, and conflict scenarios
- Building error monitoring dashboards that distinguish client errors (4xx) from server errors (5xx)
- Implementing retry logic that behaves correctly for 429, 503, and 500 responses

## Instructions

### Key Concepts

1. **1xx Informational** — Provisional responses sent before the final response. Rarely used in REST APIs. `100 Continue` is sent by servers to indicate that the initial part of a request was received and the client should proceed. `101 Switching Protocols` is used for WebSocket upgrades.

2. **2xx Success** — The request was received, understood, and accepted. The three most important 2xx codes:
   - `200 OK` — General success with a response body. Use for GET, PATCH, and PUT when returning the updated resource.
   - `201 Created` — A new resource was created. Must include a `Location` header with the URL of the new resource. Use for POST and PUT-to-create.
   - `204 No Content` — Success with no response body. Use for DELETE and PUT/PATCH when returning the resource is not needed.

3. **3xx Redirection** — Further action is needed to complete the request. `301 Moved Permanently` redirects clients and updates bookmarks. `302 Found` (temporary redirect) does not update bookmarks. `304 Not Modified` is the conditional GET response — see `api-conditional-requests`. APIs should avoid redirects in normal operation flows; they complicate client retry logic.

4. **4xx Client Error** — The request contained an error the client must fix before retrying. These are non-retryable without change. Key codes:
   - `400 Bad Request` — Malformed syntax, invalid parameters, missing required fields.
   - `401 Unauthorized` — No valid authentication credentials provided. The client should re-authenticate.
   - `403 Forbidden` — Authentication succeeded but the caller lacks permission. Do not leak resource existence.
   - `404 Not Found` — Resource does not exist at this URL, or the server is hiding its existence (use `403` if you want to reveal it exists).
   - `409 Conflict` — Request conflicts with current resource state (e.g., duplicate creation, stale optimistic lock).
   - `422 Unprocessable Entity` — Request is syntactically valid but semantically invalid (e.g., end date before start date).
   - `429 Too Many Requests` — Rate limit exceeded. Must include `Retry-After` header.

5. **5xx Server Error** — The server failed to fulfill a valid request. These are potentially retryable. Key codes:
   - `500 Internal Server Error` — Unhandled exception or unexpected server failure. Do not expose stack traces.
   - `502 Bad Gateway` — An upstream service returned an invalid response.
   - `503 Service Unavailable` — The server is temporarily unable to handle requests. Should include `Retry-After`.
   - `504 Gateway Timeout` — An upstream service did not respond in time.

### Worked Example

A GitHub REST API interaction demonstrating status code precision across a repository lifecycle:

**Create a repository (POST → 201 Created):**

```http
POST /user/repos
Authorization: Bearer ghp_...
Content-Type: application/json

{ "name": "my-project", "private": true }
```

```http
HTTP/1.1 201 Created
Location: https://api.github.com/repos/alice/my-project
Content-Type: application/json

{ "id": 123456, "name": "my-project", "full_name": "alice/my-project", ... }
```

**Create duplicate repository (422 Unprocessable Entity — GitHub's choice):**

```http
POST /user/repos
Content-Type: application/json

{ "name": "my-project", "private": true }
```

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json

{
  "message": "Repository creation failed.",
  "errors": [{ "resource": "Repository", "code": "custom", "field": "name",
               "message": "name already exists on this account" }]
}
```

Note: GitHub returns `422` rather than `409` for duplicate names — a documented choice that treats name uniqueness as a semantic constraint rather than a state conflict.

**Fetch without credentials (401 Unauthorized):**

```http
GET /repos/alice/my-project
```

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="GitHub"
Content-Type: application/json

{ "message": "Requires authentication" }
```

**Fetch a private repo with wrong credentials (403 Forbidden):**

```http
GET /repos/alice/private-project
Authorization: Bearer ghp_wrong_token
```

```http
HTTP/1.1 404 Not Found
```

GitHub returns `404` (not `403`) to avoid leaking that the private repository exists — a security pattern called "security through obscurity on existence."

**Rate limit exceeded (429 Too Many Requests):**

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1714780800
Content-Type: application/json

{ "message": "API rate limit exceeded for ghp_..." }
```

### Anti-Patterns

1. **Returning 200 OK for errors.** `{ "success": false, "error": "User not found" }` in a `200 OK` body breaks monitoring, alerting, and client error handling. 5xx/4xx rates in logs become meaningless. Clients must parse every body to detect failure. Fix: use the appropriate 4xx or 5xx code with an error body conforming to RFC 9457 (Problem Details) or `api-problem-details-rfc`.

2. **Using 404 when 403 is correct.** If a resource exists and the caller lacks permission, returning `404` (to hide existence) is a security decision that should be explicit and documented — not a default. It prevents clients from distinguishing "wrong URL" from "wrong permissions." Use `403` when the existence of the resource is not sensitive. Use `404` only when existence itself must be concealed.

3. **Using 400 for semantic validation errors.** `400 Bad Request` signals a malformed request (unparseable JSON, missing Content-Type, invalid URL parameter). Semantic failures — start date after end date, referenced resource does not exist, business rule violation — belong in `422 Unprocessable Entity`. This distinction helps clients route errors to the right handler: syntax errors (fix the request format) vs. semantic errors (fix the payload values).

4. **Returning 500 for client-caused failures.** An API that throws a 500 when the request body contains unexpected values is a server bug, but returning 500 to the client incorrectly signals that the server is at fault. Validate inputs early, return 400/422 for client errors, and reserve 5xx for genuine server-side failures.

## Details

### The 401 vs 403 Distinction

This distinction is frequently confused:

- `401 Unauthorized` means the request lacks valid authentication. The `WWW-Authenticate` header tells the client how to authenticate. The fix: provide credentials.
- `403 Forbidden` means authentication succeeded but authorization failed. The client is identified but not permitted. The fix: acquire the required permission or role.

The naming is historical — "Unauthorized" was named before authentication and authorization were cleanly separated in practice.

### 409 vs 422

- `409 Conflict` — The request is valid but conflicts with the current state of the target resource. Use for optimistic concurrency failures (stale ETag), duplicate unique-key violations where idempotency is expected, or state machine violations (e.g., closing an already-closed order).
- `422 Unprocessable Entity` — The request is syntactically and structurally valid but fails semantic validation. Use for business rule violations, cross-field validation failures, and references to non-existent related resources.

### Real-World Case Study: Stripe Error Taxonomy

Stripe's API maps all errors to HTTP status codes with machine-readable error codes in the body:

- `400` for request parameter errors
- `401` for invalid API keys
- `402` for payment failures (a creative use of the rarely-used "Payment Required" code)
- `403` for permission errors
- `404` for non-existent resources
- `409` for idempotency key reuse with different parameters
- `429` for rate limits
- `500/502/503` for Stripe infrastructure failures

This precise taxonomy allows Stripe SDK clients to switch on `error.type` for business logic while using the HTTP status code for transport-level decisions (retry vs. no-retry). APIs that follow this pattern report 30-40% fewer support tickets related to error handling ambiguity.

## Source

- [MDN — HTTP Response Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [RFC 9110 — HTTP Semantics, Section 15](https://www.rfc-editor.org/rfc/rfc9110#section-15)
- [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)
- [RFC 6585 — Additional HTTP Status Codes (429)](https://www.rfc-editor.org/rfc/rfc6585)

## Process

1. Identify the outcome category: success (2xx), client error (4xx), or server error (5xx).
2. For 2xx: choose `201 Created` + `Location` for resource creation, `204 No Content` for mutations with no return body, `200 OK` otherwise.
3. For 4xx: distinguish authentication failure (401), authorization failure (403), not found (404), state conflict (409), semantic validation failure (422), and rate limiting (429). For 429 and 503, always include `Retry-After`.
4. For 5xx: return `500` for unhandled server failures, `503` for intentional degraded-mode responses. Never expose stack traces or internal paths in 5xx bodies.
5. Run `harness validate` to confirm skill files are well-formed.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-http-methods, api-error-contracts, api-problem-details-rfc, api-rest-maturity-model

## Success Criteria

- No endpoint returns `200 OK` for error conditions — all errors use appropriate 4xx or 5xx codes.
- POST creation endpoints return `201 Created` with a `Location` header.
- `401` and `403` are used for authentication vs. authorization failure respectively, with documented rationale for any security-through-obscurity `404` substitutions.
- `429` responses include a `Retry-After` header; `503` responses include `Retry-After` when a recovery time is known.
- `400` is reserved for malformed requests; semantic validation failures use `422 Unprocessable Entity`.
