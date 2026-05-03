# Plan: Phase 2 — HTTP Semantics (api-\* Knowledge Skills)

**Date:** 2026-04-10
**Spec:** docs/changes/api-design-knowledge-skills/proposal.md
**Session:** changes--api-design-knowledge-skills--proposal
**Estimated tasks:** 11
**Estimated time:** 45 minutes

## Goal

Create 5 api-\* knowledge skills for the HTTP Semantics cluster across all 4 platforms (claude-code, gemini-cli, cursor, codex), validated and ready for use. These skills teach the HTTP protocol layer that sits on top of the REST Foundations cluster (Phase 1).

## Observable Truths (Acceptance Criteria)

1. Each of the 5 skills has a SKILL.md (150-250 lines) under `agents/skills/claude-code/<skill-id>/` with all 8 required sections: Intro Hook, When to Use, Instructions (Key Concepts + Worked Example + Anti-Patterns), Details, Source, Process, Harness Integration, Success Criteria.
2. Each of the 5 skills has a `skill.yaml` with `type: knowledge`, `tier: 3`, `cognitive_mode: advisory-guide`, `tools: []`, and all 4 platforms listed.
3. All 4 platforms (gemini-cli, cursor, codex) have identical SKILL.md files and equivalent skill.yaml files for all 5 skills (same content as claude-code; skill.yaml field order may vary slightly per platform convention).
4. When `harness validate` is run, it reports `validation passed` with no errors.
5. The cross-references `api-status-codes`, `api-http-methods`, `api-content-negotiation`, `api-http-caching`, `api-conditional-requests`, `api-idempotency-keys`, `api-error-contracts`, `api-versioning-header`, `perf-cdn-cache-control`, `db-optimistic-locking` all appear in `related_skills` of the appropriate skills.

## File Map

```
CREATE agents/skills/claude-code/api-http-methods/SKILL.md
CREATE agents/skills/claude-code/api-http-methods/skill.yaml
CREATE agents/skills/claude-code/api-status-codes/SKILL.md
CREATE agents/skills/claude-code/api-status-codes/skill.yaml
CREATE agents/skills/claude-code/api-content-negotiation/SKILL.md
CREATE agents/skills/claude-code/api-content-negotiation/skill.yaml
CREATE agents/skills/claude-code/api-http-caching/SKILL.md
CREATE agents/skills/claude-code/api-http-caching/skill.yaml
CREATE agents/skills/claude-code/api-conditional-requests/SKILL.md
CREATE agents/skills/claude-code/api-conditional-requests/skill.yaml
CREATE agents/skills/gemini-cli/api-http-methods/SKILL.md
CREATE agents/skills/gemini-cli/api-http-methods/skill.yaml
CREATE agents/skills/gemini-cli/api-status-codes/SKILL.md
CREATE agents/skills/gemini-cli/api-status-codes/skill.yaml
CREATE agents/skills/gemini-cli/api-content-negotiation/SKILL.md
CREATE agents/skills/gemini-cli/api-content-negotiation/skill.yaml
CREATE agents/skills/gemini-cli/api-http-caching/SKILL.md
CREATE agents/skills/gemini-cli/api-http-caching/skill.yaml
CREATE agents/skills/gemini-cli/api-conditional-requests/SKILL.md
CREATE agents/skills/gemini-cli/api-conditional-requests/skill.yaml
CREATE agents/skills/cursor/api-http-methods/SKILL.md
CREATE agents/skills/cursor/api-http-methods/skill.yaml
CREATE agents/skills/cursor/api-status-codes/SKILL.md
CREATE agents/skills/cursor/api-status-codes/skill.yaml
CREATE agents/skills/cursor/api-content-negotiation/SKILL.md
CREATE agents/skills/cursor/api-content-negotiation/skill.yaml
CREATE agents/skills/cursor/api-http-caching/SKILL.md
CREATE agents/skills/cursor/api-http-caching/skill.yaml
CREATE agents/skills/cursor/api-conditional-requests/SKILL.md
CREATE agents/skills/cursor/api-conditional-requests/skill.yaml
CREATE agents/skills/codex/api-http-methods/SKILL.md
CREATE agents/skills/codex/api-http-methods/skill.yaml
CREATE agents/skills/codex/api-status-codes/SKILL.md
CREATE agents/skills/codex/api-status-codes/skill.yaml
CREATE agents/skills/codex/api-content-negotiation/SKILL.md
CREATE agents/skills/codex/api-content-negotiation/skill.yaml
CREATE agents/skills/codex/api-http-caching/SKILL.md
CREATE agents/skills/codex/api-http-caching/skill.yaml
CREATE agents/skills/codex/api-conditional-requests/SKILL.md
CREATE agents/skills/codex/api-conditional-requests/skill.yaml
```

## Tasks

---

### Task 1: Create api-http-methods skill (claude-code)

**Depends on:** none
**Files:**

- `agents/skills/claude-code/api-http-methods/SKILL.md`
- `agents/skills/claude-code/api-http-methods/skill.yaml`

1. Create directory:

   ```bash
   mkdir -p /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/api-http-methods
   ```

2. Write `agents/skills/claude-code/api-http-methods/skill.yaml`:

   ```yaml
   name: api-http-methods
   version: '1.0.0'
   description: GET/POST/PUT/PATCH/DELETE semantics -- safety, idempotency, and correct method selection for REST APIs
   stability: static
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths: []
   related_skills:
     - api-status-codes
     - api-idempotency-keys
     - api-rest-maturity-model
     - api-resource-modeling
     - api-bulk-operations
   stack_signals:
     - rest
     - api
     - http
   keywords:
     - HTTP-methods
     - GET
     - POST
     - PUT
     - PATCH
     - DELETE
     - idempotency
     - safety
     - method-semantics
     - REST
   metadata:
     author: community
     upstream: www.rfc-editor.org/rfc/rfc9110#section-9
   state:
     persistent: false
     files: []
   depends_on: []
   ```

