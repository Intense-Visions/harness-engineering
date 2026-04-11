# API Error Contracts

> ERROR CONTRACTS DEFINE THE MACHINE-READABLE STRUCTURE, HUMAN-READABLE MESSAGE, AND ACTIONABLE REMEDIATION FOR EVERY FAILURE MODE — CONSISTENT ERROR RESPONSE DESIGN LETS CLIENTS HANDLE ERRORS PROGRAMMATICALLY WITHOUT PARSING FREE-TEXT OR REVERSE-ENGINEERING FAILURE SEMANTICS.

## When to Use

- Designing the error response shape for a new API or service before writing any handlers
- Reviewing a PR that returns unstructured error strings or inconsistent error shapes across endpoints
- Establishing an API style guide section on error response standards for a team or organization
- Auditing an existing API whose clients report confusion about how to distinguish error categories
- Choosing between application-level error codes (e.g., `CARD_DECLINED`) and HTTP status codes for client routing
- Building SDKs or client libraries that need to surface typed, catchable error objects to callers
- Implementing error monitoring and alerting where machine-readable codes are required to classify alerts
- Documenting all possible error conditions for each endpoint in an OpenAPI specification

## Instructions

### Key Concepts

1. **Machine-readable error codes** — An application-level error code (`"code": "INSUFFICIENT_FUNDS"`) is distinct from the HTTP status code. It identifies the specific failure type within a category so clients can branch on it without parsing free-text messages. Example: two Stripe `402` responses may have `"code": "card_declined"` or `"code": "expired_card"` — the HTTP status routes to the payment-failure handler; the code selects the message shown to the user.

2. **Human-readable messages** — The `message` field is for developers reading logs or API explorer output, not for display in end-user interfaces. It should be complete and unambiguous: `"The card ending in 4242 was declined by the issuer"` rather than `"Card error"`. Avoid exposing internal implementation details, stack traces, or database error messages.

3. **Actionable remediation** — Every error response should answer: "What should the caller do next?" The `"detail"` field (per RFC 9457) or a dedicated `"suggestion"` field communicates the next step: `"Retry with a different payment method"`, `"Check that the field matches ISO 8601 format"`, or `"Contact support with reference ID abc-123"`. Errors without remediation guidance shift the debugging burden to the caller.

4. **Error taxonomy** — Group error codes into categories that map to HTTP status classes: authentication errors (`401`), authorization errors (`403`), validation errors (`422`), business-rule violations (`409`/`422`), and server faults (`500`). A taxonomy prevents code proliferation and makes documentation searchable. Publish the full taxonomy in API reference docs; include a `type` URI (per RFC 9457) so clients can link to the documentation for each error type.

5. **Consistent envelope structure** — Every error response from every endpoint must use the same JSON shape. Mixing `{ "error": "..." }`, `{ "message": "...", "errors": [...] }`, and `{ "code": ..., "description": ... }` across endpoints breaks SDK code generation and forces client-side shape detection. Choose one envelope (RFC 9457 Problem Details is the recommended standard) and enforce it at the framework/middleware level.

6. **Error reference IDs** — For server-side faults (`5xx`), include a unique `instance` or `traceId` field that correlates the response to a specific log entry. This enables support teams to locate the root cause without asking users to reproduce the issue. Example: `"instance": "/errors/7f3a-bc91-..."` or `"traceId": "abc-123-xyz"`.

### Worked Example

Stripe's error contract is one of the most studied in production APIs. It uses a consistent envelope across all failure modes:

**Payment declined (402 Payment Required):**

```http
POST /v1/charges
Authorization: Bearer sk_example_...
Content-Type: application/x-www-form-urlencoded

amount=2000&currency=usd&source=tok_chargeDeclined
```

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "error": {
    "type": "card_error",
    "code": "card_declined",
    "decline_code": "insufficient_funds",
    "message": "Your card has insufficient funds.",
    "param": "source",
    "charge": "ch_3N..."
  }
}
```

**Invalid API key (401 Unauthorized):**

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": {
    "type": "authentication_error",
    "code": "api_key_invalid",
    "message": "No such API key: sk_example_****abc.",
    "doc_url": "https://stripe.com/docs/error-codes/api-key-invalid"
  }
}
```

