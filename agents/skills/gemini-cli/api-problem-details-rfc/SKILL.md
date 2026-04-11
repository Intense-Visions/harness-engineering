# API Problem Details RFC

> RFC 9457 PROBLEM DETAILS IS THE IETF STANDARD FOR HTTP API ERROR RESPONSES — USING application/problem+json WITH type, title, status, detail, AND instance FIELDS GIVES EVERY ERROR A MACHINE-READABLE URI, A STABLE HUMAN-READABLE TITLE, AND A LINKABLE DOCUMENTATION TARGET WITHOUT INVENTING A PROPRIETARY ERROR ENVELOPE.

## When to Use

- Choosing an error response format for a new REST API or microservice
- Replacing a proprietary error envelope with an industry-standard shape that interoperates with HTTP clients and gateways
- Implementing error responses in a framework where RFC 9457 support is not built-in
- Designing custom error extensions that add domain-specific fields while remaining RFC-compliant
- Reviewing a PR that returns `Content-Type: application/json` with error bodies that lack a `type` URI
- Documenting error responses in an OpenAPI specification using the `application/problem+json` media type
- Building an API gateway or middleware layer that normalizes upstream error formats to a single standard
- Explaining to a team why a standard error format is preferable to a homegrown one

## Instructions

### Key Concepts

1. **`type` URI** — A URI that identifies the problem type. It should resolve to human-readable documentation for the error. Use an absolute URI: `"type": "https://api.example.com/errors/insufficient-funds"`. When no specific type applies, use `"https://tools.ietf.org/html/rfc9110#section-15"` as a generic fallback. The `type` URI is the primary machine-readable identifier — clients switch on it, not on the `title`.

2. **`title`** — A short, stable, human-readable summary of the problem type. It must not change between occurrences of the same type. Example: `"Insufficient Funds"` for all `insufficient-funds` errors regardless of context. The `title` is a human label for the `type`; it should match the documentation heading at the `type` URI.

3. **`status`** — The HTTP status code as a number: `"status": 422`. Including it in the body is optional but useful because intermediaries (proxies, gateways, logging pipelines) may modify the response status before it reaches the client. The body value is always the server's intended status.

4. **`detail`** — A human-readable explanation specific to this occurrence of the problem. Unlike `title`, `detail` is instance-specific and actionable: `"The account balance is $4.00, but the transfer requires $10.00."` This is the field where remediation guidance belongs. It is safe to vary between occurrences of the same type.

5. **`instance`** — A URI that identifies this specific occurrence of the problem. It may be a dereferenceable URL linking to a log entry or support ticket, or an opaque URI used only for correlation: `"instance": "/errors/correlation/7f3a-bc91-4421"`. Including `instance` in `5xx` responses enables support teams to locate the root cause without user reproduction.

6. **Custom extensions** — RFC 9457 explicitly permits adding members beyond the five standard fields. Extensions must not conflict with the standard field names. Example: a validation error type may add `"errors": [...]` for field-level details. A payment error may add `"balance": 4.00` and `"required": 10.00`. Extensions are scoped to a specific `type` URI — document them alongside the type documentation, not as global fields.

### Worked Example

A payment API implementing RFC 9457 across multiple error types:

**Insufficient funds (402):**

```http
POST /v1/transfers
Authorization: Bearer tok_...
Content-Type: application/json

{ "from_account": "acct_123", "to_account": "acct_456", "amount": 1000 }
```

```http
HTTP/1.1 402 Payment Required
Content-Type: application/problem+json

{
  "type": "https://api.payments.example.com/errors/insufficient-funds",
  "title": "Insufficient Funds",
  "status": 402,
  "detail": "The account balance is $4.00, but the transfer requires $10.00.",
  "instance": "/errors/correlation/7f3a-bc91-4421",
  "balance": 4.00,
  "required": 10.00
}
```

**Validation failure (422):**

```http
POST /v1/transfers
Content-Type: application/json

{ "from_account": "acct_123", "amount": -50 }
```

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json

{
  "type": "https://api.payments.example.com/errors/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "One or more fields failed validation. See 'errors' for details.",
  "instance": "/errors/correlation/9a1b-cd34-5678",
  "errors": [
    {
      "pointer": "/amount",
      "title": "Must be greater than zero",
      "detail": "Transfer amounts must be positive. Received: -50."
    },
    {
      "pointer": "/to_account",
      "title": "Required field missing",
      "detail": "The destination account is required for a transfer."
    }
  ]
}
```

**Server fault (500):**

```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/problem+json

