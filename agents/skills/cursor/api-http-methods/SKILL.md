# HTTP Methods

> HTTP METHODS ARE THE VERBS OF THE WEB — EACH METHOD CARRIES DEFINED SEMANTICS FOR SAFETY AND IDEMPOTENCY THAT ENABLE CACHING, SAFE RETRIES, AND CORRECT CLIENT BEHAVIOR. CHOOSING THE WRONG METHOD BREAKS THESE CONTRACTS AND FORCES CLIENTS TO GUESS AT SIDE EFFECTS.

## When to Use

- Designing a new REST endpoint and choosing the correct HTTP method
- Reviewing a PR that uses POST for all mutations or GET for state changes
- Deciding between PUT and PATCH for a partial-update endpoint
- Explaining to a team why GET requests must not have side effects
- Debugging a CDN that is not caching expected responses
- Implementing a retry strategy and determining which methods are safe to retry
- Evaluating whether a method choice will conflict with CORS preflight requirements
- Auditing an API for methods that violate safe/idempotent contracts

## Instructions

### Key Concepts

1. **Safety** — A method is safe if it does not modify server state. GET, HEAD, and OPTIONS are safe. Clients and intermediaries (CDNs, proxies) may freely retry safe requests. A safe method may have side effects (e.g., logging), but those effects must not be visible to the client as resource mutations.

2. **Idempotency** — A method is idempotent if sending the same request N times produces the same server state as sending it once. GET, HEAD, OPTIONS, PUT, and DELETE are idempotent. POST and PATCH are not idempotent by default. Idempotency enables safe retry on network failure without deduplication logic.

3. **GET** — Retrieve a resource representation. Safe and idempotent. Must not change state. Responses are cacheable by default. Never put sensitive data in query strings (logged in server access logs, browser history, Referer headers).

   ```http
   GET /orders/ord_abc123
   Accept: application/json
   ```

4. **POST** — Create a new resource or submit data for processing. Neither safe nor idempotent. Each request may produce a new resource or side effect. The response should include `201 Created` and a `Location` header pointing to the new resource, or `200 OK` for processing actions that return a result.

   ```http
   POST /orders
   Content-Type: application/json

   { "customerId": "cus_99", "items": [{ "sku": "SKU-1", "qty": 2 }] }
   ```

   ```http
   HTTP/1.1 201 Created
   Location: /orders/ord_abc123
   ```

5. **PUT** — Replace a resource in full. Idempotent but not safe. The request body must represent the complete desired state. Missing fields are set to null or defaults — not preserved from the prior state. Use PUT when the client constructs the full resource (e.g., file upload to a known key).

   ```http
   PUT /users/42/profile
   Content-Type: application/json

   { "name": "Alice", "email": "alice@example.com", "bio": "" }
   ```

6. **PATCH** — Apply a partial update to a resource. Not safe, not idempotent (unless the patch format guarantees it). The request body describes a diff or set of operations, not the full resource. Use PATCH when the client only wants to update specific fields. RFC 6902 (JSON Patch) and RFC 7396 (JSON Merge Patch) define standard patch formats.

   ```http
   PATCH /users/42/profile
   Content-Type: application/merge-patch+json

   { "bio": "Engineer at Acme Corp" }
   ```

7. **DELETE** — Remove a resource. Idempotent but not safe. Idempotency means the server state is identical after N calls as after one — not that the response code must be identical. Return `204 No Content` on success. A second DELETE should return `404 Not Found` (the resource genuinely does not exist); returning `204` again is a pragmatic convention that hides this information from callers and should not be chosen by default.

   ```http
   DELETE /orders/ord_abc123
   ```

   ```http
   HTTP/1.1 204 No Content
   ```

### Worked Example

Stripe's payment API demonstrates correct method semantics across the full lifecycle of a `PaymentIntent`:

**Create a payment intent (POST — not idempotent, creates a new resource):**

```http
POST /v1/payment_intents
Content-Type: application/x-www-form-urlencoded
Authorization: Bearer sk_live_...

amount=2000&currency=usd&customer=cus_99
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "pi_abc123",
  "object": "payment_intent",
  "amount": 2000,
  "status": "requires_payment_method"
}
```

Stripe returns `200 OK` (not `201`) here because the PaymentIntent is not yet a finalized resource, but the creation itself is an acknowledged RPC. This is a documented intentional exception — for standard REST resource creation, prefer `201 Created` with a `Location` header.

**Retrieve a payment intent (GET — safe, idempotent, cacheable):**

```http
GET /v1/payment_intents/pi_abc123
Authorization: Bearer sk_live_...
```

**Update amount (POST with explicit action — Stripe uses POST for mutations on sub-resources):**

```http
POST /v1/payment_intents/pi_abc123
Content-Type: application/x-www-form-urlencoded

amount=3000
```

**Cancel (DELETE equivalent — Stripe models this as POST /cancel action):**