**Missing required parameter (400 Bad Request):**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "type": "invalid_request_error",
    "code": "parameter_missing",
    "message": "Missing required param: amount.",
    "param": "amount",
    "doc_url": "https://stripe.com/docs/error-codes/parameter-missing"
  }
}
```

Stripe's taxonomy (`card_error`, `authentication_error`, `invalid_request_error`, `api_error`, `idempotency_error`) maps cleanly to HTTP status ranges. The `code` field gives a programmatic subcategory; `param` identifies the offending field; `doc_url` links to remediation. SDK clients switch on `error.type` for top-level routing and `error.code` for specific handling — without any free-text parsing.

### Anti-Patterns

1. **Free-text error strings only.** `{ "error": "Something went wrong" }` or `{ "message": "Invalid input" }` forces clients to parse English prose to determine the error type. Localization, rewording, or phrasing changes in the message silently break clients that pattern-match on strings. Fix: always include a machine-readable `code` field alongside the human-readable `message`.

2. **Inconsistent envelope shape across endpoints.** When one endpoint returns `{ "error": { "message": "..." } }` and another returns `{ "errors": ["..."] }` and a third returns `{ "status": "error", "reason": "..." }`, client error handling requires per-endpoint special cases. Fix: enforce a single error shape at the middleware or gateway layer so every response is shaped identically before leaving the server.

3. **Leaking internal error details.** Including `"sqlState": "23000"`, `"stackTrace": "..."`, or `"internalMessage": "NullPointerException at line 42"` in error responses exposes implementation internals, aids attackers, and creates API surface that clients may start depending on. Fix: log internal details server-side and surface only a `traceId` for correlation. The public error contains only what is safe and useful for the caller.

4. **Omitting actionable remediation.** An error like `{ "code": "RATE_LIMITED" }` without a `Retry-After` header or a `detail` explaining when to retry is incomplete. The caller either retries immediately (worsening the rate-limit problem) or gives up unnecessarily. Fix: every error response should include what the caller should do next — retry timing, which parameter to fix, or where to get help.

## Details

### Error Code Naming Conventions

Error codes should use consistent casing (SCREAMING_SNAKE_CASE for application codes is common; `snake_case` is used by Stripe and GitHub). Codes must be stable across API versions — changing `CARD_DECLINED` to `PAYMENT_DECLINED` is a breaking change for any client that switches on the code. Prefix codes by domain when the taxonomy is large: `AUTH_TOKEN_EXPIRED`, `PAYMENT_CARD_DECLINED`, `VALIDATION_FIELD_REQUIRED`.

### Error Documentation Requirements

Every published error code should be documented with: the HTTP status code it accompanies, a description of when it occurs, the fields present in the response for this code, and recommended client action. This documentation is the contract — treat removals or renames as breaking changes.

### Real-World Case Study: Twilio Error Contracts

Twilio maintains a published error dictionary at `twilio.com/docs/api/errors` with over 600 documented error codes. Each code has a dedicated page with: description, possible causes, and suggested resolution steps. When Twilio's REST API returns an error, it includes `"code": 21211` (for example) alongside the HTTP `400` status. Clients look up the code in documentation or switch on it directly. Twilio's developer surveys show that APIs with published error taxonomies reduce average debugging time by 40-60% compared to APIs that return only HTTP status codes and free-text messages. The combination of stable machine-readable codes and linked documentation is the highest-leverage investment in API error design.

## Source

- [Creating Good API Errors in REST, GraphQL, and gRPC — APIs You Won't Hate](https://apisyouwonthate.com/blog/creating-good-api-errors-in-rest-graphql-and-grpc)
- [RFC 9457 — Problem Details for HTTP APIs](https://rfc-editor.org/rfc/rfc9457)
- [Stripe API Error Reference](https://stripe.com/docs/api/errors)
- [Twilio Error and Warning Dictionary](https://www.twilio.com/docs/api/errors)
- [Microsoft REST API Guidelines — Error Responses](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md#error-responses)

## Process

1. Define the error envelope structure: choose RFC 9457 Problem Details or a documented custom shape, and enforce it at the framework level across all endpoints.
2. Create an error taxonomy document listing every application-level error code, its HTTP status, its description, and its recommended client action.
3. For each endpoint, document all possible error codes in the OpenAPI spec under the appropriate `4xx`/`5xx` response schemas.
4. Implement an error serialization middleware that maps internal exceptions to the canonical error envelope — never let raw exception types reach the serializer.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-problem-details-rfc, api-status-codes, api-validation-errors, api-bulk-operations

## Success Criteria

- Every error response across all endpoints uses the same JSON envelope structure.
- All error responses include a stable, machine-readable `code` field alongside the human-readable `message`.
- No error response exposes internal stack traces, SQL errors, or raw exception messages.
- Every `5xx` response includes a `traceId` or `instance` field for log correlation.
- The full error taxonomy is published in API documentation with remediation guidance for each code.