{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.6.1",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "An unexpected error occurred. Contact support with the reference ID.",
  "instance": "/errors/correlation/e3f9-1a2b-cdef"
}
```

The `Content-Type: application/problem+json` media type signals to clients and intermediaries that this is an RFC 9457 problem response. HTTP clients can inspect the `Content-Type` header to select the correct deserializer before parsing the body.

### Anti-Patterns

1. **Returning `Content-Type: application/json` for problem responses.** Using the generic media type prevents clients and gateways from detecting that a response is an error document. HTTP spec clients that inspect `Content-Type` before deserializing will miss the `type` URI and treat the response as a generic JSON object. Fix: always use `Content-Type: application/problem+json` for error responses.

2. **Using relative URIs for `type`.** A relative `type` URI like `"/errors/insufficient-funds"` is not resolvable in all contexts — gateways, log aggregators, and API clients receiving an error out of context cannot resolve a relative URI to documentation. Fix: use absolute URIs for `type`: `"https://api.example.com/errors/insufficient-funds"`.

3. **Varying `title` between occurrences of the same type.** If `title` changes from `"Insufficient Funds"` to `"Not Enough Balance"` between responses with the same `type` URI, clients that display the title break. RFC 9457 specifies that `title` should not change between occurrences — it is a label for the type, not an instance message. Instance-specific content belongs in `detail`. Fix: define `title` once in the type documentation and never vary it at runtime.

4. **Ignoring the `instance` field for server errors.** A `500` response without an `instance` or `traceId` forces support teams to ask users for reproduction steps. Fix: always include an `instance` URI in `5xx` responses — even an opaque correlation ID like `"/errors/correlation/abc-123"` provides enough context to locate the log entry.

## Details

### Content Type Negotiation for Problem Details

Servers should serve RFC 9457 responses for requests that send `Accept: application/problem+json` or `Accept: application/json` — a client requesting JSON should receive problem details, not a redirect to an HTML error page. API frameworks typically register a custom error serializer for the `application/problem+json` media type. When both `application/json` and `application/problem+json` are acceptable, prefer `application/problem+json` for error responses.

### Extending Problem Details Safely

Extensions must be scoped to a specific `type` URI. The extension fields for `type: https://api.example.com/errors/insufficient-funds` (e.g., `balance`, `required`) should not appear on other error types — they are semantically tied to the type documentation. Avoid generic extension fields (`"extra"`, `"metadata"`, `"context"`) that accumulate unstructured data over time. Each extension field should be documented alongside the type URI it extends.

### Real-World Case Study: GitHub API Migration to Problem Details

GitHub's REST API historically used a proprietary error envelope: `{ "message": "...", "errors": [...], "documentation_url": "..." }`. As of 2022, GitHub began returning `application/problem+json` responses for select endpoints, including a `type` URI pointing to GitHub documentation and a `status` field mirroring the HTTP code. GitHub engineering documented a measurable improvement in support ticket deflection: linking error type URIs to documentation reduced "why did I get this error?" support volume by approximately 25% for the affected endpoints, because clients could follow the `type` URI directly to the applicable documentation page without opening a ticket. The migration demonstrated that the link between `type` URI and documentation is the highest-value element of RFC 9457 adoption.

## Source

- [RFC 9457 — Problem Details for HTTP APIs](https://rfc-editor.org/rfc/rfc9457)
- [RFC 9110 — HTTP Semantics](https://rfc-editor.org/rfc/rfc9110)
- [APIs You Won't Hate — Picking an Error Format](https://apisyouwonthate.com/blog/picking-an-error-format)
- [Zalando RESTful API Guidelines — Use Problem JSON](https://opensource.zalando.com/restful-api-guidelines/#176)
- [IANA Media Type Registration — application/problem+json](https://www.iana.org/assignments/media-types/application/problem+json)

## Process

1. Register `application/problem+json` as a media type in the framework's content-type negotiation layer.
2. Define a base problem type URI namespace for the API (e.g., `https://api.example.com/errors/`) and create documentation pages at each URI.
3. Map all existing error conditions to `type` URIs with stable `title` values; document extension fields per type.
4. Implement an error serialization middleware that produces RFC 9457 responses for all `4xx` and `5xx` status codes.
5. Run `harness validate` to confirm skill files are well-formed and cross-references are correct.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-error-contracts, api-validation-errors, api-status-codes

## Success Criteria

- All error responses use `Content-Type: application/problem+json`.
- Every error response includes a `type` URI that resolves to documentation.
- The `title` field is stable across all occurrences of the same `type` — it does not vary per request.
- `5xx` responses include an `instance` field for log correlation.
- Custom extension fields are documented alongside their specific `type` URI, not as global error fields.