```http
POST /v1/payment_intents/pi_abc123/cancel
```

Stripe's API is a well-known Level 2 departure that uses POST for nearly all mutations. This is a pragmatic choice for form-encoded APIs with complex state machines — but it sacrifices idempotency guarantees. For greenfield REST APIs, prefer PUT/PATCH/DELETE for their semantic precision.

### Anti-Patterns

1. **Using GET for state-changing operations.** A URL like `GET /users/42/delete` changes server state inside a safe method. CDNs will cache it, browsers will prefetch it, and link scanners will trigger it. The consequence can be mass accidental deletion. Always use DELETE for deletion, POST for non-idempotent actions.

2. **Using POST for all mutations.** An API that only exposes POST loses idempotency on updates and deletes, making retry logic complex. Clients cannot determine from the method whether a request is safe to retry. Use PUT/PATCH for updates and DELETE for deletions; reserve POST for creation and non-RESTful actions.

3. **Confusing PUT and PATCH.** Sending only changed fields via PUT causes the server to null out all omitted fields on a full replace. Sending the full resource body via PATCH is wasteful and confusing to consumers. Document and enforce the semantic: PUT = full replacement, PATCH = partial update. Validate that PUT requests include all required fields.

4. **Ignoring HEAD and OPTIONS.** HEAD is identical to GET but returns only headers — it allows clients to check resource existence, size, or cache freshness without downloading the body. OPTIONS is used by CORS preflight and by clients discovering allowed methods. Implement both on all resource endpoints; most frameworks provide them automatically.

## Details

### Method Properties Reference

| Method  | Safe | Idempotent | Body | Cacheable | Typical Status |
| ------- | ---- | ---------- | ---- | --------- | -------------- |
| GET     | yes  | yes        | no   | yes       | 200            |
| HEAD    | yes  | yes        | no   | yes       | 200            |
| OPTIONS | yes  | yes        | opt  | no        | 200, 204       |
| POST    | no   | no         | yes  | rarely    | 200, 201       |
| PUT     | no   | yes        | yes  | no        | 200, 204       |
| PATCH   | no   | no         | yes  | no        | 200, 204       |
| DELETE  | no   | yes        | opt  | no        | 200, 204       |

### Idempotency and Retries

Network failures occur between request send and response receipt. When the client does not know whether the server received and processed the request, the safest recovery strategy is to retry only idempotent methods (GET, HEAD, PUT, DELETE). For POST and PATCH, the client must use idempotency keys (see `api-idempotency-keys`) or accept the risk of duplicate processing.

### Real-World Case Study: GitHub REST API

GitHub's REST API uses all seven methods with textbook precision. `GET /repos/{owner}/{repo}/issues` lists issues with CDN caching. `POST /repos/{owner}/{repo}/issues` creates an issue (returns `201 Created`). `PATCH /repos/{owner}/{repo}/issues/{issue_number}` updates specific fields like `title` or `state`. `DELETE /repos/{owner}/{repo}/labels/{name}` removes a label idempotently. GitHub's disciplined method use means CDN cache hit rates for read-heavy list endpoints exceed 80% on public repos.

## Source

- [MDN — HTTP Request Methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)
- [RFC 9110 — HTTP Semantics, Section 9](https://www.rfc-editor.org/rfc/rfc9110#section-9)
- [RFC 5789 — PATCH Method for HTTP](https://www.rfc-editor.org/rfc/rfc5789)
- [RFC 7396 — JSON Merge Patch](https://www.rfc-editor.org/rfc/rfc7396)
- [RFC 6902 — JavaScript Object Notation (JSON) Patch](https://www.rfc-editor.org/rfc/rfc6902)

## Process

1. Identify the operation: retrieving state (GET), creating a new resource (POST), fully replacing a resource (PUT), partially updating a resource (PATCH), or removing a resource (DELETE).
2. Check safety and idempotency requirements: if the operation must be safe to retry without side effects, use GET/HEAD/PUT/DELETE. If it may produce duplicate side effects on retry, add idempotency key support or document that clients must not retry blindly.
3. Map the response status code to the method: POST creation → 201 with Location; successful mutations with no body → 204; successful mutations returning the updated resource → 200.
4. Validate that safe methods (GET, HEAD, OPTIONS) have zero side effects on the resource representation visible to clients.
5. Run `harness validate` to confirm skill files are well-formed.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-status-codes, api-idempotency-keys, api-rest-maturity-model, api-conditional-requests

## Success Criteria

- Every endpoint uses the HTTP method whose safety and idempotency properties match the operation's actual behavior.
- GET and HEAD requests produce no visible state changes on any resource.
- PUT requests replace the full resource; PATCH requests update only specified fields.
- POST creation responses return `201 Created` with a `Location` header.
- DELETE and PUT are safe to retry without idempotency keys; POST and PATCH endpoints either accept idempotency keys or document that retries may produce duplicates.