3. Write `agents/skills/claude-code/api-http-methods/SKILL.md`:

   ````markdown
   # HTTP Method Semantics

   > HTTP defines a small set of request methods — each with precise safety and idempotency guarantees. Selecting the correct method unlocks caching, safe retries, and standard tooling without any additional application logic.

   ## When to Use

   - Choosing between POST and PUT for a create-or-update endpoint
   - Deciding whether PATCH or PUT is appropriate for partial updates
   - Reviewing a PR that uses POST for an operation that should be idempotent
   - Explaining why GET must never have side effects
   - Designing a non-CRUD action (archive, approve, cancel) and choosing a method
   - Evaluating whether DELETE should return 200 or 204
   - Building retry logic and needing to know which methods are safe to retry

   ## Instructions

   ### Key Concepts

   RFC 9110 defines the semantics of each method along two axes:

   | Method  | Safe | Idempotent | Request Body | Typical Status Codes |
   | ------- | ---- | ---------- | ------------ | -------------------- |
   | GET     | Yes  | Yes        | No           | 200, 304, 404        |
   | HEAD    | Yes  | Yes        | No           | 200, 304, 404        |
   | POST    | No   | No         | Yes          | 201, 200, 202, 409   |
   | PUT     | No   | Yes        | Yes          | 200, 201, 204        |
   | PATCH   | No   | No\*       | Yes          | 200, 204, 409        |
   | DELETE  | No   | Yes        | Optional     | 200, 204, 404        |
   | OPTIONS | Yes  | Yes        | No           | 200, 204             |

   \*PATCH can be made idempotent with `If-Match` headers — see `api-conditional-requests`.

   **Safety** means the method does not alter server state. A client can call a safe method (GET, HEAD, OPTIONS) any number of times without risk. Crawlers, prefetch, and caches rely on this.

   **Idempotency** means repeating the same request produces the same server state. PUT and DELETE are idempotent — if a network failure hides the response, the client can safely retry. POST is not idempotent — a retry may create a duplicate resource unless you use idempotency keys (see `api-idempotency-keys`).

   **GET — Retrieve a resource**

   ```http
   GET /orders/817
   ```
   ````

   ```http
   HTTP/1.1 200 OK
   Content-Type: application/json
   ETag: "a1b2c3"

   { "id": 817, "status": "shipped", "total": 49.99 }
   ```

   GET never changes state. Responses are cacheable by default. Including a request body in GET is technically allowed by HTTP/1.1 but violates expectations of proxies, caches, and many HTTP libraries — never do it.

   **POST — Create a new resource or trigger a process**

   ```http
   POST /orders
   Content-Type: application/json

   { "items": [{ "sku": "W-42", "qty": 2 }] }
   ```

   ```http
   HTTP/1.1 201 Created
   Location: /orders/818
   Content-Type: application/json

   { "id": 818, "status": "pending", "total": 89.98 }
   ```

   POST is the only method where the server assigns the resource URL. Return `201 Created` with a `Location` header pointing to the new resource. For non-creation actions (e.g., triggering a report), return `200 OK` or `202 Accepted`.

   **PUT — Replace a resource entirely**

   ```http
   PUT /orders/818
   Content-Type: application/json

   { "id": 818, "items": [{ "sku": "W-42", "qty": 3 }], "status": "pending" }
   ```

   ```http
   HTTP/1.1 200 OK
   ```

   PUT replaces the entire resource representation. Any field not included in the request body is reset to its default or removed. PUT is idempotent — sending the same PUT twice produces the same result. If the resource does not exist, PUT may create it (return `201 Created`) or reject the request (return `404 Not Found`), depending on your API contract.

   **PATCH — Apply a partial update**

   ```http
   PATCH /orders/818
   Content-Type: application/merge-patch+json

   { "status": "cancelled" }
   ```

   ```http
   HTTP/1.1 200 OK
   ```

   PATCH modifies only the fields included in the request body. Use `application/merge-patch+json` (RFC 7396) for simple field replacement or `application/json-patch+json` (RFC 6902) for complex operations (add, remove, move, test). PATCH is not inherently idempotent — `{ "views": "increment" }` changes state on each call.

   **DELETE — Remove a resource**

   ```http
   DELETE /orders/818
   ```

   ```http
   HTTP/1.1 204 No Content
   ```

   DELETE is idempotent — deleting a resource that is already gone returns `204 No Content` or `404 Not Found` (either is valid; `204` is more common for idempotent semantics). Including a response body with `200 OK` is acceptable when the client needs confirmation data (e.g., a deletion receipt).

   ### Worked Example

   An e-commerce product catalog API demonstrating correct method selection:

   ```http
   # List products (safe, cacheable)
   GET /products?category=electronics&limit=20

   # Create a new product (not idempotent without idempotency key)
   POST /products
   Content-Type: application/json
   Idempotency-Key: req-abc-123
   { "name": "USB-C Hub", "price": 29.99, "sku": "UCH-100" }
   → 201 Created, Location: /products/501

   # Replace product entirely (idempotent)
   PUT /products/501
   Content-Type: application/json
   { "name": "USB-C Hub Pro", "price": 39.99, "sku": "UCH-100", "active": true }
   → 200 OK

   # Update price only (partial update)
   PATCH /products/501
   Content-Type: application/merge-patch+json
   { "price": 34.99 }
   → 200 OK

   # Discontinue product (idempotent)
   DELETE /products/501
   → 204 No Content

   # Retry DELETE after network timeout — safe because idempotent
   DELETE /products/501
   → 204 No Content (or 404 Not Found — both acceptable)
   ```

   **Non-CRUD action — archiving:** When the operation is not a simple CRUD mapping, use POST on a sub-resource or action resource:

   ```http
   POST /products/501/archive
   → 200 OK
   { "id": 501, "status": "archived", "archivedAt": "2024-03-15T10:00:00Z" }
   ```

   This is preferable to `PATCH /products/501 { "status": "archived" }` when the archive operation has side effects beyond a status change (e.g., removing from search index, notifying downstream systems).

   ### Anti-Patterns
   1. **Using POST for everything.** POST-only APIs are Level 0 on the Richardson Maturity Model. They cannot be cached, cannot be safely retried, and give proxies and monitoring tools no semantic information. Map reads to GET, full replacements to PUT, partial updates to PATCH, and removals to DELETE.

   2. **GET with side effects.** A `GET /notifications/mark-all-read` endpoint modifies state. Browser prefetch, crawlers, and link previews will trigger it. Use `POST /notifications/mark-all-read` instead.

   3. **PUT for partial updates.** Sending `PUT /users/42 { "email": "new@example.com" }` erases the user's name, address, and every other field. PUT replaces the entire resource. Use PATCH for partial updates.

   4. **Returning 200 with empty body on DELETE.** If you return `200 OK`, include a body (deletion receipt, confirmation). If no body is needed, return `204 No Content`. An empty `200` confuses clients expecting content.

   5. **Treating PATCH as idempotent by default.** `PATCH { "balance": 100 }` is idempotent, but `PATCH { "op": "increment", "path": "/balance", "value": 10 }` is not. Document idempotency guarantees per endpoint, and use `If-Match` for optimistic concurrency on non-idempotent patches.

   ## Details

   ### The PUT-vs-POST Decision

   The key question is: **who decides the resource URL?**
   - **Client decides** → PUT. The client sends `PUT /products/UCH-100` (using SKU as ID). If the resource exists, it is replaced. If not, it is created. This pattern works well with natural keys.
   - **Server decides** → POST. The client sends `POST /products` and the server assigns an ID. The response includes `Location: /products/501`.

   If your API uses server-generated UUIDs or auto-increment IDs, creation is always POST. If your API uses client-provided identifiers, PUT doubles as create-or-replace ("upsert").

   ### HEAD for Existence Checks

   HEAD returns the same headers as GET but without a body. Use it for:
   - Checking if a resource exists (`200` vs `404`) without transferring data
   - Checking `Content-Length` before downloading large files
   - Cache validation without payload transfer

   ```http
   HEAD /reports/2024-q1.pdf
   → 200 OK, Content-Length: 4521890, Last-Modified: Mon, 01 Apr 2024 08:00:00 GMT
   ```

   ### Real-World Case Study: Stripe's Method Discipline

   Stripe's API is a model of correct method usage. Creating a charge is `POST /v1/charges`. Retrieving it is `GET /v1/charges/ch_xxx`. Updating is `POST /v1/charges/ch_xxx` (Stripe uses POST for updates rather than PATCH for historical reasons, but documents the semantic clearly). Deleting is `DELETE /v1/customers/cus_xxx`. Every write endpoint accepts an `Idempotency-Key` header, making POST safely retriable. This discipline enables Stripe's automatic retry middleware and their client libraries' built-in retry logic.

   ## Source
   - [RFC 9110 — HTTP Semantics, Section 9: Methods](https://www.rfc-editor.org/rfc/rfc9110#section-9)
   - [RFC 5789 — PATCH Method for HTTP](https://www.rfc-editor.org/rfc/rfc5789)
   - [RFC 7396 — JSON Merge Patch](https://www.rfc-editor.org/rfc/rfc7396)
   - [MDN — HTTP Request Methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)
   - [Stripe API — Idempotent Requests](https://docs.stripe.com/api/idempotent_requests)

   ## Process
   1. Map each API operation to a method: reads → GET, creation with server-assigned ID → POST, full replacement → PUT, partial update → PATCH, removal → DELETE.
   2. For non-CRUD actions (archive, approve, cancel), use POST on a sub-resource (`POST /orders/42/cancel`) rather than overloading PATCH with status changes that have side effects.
   3. Verify idempotency: confirm PUT and DELETE are safe to retry. For POST endpoints, add idempotency key support (see `api-idempotency-keys`).
   4. Validate safety: confirm GET and HEAD never modify state — search for side effects in GET handlers.
   5. Run `harness validate` to confirm skill files are well-formed.

   ## Harness Integration
   - **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
   - **No tools or state** -- consumed as context by other skills and agents.
   - **related_skills:** api-status-codes, api-idempotency-keys, api-rest-maturity-model, api-resource-modeling, api-bulk-operations

   ## Success Criteria
   - Every endpoint uses the semantically correct HTTP method — no POST-for-everything.
   - GET and HEAD endpoints have no side effects and are cacheable.
   - PUT endpoints replace the entire resource; PATCH endpoints modify only specified fields.
   - DELETE endpoints are idempotent — deleting an already-deleted resource does not return 500.
   - Non-CRUD actions use POST on a sub-resource rather than overloading PATCH with side-effect-laden status changes.
   - Idempotency guarantees are documented per endpoint.

   ```

   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add api-http-methods knowledge skill (claude-code)`

---

### Task 2: Create api-status-codes skill (claude-code)

**Depends on:** none (can run in parallel with Task 1)
**Files:**

- `agents/skills/claude-code/api-status-codes/SKILL.md`
- `agents/skills/claude-code/api-status-codes/skill.yaml`

1. Create directory:

   ```bash
   mkdir -p /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/api-status-codes
   ```

2. Write `agents/skills/claude-code/api-status-codes/skill.yaml`:

   ```yaml
   name: api-status-codes
   version: '1.0.0'
   description: HTTP status code selection by scenario -- common codes, misuses, and decision framework for REST APIs
   stability: static
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths: []
   related_skills:
     - api-http-methods
     - api-error-contracts
     - api-rest-maturity-model
     - api-problem-details-rfc
     - api-retry-guidance
   stack_signals:
     - rest
     - api
     - http
   keywords:
     - status-codes
     - HTTP-status
     - 2xx
     - 4xx
     - 5xx
     - error-responses
     - 200-OK
     - 404-not-found
     - 409-conflict
     - 422-unprocessable
   metadata:
     author: community
     upstream: www.rfc-editor.org/rfc/rfc9110#section-15
   state:
     persistent: false
     files: []
   depends_on: []
   ```

3. Write `agents/skills/claude-code/api-status-codes/SKILL.md`:

   ````markdown
   # HTTP Status Code Selection

   > HTTP status codes are a three-digit contract between server and client. The right code enables automatic retries, correct caching, meaningful monitoring alerts, and client error handling without parsing response bodies.

   ## When to Use

   - Choosing between 400 and 422 for validation errors
   - Deciding whether to return 404 or 410 for removed resources
   - Selecting the correct 2xx code for a creation vs. an update
   - Reviewing a PR that returns 200 for every response including errors
   - Designing error responses that work with standard HTTP middleware
   - Configuring monitoring alerts by status code class
   - Evaluating whether 204 or 200 is appropriate for DELETE

   ## Instructions

   ### Key Concepts

   Status codes are grouped into five classes:

   | Class | Meaning       | Client Action                                    |
   | ----- | ------------- | ------------------------------------------------ |
   | 1xx   | Informational | Continue processing (rarely used in REST APIs)   |
   | 2xx   | Success       | Request succeeded — use the response             |
   | 3xx   | Redirection   | Follow the `Location` header                     |
   | 4xx   | Client Error  | Fix the request and retry (or don't)             |
   | 5xx   | Server Error  | Retry after backoff — the server failed, not you |

   **Essential 2xx Codes**

   | Code           | When to Use                                             |
   | -------------- | ------------------------------------------------------- |
   | 200 OK         | Successful GET, PUT, PATCH with response body           |
   | 201 Created    | POST created a new resource — include `Location` header |
   | 202 Accepted   | Request queued for async processing — not yet complete  |
   | 204 No Content | Successful DELETE or PUT/PATCH with no response body    |

   **Essential 4xx Codes**

   | Code                       | When to Use                                                                 |
   | -------------------------- | --------------------------------------------------------------------------- |
   | 400 Bad Request            | Malformed syntax, missing required field, unparseable JSON                  |
   | 401 Unauthorized           | Missing or invalid authentication credentials                               |
   | 403 Forbidden              | Authenticated but not authorized for this resource                          |
   | 404 Not Found              | Resource does not exist at this URL                                         |
   | 405 Method Not Allowed     | Method not supported on this endpoint (include `Allow` header)              |
   | 409 Conflict               | State conflict — e.g., creating a duplicate, concurrent edit collision      |
   | 410 Gone                   | Resource existed but has been permanently removed                           |
   | 415 Unsupported Media Type | Content-Type not supported by the endpoint                                  |
   | 422 Unprocessable Content  | Syntactically valid JSON but semantically invalid (business rule violation) |
   | 429 Too Many Requests      | Rate limit exceeded — include `Retry-After` header                          |

   **Essential 5xx Codes**

   | Code                      | When to Use                                             |
   | ------------------------- | ------------------------------------------------------- |
   | 500 Internal Server Error | Unexpected server failure — never return intentionally  |
   | 502 Bad Gateway           | Upstream dependency returned an invalid response        |
   | 503 Service Unavailable   | Planned maintenance or overload — include `Retry-After` |
   | 504 Gateway Timeout       | Upstream dependency timed out                           |

   **The 400-vs-422 Decision**

   `400 Bad Request` means the request is syntactically malformed — the server cannot parse it. Example: invalid JSON, missing Content-Type header, malformed URL encoding.

   `422 Unprocessable Content` means the request is syntactically correct but violates business rules. Example: valid JSON but `email` field fails format validation, `startDate` is after `endDate`, or `quantity` is negative.

   Rule of thumb: if the error would be caught by a JSON schema validator, use 400. If it requires domain logic to detect, use 422.

   ### Worked Example

   A user registration API with correct status code selection:

   ```http
   # Successful creation
   POST /users
   Content-Type: application/json
   { "email": "alice@example.com", "name": "Alice", "role": "editor" }
   → 201 Created
   Location: /users/42
   { "id": 42, "email": "alice@example.com", "name": "Alice", "role": "editor" }

   # Malformed request body
   POST /users
   Content-Type: application/json
   { invalid json
   → 400 Bad Request
   { "type": "about:blank", "title": "Bad Request", "status": 400,
     "detail": "JSON parse error at position 2" }

   # Valid JSON, invalid data
   POST /users
   Content-Type: application/json
   { "email": "not-an-email", "name": "", "role": "superadmin" }
   → 422 Unprocessable Content
   { "type": "/errors/validation", "title": "Validation Failed", "status": 422,
     "errors": [
       { "field": "email", "message": "Must be a valid email address" },
       { "field": "name", "message": "Must not be blank" },
       { "field": "role", "message": "Must be one of: viewer, editor, admin" }
     ] }

   # Duplicate email
   POST /users
   Content-Type: application/json
   { "email": "alice@example.com", "name": "Alice 2", "role": "viewer" }
   → 409 Conflict
   { "type": "/errors/duplicate", "title": "Conflict", "status": 409,
     "detail": "A user with email alice@example.com already exists" }

   # Resource retrieved
   GET /users/42
   → 200 OK
   { "id": 42, "email": "alice@example.com", "name": "Alice", "role": "editor" }

   # Resource not found
   GET /users/999
   → 404 Not Found
   { "type": "about:blank", "title": "Not Found", "status": 404,
     "detail": "No user with ID 999" }

   # Successful deletion
   DELETE /users/42
   → 204 No Content

   # Already deleted
   DELETE /users/42
   → 204 No Content (idempotent) or 404 Not Found (also valid)
   ```
   ````

   ### Anti-Patterns
   1. **200 OK for everything.** Returning `200` with `{ "success": false, "error": "Not found" }` defeats HTTP middleware, CDN caching, monitoring dashboards, and retry logic. Use the correct 4xx/5xx code — the status line is the primary error signal.

   2. **500 for validation errors.** If the client sends bad data, that is a 4xx (client error), not a 5xx (server error). A 500 triggers on-call alerts and retry logic — neither is appropriate for a missing required field.

   3. **401 when you mean 403.** `401 Unauthorized` means "I don't know who you are" (missing/invalid credentials). `403 Forbidden` means "I know who you are, but you can't do this." A logged-in user accessing another user's private data gets 403, not 401.

   4. **404 for method not allowed.** If `GET /users/42` works but `DELETE /users/42` is not supported, return `405 Method Not Allowed` with an `Allow: GET, PATCH` header — not 404. The resource exists; the method is wrong.

   5. **Ignoring Retry-After on 429 and 503.** Rate-limited responses (429) and maintenance responses (503) should include a `Retry-After` header so clients know when to retry. Without it, clients either hammer the server or wait arbitrarily.

   ## Details

   ### Status Code Selection Decision Tree
   1. Did the request succeed? → 2xx
      - Created a new resource? → 201 + Location header
      - Queued for async processing? → 202
      - No response body needed? → 204
      - Otherwise → 200 with body
   2. Is it the client's fault? → 4xx
      - Can't parse the request? → 400
      - Not authenticated? → 401
      - Authenticated but forbidden? → 403
      - Resource doesn't exist? → 404 (or 410 if permanently gone)
      - Wrong HTTP method? → 405 + Allow header
      - State conflict? → 409
      - Valid syntax, invalid semantics? → 422
      - Rate limited? → 429 + Retry-After
   3. Is it the server's fault? → 5xx
      - Upstream returned garbage? → 502
      - Overloaded or maintenance? → 503 + Retry-After
      - Upstream timed out? → 504
      - Unknown failure? → 500

   ### The 301/308 vs 302/307 Redirect Distinction
   - `301 Moved Permanently` — the URL changed forever. Clients and search engines update their bookmarks. Method may change to GET on redirect (historically).
   - `308 Permanent Redirect` — same as 301 but method and body are preserved. Use for API redirects where POST must remain POST.
   - `302 Found` / `307 Temporary Redirect` — temporary redirect. 307 preserves method; 302 may change to GET.

   For API versioning redirects (e.g., `/v1/users` → `/v2/users`), use `308` to preserve the request method.

   ### Real-World Case Study: GitHub API Status Code Discipline

   GitHub's REST API returns `422 Unprocessable Entity` for validation errors (not 400), `409 Conflict` for merge conflicts, `403 Forbidden` for rate-limit hits on authenticated requests, and `304 Not Modified` with ETag caching. Their `403` rate-limit response includes `X-RateLimit-Reset` to tell clients exactly when to retry. This granularity allows their official client libraries (`octokit`) to implement automatic retry-with-backoff for 429/503, skip retry for 4xx, and handle 409 merge conflicts with user prompts.

   ## Source
   - [RFC 9110 — HTTP Semantics, Section 15: Status Codes](https://www.rfc-editor.org/rfc/rfc9110#section-15)
   - [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)
   - [MDN — HTTP Response Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
   - [httpstatuses.io](https://httpstatuses.io/)

   ## Process
   1. Use the decision tree: success → 2xx, client fault → 4xx, server fault → 5xx. Pick the most specific code within the class.
   2. For 4xx errors, always include a structured error body (see `api-error-contracts` and `api-problem-details-rfc`).
   3. For 201 responses, always include a `Location` header pointing to the created resource.
   4. For 429 and 503 responses, always include a `Retry-After` header.
   5. Verify that monitoring/alerting is configured by class: 5xx triggers on-call, 4xx spike triggers investigation, 429 spike triggers rate-limit review.

   ## Harness Integration
   - **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
   - **No tools or state** -- consumed as context by other skills and agents.
   - **related_skills:** api-http-methods, api-error-contracts, api-rest-maturity-model, api-problem-details-rfc, api-retry-guidance

   ## Success Criteria
   - No endpoint returns 200 for error conditions — errors use 4xx/5xx codes.
   - 400 is used only for malformed requests; 422 is used for business-rule validation failures.
   - 401 and 403 are used correctly: 401 for missing credentials, 403 for insufficient permissions.
   - 201 responses include a `Location` header.
   - 429 and 503 responses include a `Retry-After` header.
   - Monitoring dashboards alert on 5xx rates and 4xx spikes, with different severity levels.

   ```

   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add api-status-codes knowledge skill (claude-code)`

---

### Task 3: Create api-content-negotiation skill (claude-code)

**Depends on:** none (can run in parallel with Tasks 1-2)
**Files:**

- `agents/skills/claude-code/api-content-negotiation/SKILL.md`
- `agents/skills/claude-code/api-content-negotiation/skill.yaml`

1. Create directory:

   ```bash
   mkdir -p /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/api-content-negotiation
   ```

2. Write `agents/skills/claude-code/api-content-negotiation/skill.yaml`:

   ```yaml
   name: api-content-negotiation
   version: '1.0.0'
   description: Accept and Content-Type headers, media type selection, and versioning via content negotiation in REST APIs
   stability: static
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths: []
   related_skills:
     - api-versioning-header
     - api-http-caching
     - api-http-methods
     - api-status-codes
     - api-error-contracts
   stack_signals:
     - rest
     - api
     - http
   keywords:
     - content-negotiation
     - Accept-header
     - Content-Type
     - media-types
     - MIME-types
     - vendor-media-type
     - JSON
     - XML
     - API-versioning
   metadata:
     author: community
     upstream: www.rfc-editor.org/rfc/rfc9110#section-12
   state:
     persistent: false
     files: []
   depends_on: []
   ```

3. Write `agents/skills/claude-code/api-content-negotiation/SKILL.md`:

   ````markdown
   # Content Negotiation

   > Content negotiation lets clients and servers agree on response format, language, and encoding through HTTP headers — decoupling representation from resource identity. A single URL can serve JSON, XML, CSV, or a vendor-specific media type based on the `Accept` header.

   ## When to Use

   - Designing an API that must support multiple response formats (JSON + XML, JSON + CSV)
   - Implementing API versioning through media types instead of URL paths
   - Choosing between `Accept` header versioning and URL path versioning
   - Handling requests with unsupported `Accept` or `Content-Type` values
   - Reviewing a PR that ignores the `Accept` header and always returns JSON
   - Building a public API consumed by diverse clients (browsers, mobile, CLI tools)

   ## Instructions

   ### Key Concepts

   Content negotiation uses three mechanisms:

   **1. Proactive (Server-Driven) Negotiation**

   The client sends preferences in request headers; the server selects the best representation.

   ```http
   GET /reports/2024-q1
   Accept: application/json
   ```
   ````

   ```http
   HTTP/1.1 200 OK
   Content-Type: application/json
   Vary: Accept

   { "quarter": "2024-Q1", "revenue": 1250000, "units": 4200 }
   ```

   ```http
   GET /reports/2024-q1
   Accept: text/csv
   ```

   ```http
   HTTP/1.1 200 OK
   Content-Type: text/csv
   Vary: Accept

   quarter,revenue,units
   2024-Q1,1250000,4200
   ```

   The `Vary: Accept` header is critical — it tells caches that the response varies by `Accept` header, so a cached JSON response is not served to a client requesting CSV.

   **2. Quality Values (q-factors)**

   Clients can rank preferences:

   ```http
   Accept: application/json;q=1.0, application/xml;q=0.5, text/csv;q=0.1
   ```

   The server picks the highest-quality match it can produce. If none match, return `406 Not Acceptable`.

   **3. Content-Type for Request Bodies**

   The `Content-Type` header tells the server what format the request body uses:

   ```http
   POST /orders
   Content-Type: application/json

   { "items": [{ "sku": "A1", "qty": 2 }] }
   ```

   If the server does not support the provided `Content-Type`, return `415 Unsupported Media Type`.

   **Vendor Media Types**

   Custom media types use the `vnd.` prefix to convey API-specific semantics:

   ```
   application/vnd.github+json
   application/vnd.myapi.order.v2+json
   ```

   The `+json` suffix indicates the base format is JSON, so generic JSON parsers still work. The vendor prefix carries version and resource-type information without polluting the URL.

   ### Worked Example

   A document management API supporting multiple formats and versioning via media type:

   ```http
   # Client requests JSON (default)
   GET /documents/doc-42
   Accept: application/json
   → 200 OK
   Content-Type: application/json
   Vary: Accept
   { "id": "doc-42", "title": "Q1 Report", "pages": 12 }

   # Client requests PDF binary
   GET /documents/doc-42
   Accept: application/pdf
   → 200 OK
   Content-Type: application/pdf
   Content-Disposition: attachment; filename="q1-report.pdf"
   <binary PDF data>

   # Client requests unsupported format
   GET /documents/doc-42
   Accept: application/yaml
   → 406 Not Acceptable
   Content-Type: application/json
   { "type": "about:blank", "title": "Not Acceptable", "status": 406,
     "detail": "Supported formats: application/json, application/pdf, text/csv" }

   # Versioning via vendor media type
   GET /documents/doc-42
   Accept: application/vnd.docmgmt.v2+json
   → 200 OK
   Content-Type: application/vnd.docmgmt.v2+json
   { "id": "doc-42", "title": "Q1 Report", "pageCount": 12,
     "metadata": { "author": "Alice", "createdAt": "2024-01-15T08:00:00Z" } }

   # Upload with explicit Content-Type
   POST /documents
   Content-Type: multipart/form-data; boundary=----FormBoundary
   ------FormBoundary
   Content-Disposition: form-data; name="file"; filename="report.pdf"
   Content-Type: application/pdf
   <binary data>
   ------FormBoundary--
   → 201 Created
   Location: /documents/doc-43

   # Wrong Content-Type
   POST /documents
   Content-Type: text/plain
   some raw text here
   → 415 Unsupported Media Type
   ```

   ### Anti-Patterns
   1. **Ignoring the Accept header.** Always returning JSON regardless of what the client requests is a missed contract. If you only support JSON, document it and return `406` for other formats — do not silently ignore the header.

   2. **Missing Vary header.** Without `Vary: Accept`, a CDN or browser cache stores the JSON response and serves it to a CSV-requesting client. Always include `Vary` when the response depends on request headers.

   3. **Format in URL when content negotiation suffices.** `/reports/2024-q1.json` and `/reports/2024-q1.csv` creates two URLs for the same resource. Use `Accept` header negotiation instead. URL-based format selection is acceptable as a convenience shortcut but should not replace proper negotiation.

   4. **406 without listing supported formats.** A bare `406 Not Acceptable` gives the client no way to fix the request. Always include the list of supported media types in the error body.

   5. **Using Content-Type for versioning without a migration path.** Vendor media type versioning (`application/vnd.api.v2+json`) is elegant but requires all clients to set explicit `Accept` headers. If most of your clients are browsers or simple HTTP tools, URL path versioning is more practical. See `api-versioning-header` and `api-versioning-url` for the tradeoff analysis.

   ## Details

   ### The Accept Header Parsing Algorithm

   RFC 9110 defines precise matching rules:
   1. Exact match: `application/json` matches `application/json`
   2. Subtype wildcard: `application/*` matches `application/json`, `application/xml`
   3. Full wildcard: `*/*` matches anything
   4. Quality values break ties: higher `q` wins
   5. More-specific types beat less-specific at equal quality

   Most HTTP frameworks parse this automatically. Do not implement custom parsing — use your framework's built-in negotiation.

   ### Content Negotiation vs URL-Based Format

   | Approach                         | Pros                                                                  | Cons                                                     |
   | -------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
   | `Accept` header                  | One URL per resource, proper HTTP semantics, cache-friendly with Vary | Harder to test in browser, requires header-aware clients |
   | URL extension (`.json`, `.csv`)  | Easy to test, browser-friendly, simple to implement                   | Multiple URLs per resource, URI pollution                |
   | Query parameter (`?format=json`) | Easy to test, no URL pollution                                        | Breaks caching without Vary, non-standard                |

   The recommended approach: support `Accept` header as the primary mechanism. Optionally support URL extension as a convenience that maps to the same negotiation logic internally.

   ### Real-World Case Study: GitHub's Vendor Media Types

   GitHub's API uses `application/vnd.github+json` as the default media type. They support specialized formats via `Accept`:
   - `application/vnd.github.raw+json` — raw markdown content
   - `application/vnd.github.html+json` — rendered HTML content
   - `application/vnd.github.diff` — diff format for commits
   - `application/vnd.github.patch` — patch format for commits

   This lets a single commit URL (`/repos/owner/repo/commits/sha`) serve JSON metadata, raw diff text, or a patch file based solely on the `Accept` header. The `Vary: Accept` header ensures CDN caches work correctly across formats.

   ## Source
   - [RFC 9110 — HTTP Semantics, Section 12: Content Negotiation](https://www.rfc-editor.org/rfc/rfc9110#section-12)
   - [RFC 6838 — Media Type Specifications and Registration Procedures](https://www.rfc-editor.org/rfc/rfc6838)
   - [MDN — Content Negotiation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Content_negotiation)
   - [GitHub API — Media Types](https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api#accept)

   ## Process
   1. Define supported media types for each resource and document them in your API specification (OpenAPI `produces`/`consumes` or `content` map).
   2. Implement `Accept` header parsing using your framework's built-in negotiation — do not write custom parsers.
   3. Return `406 Not Acceptable` with a list of supported formats when no match is found.
   4. Return `415 Unsupported Media Type` when the request `Content-Type` is not supported.
   5. Add `Vary: Accept` to all responses that depend on content negotiation, ensuring caches store separate representations.

   ## Harness Integration
   - **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
   - **No tools or state** -- consumed as context by other skills and agents.
   - **related_skills:** api-versioning-header, api-http-caching, api-http-methods, api-status-codes, api-error-contracts

   ## Success Criteria
   - Every response includes a `Content-Type` header matching the actual format.
   - Endpoints that vary by `Accept` header include `Vary: Accept` in the response.
   - Unsupported `Accept` values return `406 Not Acceptable` with a list of supported formats.
   - Unsupported `Content-Type` values on request bodies return `415 Unsupported Media Type`.
   - If vendor media types are used for versioning, the API also supports a default media type for clients that do not set explicit `Accept` headers.

   ```

   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add api-content-negotiation knowledge skill (claude-code)`

---

### Task 4: Create api-http-caching skill (claude-code)

**Depends on:** none (can run in parallel with Tasks 1-3)
**Files:**

- `agents/skills/claude-code/api-http-caching/SKILL.md`
- `agents/skills/claude-code/api-http-caching/skill.yaml`

1. Create directory:

   ```bash
   mkdir -p /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/api-http-caching
   ```

2. Write `agents/skills/claude-code/api-http-caching/skill.yaml`:

   ```yaml
   name: api-http-caching
   version: '1.0.0'
   description: Cache-Control, ETag, Vary, and CDN interaction -- designing cacheable REST API responses
   stability: static
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths: []
   related_skills:
     - api-conditional-requests
     - api-content-negotiation
     - api-http-methods
     - perf-cdn-cache-control
     - api-status-codes
   stack_signals:
     - rest
     - api
     - http
     - caching
   keywords:
     - HTTP-caching
     - Cache-Control
     - ETag
     - Vary
     - CDN
     - max-age
     - stale-while-revalidate
     - no-cache
     - no-store
     - conditional-requests
   metadata:
     author: community
     upstream: www.rfc-editor.org/rfc/rfc9111
   state:
     persistent: false
     files: []
   depends_on: []
   ```

3. Write `agents/skills/claude-code/api-http-caching/SKILL.md`:

   ````markdown
   # HTTP Caching

   > HTTP caching is the single highest-leverage performance optimization for read-heavy APIs. Correct `Cache-Control` headers, ETags, and `Vary` directives eliminate redundant computation, reduce latency to zero for cache hits, and let CDNs absorb traffic spikes without origin scaling.

   ## When to Use

   - Adding caching headers to a new API endpoint
   - Deciding between `max-age`, `no-cache`, and `no-store`
   - Evaluating whether an endpoint should use ETag-based or time-based caching
   - Reviewing a PR that sets `Cache-Control` on a personalized endpoint without `Vary`
   - Configuring CDN caching for an API behind a reverse proxy
   - Debugging stale cache issues where clients receive outdated data
   - Choosing caching strategy for public vs authenticated endpoints

   ## Instructions

   ### Key Concepts

   HTTP caching has two dimensions: **freshness** (how long to use a cached response without checking) and **validation** (how to check if a stale cached response is still current).

   **Cache-Control Directives**

   | Directive                  | Meaning                                                        |
   | -------------------------- | -------------------------------------------------------------- |
   | `max-age=N`                | Response is fresh for N seconds                                |
   | `s-maxage=N`               | Like max-age but applies only to shared caches (CDNs, proxies) |
   | `no-cache`                 | Must revalidate with the origin before using cached copy       |
   | `no-store`                 | Never cache this response — not in memory, not on disk         |
   | `private`                  | Only browser cache may store — CDNs/proxies must not           |
   | `public`                   | Any cache may store — even if authentication is required       |
   | `must-revalidate`          | Once stale, must revalidate — no serving stale on error        |
   | `stale-while-revalidate=N` | Serve stale for N seconds while revalidating in background     |
   | `immutable`                | Response will never change — skip revalidation entirely        |

   **Freshness: max-age and s-maxage**

   ```http
   GET /products/42
   → 200 OK
   Cache-Control: public, max-age=300, s-maxage=600
   ETag: "v1-abc123"

   { "id": 42, "name": "Widget", "price": 9.99 }
   ```
   ````

   - Browsers cache for 5 minutes (300s)
   - CDNs cache for 10 minutes (600s)
   - After expiry, caches revalidate using the ETag

   **Validation: ETag and Last-Modified**

   ETags are opaque validators — the server generates them (e.g., from a hash of the response body or a database version column).

   ```http
   # First request — server returns ETag
   GET /products/42
   → 200 OK
   ETag: "v1-abc123"
   Cache-Control: no-cache

   { "id": 42, "name": "Widget", "price": 9.99 }
   ```

   ```http
   # Subsequent request — client sends ETag for validation
   GET /products/42
   If-None-Match: "v1-abc123"

   → 304 Not Modified
   ETag: "v1-abc123"
   ```

   The `304 Not Modified` response has no body — saving bandwidth and server computation. The client uses its cached copy. See `api-conditional-requests` for the full validation protocol.

   `Last-Modified` is the time-based alternative:

   ```http
   GET /reports/2024-q1
   → 200 OK
   Last-Modified: Mon, 01 Apr 2024 08:00:00 GMT
   Cache-Control: public, max-age=3600
   ```

   The client revalidates with `If-Modified-Since: Mon, 01 Apr 2024 08:00:00 GMT`. ETags are more precise — prefer them for APIs.

   **Vary Header**

   `Vary` tells caches which request headers affect the response:

   ```http
   GET /products/42
   Accept: application/json
   Authorization: Bearer user-token-1
   → 200 OK
   Vary: Accept, Authorization
   Cache-Control: private, max-age=60
   ```

   Without `Vary: Authorization`, a shared cache could serve User A's personalized response to User B. Without `Vary: Accept`, a JSON-cached response could be served to a CSV-requesting client.

   ### Worked Example

   An e-commerce API with tiered caching strategy:

   ```http
   # Product catalog (public, CDN-cacheable, revalidate with ETag)
   GET /products/42
   → 200 OK
   Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=60
   ETag: "prod-42-v7"
   Vary: Accept
   { "id": 42, "name": "Widget", "price": 9.99, "inStock": true }

   # User's cart (private, short-lived, no CDN)
   GET /users/me/cart
   Authorization: Bearer eyJhbG...
   → 200 OK
   Cache-Control: private, max-age=10, must-revalidate
   ETag: "cart-u99-v3"
   { "items": [{ "productId": 42, "qty": 2 }], "total": 19.98 }

   # Checkout (never cache — side effects, sensitive data)
   POST /orders
   → 201 Created
   Cache-Control: no-store

   # Static assets (immutable — cache forever, bust with URL)
   GET /static/product-images/widget-v7.jpg
   → 200 OK
   Cache-Control: public, max-age=31536000, immutable

   # Search results (CDN-cacheable, vary by query + accept)
   GET /products?q=widget&category=electronics
   → 200 OK
   Cache-Control: public, s-maxage=120, stale-while-revalidate=30
   Vary: Accept
   ```

   **Caching decision framework:**
   - Is the data personalized? → `private` (or `no-store` for sensitive data)
   - Is the data public and read-heavy? → `public, s-maxage=N` for CDN
   - Can the client tolerate slightly stale data? → `stale-while-revalidate=N`
   - Does the data change unpredictably? → `no-cache` + ETag (always revalidate, but skip body if unchanged)
   - Is the data immutable (versioned static assets)? → `immutable, max-age=31536000`

   ### Anti-Patterns
   1. **`no-cache` does not mean "don't cache."** `no-cache` means "cache it but always revalidate before using." To prevent caching entirely, use `no-store`. This is the most common Cache-Control misunderstanding.

   2. **Missing Vary on personalized endpoints.** An endpoint that returns different data per user must include `Vary: Authorization` (or `Vary: Cookie`). Without it, a shared cache (CDN, reverse proxy) will serve one user's data to another.

   3. **Setting `max-age` on mutation responses.** POST, PUT, PATCH, DELETE responses should not be cached with `max-age`. Use `no-store` for mutation responses to prevent stale state in any cache layer.

   4. **Over-caching with long max-age and no cache-busting.** Setting `max-age=86400` without ETags or versioned URLs means clients are stuck with stale data for 24 hours with no way to force a refresh. Pair long max-age with ETag validation, or use `stale-while-revalidate` to smooth transitions.

   5. **Vary: \* — nuking all caching.** `Vary: *` makes every request unique, effectively disabling caching. If you need to vary on many headers, list them explicitly. If the response truly cannot be cached, use `no-store` instead.

   ## Details

   ### Cache Layers in Practice

   A typical API request traverses multiple cache layers:
   1. **Browser/client cache** — honors `max-age`, `private`, ETags. Fastest: zero network.
   2. **CDN edge cache** — honors `s-maxage`, `public`. Reduces latency and origin load.
   3. **Reverse proxy** (Varnish, Nginx) — application-level caching at the infrastructure boundary.
   4. **Application cache** (Redis, Memcached) — not HTTP caching, but often confused with it.

   HTTP caching (layers 1-3) is free once configured — no application code changes. Application caching (layer 4) requires code and operational overhead. Maximize HTTP caching before reaching for Redis.

   ### stale-while-revalidate: The Best-of-Both Directive

   `stale-while-revalidate` lets caches serve a stale response immediately while revalidating in the background:

   ```http
   Cache-Control: public, max-age=60, stale-while-revalidate=30
   ```

   - 0-60s: response is fresh, served from cache
   - 60-90s: response is stale, served immediately, background revalidation starts
   - 90s+: response is stale, cache waits for revalidation before serving

   This eliminates the latency spike when cache entries expire under high traffic.

   ### Real-World Case Study: Fastly CDN + Stripe API

   Stripe's API dashboard serves account data behind Fastly CDN. Public resources (API documentation, status page) use `public, s-maxage=300, stale-while-revalidate=60`. Authenticated endpoints use `private, no-cache` with ETags — every request revalidates, but 304 responses (no body) keep bandwidth low. This combination means their status page survives traffic spikes (CDN absorbs 99%+ of reads) while authenticated data is always fresh. The `Surrogate-Control` header gives Fastly different cache behavior than browser clients, allowing 10-minute CDN caching with 1-minute browser caching.

   ## Source
   - [RFC 9111 — HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111)
   - [RFC 9110 — HTTP Semantics, Section 8.8: Validator Fields](https://www.rfc-editor.org/rfc/rfc9110#section-8.8)
   - [MDN — HTTP Caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
   - [web.dev — HTTP Cache](https://web.dev/articles/http-cache)
   - [Fastly — Cache Control Tutorial](https://www.fastly.com/blog/cache-control-tutorial)

   ## Process
   1. Classify each endpoint: public-read (CDN-cacheable), private-read (browser-only), write (no-store), or mixed.
   2. Set `Cache-Control` based on classification: `public, s-maxage=N` for CDN reads, `private, max-age=N` for authenticated reads, `no-store` for writes and sensitive data.
   3. Add ETags to all cacheable GET responses — use database version columns, content hashes, or `Last-Modified` timestamps.
   4. Add `Vary` headers listing every request header that changes the response (Accept, Authorization, Accept-Language).
   5. Test with `curl -I` to verify headers, then check CDN hit rates in your CDN dashboard.

   ## Harness Integration
   - **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
   - **No tools or state** -- consumed as context by other skills and agents.
   - **related_skills:** api-conditional-requests, api-content-negotiation, api-http-methods, perf-cdn-cache-control, api-status-codes

   ## Success Criteria
   - Every cacheable GET endpoint has an explicit `Cache-Control` header — no reliance on browser defaults.
   - Public endpoints use `public, s-maxage` for CDN caching; personalized endpoints use `private` or `no-store`.
   - All cacheable responses include an `ETag` or `Last-Modified` header for validation.
   - Mutation responses (POST, PUT, PATCH, DELETE) use `no-store`.
   - `Vary` headers are present on every endpoint that returns different content based on request headers.
   - CDN hit rate is monitored and exceeds 80% for public read endpoints.

   ```

   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add api-http-caching knowledge skill (claude-code)`

---

### Task 5: Create api-conditional-requests skill (claude-code)

**Depends on:** none (can run in parallel with Tasks 1-4)
**Files:**

- `agents/skills/claude-code/api-conditional-requests/SKILL.md`
- `agents/skills/claude-code/api-conditional-requests/skill.yaml`

1. Create directory:

   ```bash
   mkdir -p /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/api-conditional-requests
   ```

2. Write `agents/skills/claude-code/api-conditional-requests/skill.yaml`:

   ```yaml
   name: api-conditional-requests
   version: '1.0.0'
   description: If-None-Match, If-Modified-Since, and If-Match -- cache validation and optimistic concurrency for REST APIs
   stability: static
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths: []
   related_skills:
     - api-http-caching
     - api-http-methods
     - api-status-codes
     - db-optimistic-locking
     - api-idempotency-keys
   stack_signals:
     - rest
     - api
     - http
     - caching
     - concurrency
   keywords:
     - conditional-requests
     - If-None-Match
     - If-Match
     - If-Modified-Since
     - ETag
     - optimistic-concurrency
     - 304-Not-Modified
     - 412-Precondition-Failed
     - cache-validation
   metadata:
     author: community
     upstream: www.rfc-editor.org/rfc/rfc9110#section-13
   state:
     persistent: false
     files: []
   depends_on: []
   ```

3. Write `agents/skills/claude-code/api-conditional-requests/SKILL.md`:

   ````markdown
   # Conditional Requests

   > Conditional request headers let clients say "only send the body if it changed" and "only apply this update if nobody else modified the resource." These two capabilities — cache validation and optimistic concurrency — are built into HTTP and require zero application-level protocol design.

   ## When to Use

   - Adding cache validation to reduce bandwidth on frequently-polled endpoints
   - Implementing optimistic concurrency control for update endpoints
   - Preventing lost updates when multiple clients edit the same resource
   - Reviewing a PR that implements locking instead of using HTTP conditional headers
   - Deciding between ETag-based and Last-Modified-based validation
   - Reducing server load on high-traffic read endpoints with `304 Not Modified`

   ## Instructions

   ### Key Concepts

   HTTP defines four conditional headers in two groups:

   **Cache Validation (reads)**

   | Header              | Paired With     | Succeeds When                                |
   | ------------------- | --------------- | -------------------------------------------- |
   | `If-None-Match`     | `ETag`          | ETag does NOT match (resource changed) → 200 |
   | `If-Modified-Since` | `Last-Modified` | Resource modified after the date → 200       |

   If the condition fails (resource unchanged), the server returns `304 Not Modified` with no body.

   **Preconditions (writes)**

   | Header                | Paired With     | Succeeds When                                                      |
   | --------------------- | --------------- | ------------------------------------------------------------------ |
   | `If-Match`            | `ETag`          | ETag matches (resource unchanged since client last read) → proceed |
   | `If-Unmodified-Since` | `Last-Modified` | Resource not modified after the date → proceed                     |

   If the condition fails (resource changed), the server returns `412 Precondition Failed`.

   **ETag Flavors**

   - **Strong ETag** (`"abc123"`) — byte-for-byte identical. Required for `If-Match` and range requests.
   - **Weak ETag** (`W/"abc123"`) — semantically equivalent but not byte-identical. Acceptable for `If-None-Match`. Use when JSON key ordering or whitespace may vary.

   ### Cache Validation Flow

   The most common use case: avoid re-transferring unchanged data.

   ```http
   # Step 1: Initial request — server returns ETag
   GET /users/42
   → 200 OK
   ETag: "user-42-v5"
   Cache-Control: no-cache

   { "id": 42, "name": "Alice", "email": "alice@example.com" }
   ```
   ````

   ```http
   # Step 2: Subsequent request — client sends ETag
   GET /users/42
   If-None-Match: "user-42-v5"

   → 304 Not Modified
   ETag: "user-42-v5"
   ```

   No body transferred. The client uses its cached copy. Total savings: the entire response payload on every cache hit.

   ```http
   # Step 3: Resource changes — ETag no longer matches
   GET /users/42
   If-None-Match: "user-42-v5"

   → 200 OK
   ETag: "user-42-v6"

   { "id": 42, "name": "Alice", "email": "alice-new@example.com" }
   ```

   ### Optimistic Concurrency Flow

   The second use case: prevent lost updates when multiple clients edit the same resource.

   ```http
   # Step 1: Client A reads the resource
   GET /documents/doc-7
   → 200 OK
   ETag: "doc-7-v3"

   { "id": "doc-7", "title": "Design Spec", "content": "..." }
   ```

   ```http
   # Step 2: Client B also reads the same resource
   GET /documents/doc-7
   → 200 OK
   ETag: "doc-7-v3"

   { "id": "doc-7", "title": "Design Spec", "content": "..." }
   ```

   ```http
   # Step 3: Client A updates — succeeds (ETag matches)
   PUT /documents/doc-7
   If-Match: "doc-7-v3"
   Content-Type: application/json

   { "title": "Design Spec v2", "content": "updated content" }

   → 200 OK
   ETag: "doc-7-v4"
   ```

   ```http
   # Step 4: Client B tries to update — fails (ETag changed by Client A)
   PUT /documents/doc-7
   If-Match: "doc-7-v3"
   Content-Type: application/json

   { "title": "Design Spec revised", "content": "different content" }

   → 412 Precondition Failed
   { "type": "/errors/precondition-failed", "title": "Precondition Failed",
     "status": 412,
     "detail": "Resource was modified since your last read. Re-fetch and retry." }
   ```

   Client B must re-fetch the resource, merge changes, and retry with the new ETag. This is optimistic concurrency: no locks, no blocking — conflicts are detected at write time.

   ### Worked Example

   A collaborative wiki API with both cache validation and optimistic concurrency:

   ```http
   # Editor loads a page (cache validation + get current ETag)
   GET /wiki/pages/getting-started
   If-None-Match: "pg-gs-v11"
   → 304 Not Modified (editor already has latest)

   # Editor opens a different page for the first time
   GET /wiki/pages/architecture
   → 200 OK
   ETag: "pg-arch-v8"
   Last-Modified: Wed, 10 Apr 2024 14:30:00 GMT
   { "slug": "architecture", "title": "Architecture", "body": "..." }

   # Editor saves changes (optimistic concurrency)
   PUT /wiki/pages/architecture
   If-Match: "pg-arch-v8"
   Content-Type: application/json
   { "title": "System Architecture", "body": "updated content..." }
   → 200 OK
   ETag: "pg-arch-v9"

   # Another editor tries to save (conflict detected)
   PUT /wiki/pages/architecture
   If-Match: "pg-arch-v8"
   Content-Type: application/json
   { "title": "Architecture Overview", "body": "different changes..." }
   → 412 Precondition Failed

   # Creating a new page only if it does not exist
   PUT /wiki/pages/new-feature
   If-None-Match: *
   Content-Type: application/json
   { "title": "New Feature", "body": "..." }
   → 201 Created (page did not exist)

   # Retry creation — page now exists
   PUT /wiki/pages/new-feature
   If-None-Match: *
   → 412 Precondition Failed (page already exists)
   ```

   The `If-None-Match: *` pattern means "only proceed if no representation of this resource exists" — a clean create-if-absent pattern without separate existence checks.

   ### Anti-Patterns
   1. **Implementing custom version fields instead of using ETags.** Adding `{ "version": 5 }` to every response body and requiring `{ "expectedVersion": 5 }` in update requests reinvents ETags in the application layer. Use `ETag` and `If-Match` — HTTP clients, proxies, and caches already understand them.

   2. **Ignoring If-Match on PUT/PATCH endpoints.** Without `If-Match` enforcement, the last writer wins — silently overwriting concurrent changes. Always check `If-Match` on update endpoints and return `412` on mismatch. If the client does not send `If-Match`, decide whether to reject (safest) or allow (opt-in concurrency).

   3. **Using Last-Modified as the sole validator.** `Last-Modified` has one-second resolution. Two updates within the same second produce the same timestamp, making them indistinguishable. ETags have no resolution limit — prefer them for APIs.

   4. **Generating ETags from mutable metadata.** If your ETag includes a `lastAccessedAt` timestamp, it changes on every read — defeating caching entirely. ETags must derive from the resource's content or version, not from read-side metadata.

   5. **Returning 200 instead of 304.** If the client sends `If-None-Match` and the ETag matches, you must return `304 Not Modified` — not `200 OK` with the full body. A `200` wastes bandwidth and tells the client its cache logic is broken.

   ## Details

   ### ETag Generation Strategies

   | Strategy                        | Pros                         | Cons                                         |
   | ------------------------------- | ---------------------------- | -------------------------------------------- |
   | Content hash (SHA-256 of body)  | Exact, content-addressable   | Requires computing the body before comparing |
   | Database version column         | Fast, no computation         | Requires schema change                       |
   | `updated_at` timestamp          | No schema change             | One-second resolution limit, clock skew risk |
   | Composite (version + timestamp) | Balances speed and precision | Slightly more complex                        |

   For APIs backed by a database, a version column (auto-incrementing integer or UUID) is the most practical ETag source. Include the resource ID to prevent cross-resource collisions: `"user-42-v5"`.

   ### Conditional DELETE

   DELETE with `If-Match` prevents deleting a resource that was modified since the client last read it:

   ```http
   DELETE /documents/doc-7
   If-Match: "doc-7-v4"
   → 204 No Content
   ```

   If another client modified the document after your read, the DELETE fails with `412`. This prevents accidental deletion of modified content.

   ### Real-World Case Study: CouchDB's MVCC

   CouchDB uses ETags and `If-Match` as the primary concurrency control mechanism. Every document has a `_rev` field that maps directly to the ETag. Updates require `If-Match` (or `_rev` in the body) — without it, the update is rejected. This eliminates lost updates in a distributed database without pessimistic locking. The `_rev` approach is essentially ETags implemented at the storage layer, proving the pattern scales to multi-node distributed systems.

   ## Source
   - [RFC 9110 — HTTP Semantics, Section 13: Conditional Requests](https://www.rfc-editor.org/rfc/rfc9110#section-13)
   - [RFC 9110 — HTTP Semantics, Section 8.8: Validator Fields](https://www.rfc-editor.org/rfc/rfc9110#section-8.8)
   - [MDN — HTTP Conditional Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Conditional_requests)
   - [Google Cloud API Design Guide — ETags](https://cloud.google.com/apis/design/design_patterns#etags)

   ## Process
   1. Add ETag generation to all GET endpoints: use database version columns, content hashes, or composite keys.
   2. On GET with `If-None-Match`, compare the provided ETag to the current one. If they match, return `304 Not Modified` with no body.
   3. On PUT/PATCH with `If-Match`, compare the provided ETag to the current one. If they do not match, return `412 Precondition Failed` with an error body explaining the conflict.
   4. Document concurrency behavior in your API spec: which endpoints require `If-Match`, what happens when it is omitted, and how clients should resolve conflicts.
   5. Run `harness validate` to confirm skill files are well-formed.

   ## Harness Integration
   - **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
   - **No tools or state** -- consumed as context by other skills and agents.
   - **related_skills:** api-http-caching, api-http-methods, api-status-codes, db-optimistic-locking, api-idempotency-keys

   ## Success Criteria
   - All cacheable GET endpoints return an `ETag` header.
   - GET requests with `If-None-Match` return `304 Not Modified` when the resource is unchanged.
   - PUT and PATCH endpoints check `If-Match` and return `412 Precondition Failed` on ETag mismatch.
   - ETags derive from content or version data, not from mutable read-side metadata.
   - The API documentation specifies concurrency behavior for every write endpoint.

   ```

   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add api-conditional-requests knowledge skill (claude-code)`

---

### Task 6: Validate all 5 claude-code skills

**Depends on:** Tasks 1-5
**Files:** none (validation only)

1. Run `harness validate` and confirm all 5 new skills pass.
2. Verify SKILL.md line counts are within 150-250 range:
   ```bash
   wc -l agents/skills/claude-code/api-http-methods/SKILL.md
   wc -l agents/skills/claude-code/api-status-codes/SKILL.md
   wc -l agents/skills/claude-code/api-content-negotiation/SKILL.md
   wc -l agents/skills/claude-code/api-http-caching/SKILL.md
   wc -l agents/skills/claude-code/api-conditional-requests/SKILL.md
   ```
3. Verify all 8 sections present in each SKILL.md (Intro Hook, When to Use, Instructions, Details, Source, Process, Harness Integration, Success Criteria).
4. Verify each skill.yaml has correct `type: knowledge`, `tier: 3`, `cognitive_mode: advisory-guide`, `tools: []`, 4 platforms.

---

### Task 7: Sync all 5 skills to gemini-cli platform

**Depends on:** Task 6
**Files:**

- `agents/skills/gemini-cli/api-http-methods/SKILL.md` — identical to claude-code
- `agents/skills/gemini-cli/api-http-methods/skill.yaml` — same content, `stability` after `state`
- `agents/skills/gemini-cli/api-status-codes/SKILL.md`
- `agents/skills/gemini-cli/api-status-codes/skill.yaml`
- `agents/skills/gemini-cli/api-content-negotiation/SKILL.md`
- `agents/skills/gemini-cli/api-content-negotiation/skill.yaml`
- `agents/skills/gemini-cli/api-http-caching/SKILL.md`
- `agents/skills/gemini-cli/api-http-caching/skill.yaml`
- `agents/skills/gemini-cli/api-conditional-requests/SKILL.md`
- `agents/skills/gemini-cli/api-conditional-requests/skill.yaml`

1. For each skill, create directory and copy SKILL.md from claude-code.
2. For each skill.yaml, write identical content to claude-code except: move `stability: static` to after the `state:` block (before `depends_on:`).

   **gemini-cli skill.yaml field order:**

   ```yaml
   name: api-<skill-id>
   version: '1.0.0'
   description: <same>
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths: []
   related_skills:
     - <same>
   stack_signals:
     - <same>
   keywords:
     - <same>
   metadata:
     author: community
     upstream: <same>
   state:
     persistent: false
     files: []
   stability: static
   depends_on: []
   ```

3. Run `harness validate` to confirm.

---

### Task 8: Sync all 5 skills to cursor platform

**Depends on:** Task 6
**Files:**

- `agents/skills/cursor/api-http-methods/SKILL.md` — identical to claude-code
- `agents/skills/cursor/api-http-methods/skill.yaml` — same content, `stability` after `state`
- `agents/skills/cursor/api-status-codes/SKILL.md`
- `agents/skills/cursor/api-status-codes/skill.yaml`
- `agents/skills/cursor/api-content-negotiation/SKILL.md`
- `agents/skills/cursor/api-content-negotiation/skill.yaml`
- `agents/skills/cursor/api-http-caching/SKILL.md`
- `agents/skills/cursor/api-http-caching/skill.yaml`
- `agents/skills/cursor/api-conditional-requests/SKILL.md`
- `agents/skills/cursor/api-conditional-requests/skill.yaml`

1. Same process as Task 7 but under `agents/skills/cursor/`.
2. Uses same field ordering convention as gemini-cli (`stability` after `state`).
3. Run `harness validate` to confirm.

---

### Task 9: Sync all 5 skills to codex platform

**Depends on:** Task 6
**Files:**

- `agents/skills/codex/api-http-methods/SKILL.md` — identical to claude-code
- `agents/skills/codex/api-http-methods/skill.yaml` — same content, `stability` after `state`
- `agents/skills/codex/api-status-codes/SKILL.md`
- `agents/skills/codex/api-status-codes/skill.yaml`
- `agents/skills/codex/api-content-negotiation/SKILL.md`
- `agents/skills/codex/api-content-negotiation/skill.yaml`
- `agents/skills/codex/api-http-caching/SKILL.md`
- `agents/skills/codex/api-http-caching/skill.yaml`
- `agents/skills/codex/api-conditional-requests/SKILL.md`
- `agents/skills/codex/api-conditional-requests/skill.yaml`

1. Same process as Task 7 but under `agents/skills/codex/`.
2. Uses same field ordering convention as gemini-cli (`stability` after `state`).
3. Run `harness validate` to confirm.

---

### Task 10: Final validation and harness validate

**Depends on:** Tasks 7-9
**Files:** none (validation only)

1. Verify file count: 40 new files total (5 skills x 2 files x 4 platforms).
   ```bash
   find agents/skills/*/api-http-methods -type f | wc -l     # should be 8
   find agents/skills/*/api-status-codes -type f | wc -l     # should be 8
   find agents/skills/*/api-content-negotiation -type f | wc -l  # should be 8
   find agents/skills/*/api-http-caching -type f | wc -l     # should be 8
   find agents/skills/*/api-conditional-requests -type f | wc -l # should be 8
   ```
2. Verify SKILL.md identity across platforms:
   ```bash
   diff agents/skills/claude-code/api-http-methods/SKILL.md agents/skills/gemini-cli/api-http-methods/SKILL.md
   diff agents/skills/claude-code/api-http-methods/SKILL.md agents/skills/cursor/api-http-methods/SKILL.md
   diff agents/skills/claude-code/api-http-methods/SKILL.md agents/skills/codex/api-http-methods/SKILL.md
   # repeat for all 5 skills
   ```
3. Run `harness validate` — expect `validation passed`.
4. Verify cross-references are bidirectionally consistent:
   - `api-http-methods` references `api-status-codes` and `api-status-codes` references `api-http-methods`.
   - `api-http-caching` references `api-conditional-requests` and vice versa.
   - `api-http-caching` references `perf-cdn-cache-control` (outbound to existing skill).
   - `api-conditional-requests` references `db-optimistic-locking` (outbound to existing skill).

---

### Task 11: Write session handoff

**Depends on:** Task 10
**Files:**

- `.harness/sessions/changes--api-design-knowledge-skills--proposal/handoff.json`

1. Write handoff.json with:
   - `phase: "COMPLETE"`
   - All 11 tasks listed in `completed`
   - Empty `pending` and `blockers`
   - Forward-reference concerns for Phase 3+ skills
   - Decisions made during execution
   - Learnings from Phase 1 applied
