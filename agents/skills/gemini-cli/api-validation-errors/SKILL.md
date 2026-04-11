# API Validation Errors

> FIELD-LEVEL VALIDATION ERROR DESIGN — RETURNING ALL VALIDATION FAILURES IN A SINGLE RESPONSE WITH JSON POINTER PATHS AND PER-FIELD MESSAGES ELIMINATES THE ONE-ERROR-AT-A-TIME DEBUGGING LOOP AND GIVES CLIENTS ENOUGH INFORMATION TO HIGHLIGHT EVERY INVALID FIELD WITHOUT A SECOND REQUEST.

## When to Use

- Designing the validation error response for a form submission, resource creation, or bulk import endpoint
- Reviewing a PR that returns `400` with a single error message for a request that may have multiple invalid fields
- Choosing between `400 Bad Request` and `422 Unprocessable Entity` for semantic validation failures
- Implementing field-level error display in a client application that consumes API validation responses
- Building an API that mirrors JSON:API error object conventions or RFC 9457 validation extensions
- Documenting the validation error schema for an OpenAPI specification
- Designing error responses for a nested resource where invalid fields may be deep in the payload hierarchy
- Auditing an existing API whose clients report that form validation requires multiple round-trips to surface all errors

## Instructions

### Key Concepts

1. **Multi-field error arrays** — A single validation response should report all failing fields simultaneously, not just the first one encountered. The response body includes an array of error objects, each describing one invalid field: `"errors": [{ "pointer": "/email", ... }, { "pointer": "/birthdate", ... }]`. Stopping at the first failure creates a "whack-a-mole" experience where callers must submit, fail, fix, and resubmit for each field in turn.

2. **JSON Pointer (RFC 6901)** — A standardized syntax for identifying a specific value within a JSON document. Pointers use `/` as a separator: `/user/email` identifies the `email` field inside a `user` object; `/items/0/price` identifies the `price` of the first element in an `items` array. In validation error responses, the `pointer` (or `source.pointer` in JSON:API) field identifies exactly which part of the request body failed validation — no ambiguity, no path string parsing.

3. **`source/pointer` vs `source/parameter`** — JSON:API distinguishes two sources of validation error:
   - `"source": { "pointer": "/data/attributes/email" }` — the error is in the request body, at a JSON Pointer location.
   - `"source": { "parameter": "filter[status]" }` — the error is in a query parameter, not the body.
     Use `pointer` for body fields, `parameter` for query string inputs. RFC 9457 extensions use `"pointer"` directly as a top-level extension field rather than nesting under `source`.

4. **422 vs 400** — Use `400 Bad Request` for structurally malformed requests: unparseable JSON, missing `Content-Type`, invalid URL path parameters. Use `422 Unprocessable Entity` for requests that are syntactically valid but semantically invalid: a correctly parsed JSON body where `email` is not an email address, `end_date` precedes `start_date`, or a required field is present but empty. The distinction matters because `422` tells the client "your request reached the validation layer and failed there" — it is never retryable without changing the payload.

5. **Per-field titles and details** — Each error object in the array should include a stable `title` (the validation rule that failed: `"Must be a valid email address"`) and an instance-specific `detail` (`"'not-an-email' is not a valid email address format"`). The `title` is reusable across occurrences of the same rule; `detail` adds the specific value that failed, making it debuggable without inspecting the original request.

### Worked Example

A Stripe-style account creation endpoint returning multi-field validation errors:

**Request with multiple invalid fields:**

```http
POST /v1/accounts
Authorization: Bearer sk_test_...
Content-Type: application/json

{
  "email": "not-an-email",
  "country": "XX",
  "business_type": "individual",
  "individual": {
    "dob": {
      "day": 32,
      "month": 13,
      "year": 1850
    }
  }
}
```

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json

{
  "type": "https://api.example.com/errors/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "3 fields failed validation. Correct the highlighted fields and resubmit.",
  "instance": "/errors/correlation/a1b2-c3d4",
  "errors": [
    {
      "pointer": "/email",
      "title": "Must be a valid email address",
      "detail": "'not-an-email' does not match the expected email format."
    },
    {
      "pointer": "/country",
      "title": "Must be a valid ISO 3166-1 alpha-2 country code",
      "detail": "'XX' is not a recognized country code."
    },
    {
      "pointer": "/individual/dob/day",
      "title": "Day must be between 1 and 31",
      "detail": "Received 32. Days in a month range from 1 to 31."
    }
  ]
}
```

The `pointer` paths use RFC 6901 syntax: `/email` addresses the top-level field; `/individual/dob/day` drills into the nested `individual.dob.day` path. A client rendering a form can use each `pointer` to highlight the exact input that failed without any string parsing.

**Query parameter validation error (400 Bad Request):**

```http
GET /v1/payments?status=unknownstatus&limit=abc
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json

{
  "type": "https://api.example.com/errors/invalid-query-parameter",
  "title": "Invalid Query Parameter",
  "status": 400,
  "detail": "2 query parameters are invalid.",
  "errors": [
    {
      "parameter": "status",
      "title": "Must be one of: pending, succeeded, failed",
      "detail": "'unknownstatus' is not a valid status value."
    },
    {
      "parameter": "limit",
      "title": "Must be an integer",
      "detail": "'abc' cannot be parsed as an integer."
    }
  ]
}
```

Query parameter errors use `"parameter"` instead of `"pointer"` because they are not in the request body.

### Anti-Patterns

1. **Returning a single error for the first failing field.** A form with 5 invalid fields returns only the first error. The user fixes it, resubmits, receives the second error, and so on for 5 round-trips. Fix: validate the entire request body, collect all errors, and return the full list in a single `422` response.

2. **Using vague path strings instead of RFC 6901 pointers.** `"field": "individual.dob.day"` uses dot notation that requires parsing and breaks for array indices. `"field": "items[0].price"` uses a mix of dot and bracket notation with no standard. Fix: use RFC 6901 JSON Pointer syntax (`"/individual/dob/day"`, `"/items/0/price"`) — it is unambiguous, parseable by standard libraries, and consistent across implementations.

3. **Returning `400` for semantic validation failures.** A request body that is valid JSON but contains an email address string that fails the email format check is not malformed — it passed JSON parsing. Returning `400` mixes structural errors with semantic ones, complicating client error routing. Fix: reserve `400` for structural failures (unparseable JSON, wrong Content-Type) and use `422` for any failure that occurs after successful parsing and type coercion.

4. **Omitting the `pointer` for nested fields.** Returning `{ "field": "dob", "message": "Invalid date of birth" }` for a nested field fails to identify which level of nesting failed, and whether `dob.day`, `dob.month`, or `dob.year` is the problem. Fix: use the full JSON Pointer path to the failing field, however deep it is in the payload.

## Details

### JSON Pointer Encoding

RFC 6901 defines two escape sequences for characters that conflict with the pointer syntax: `~0` represents a literal `~`, and `~1` represents a literal `/`. If a field name contains a slash — e.g., `"Content-Type"` — the pointer is `/Content~1Type`. This is rare in practice but important when generating pointers programmatically from field names.

### Validation Error Design for Arrays

For bulk operations or array inputs, the `pointer` must include the array index: `/items/2/quantity` identifies the `quantity` field of the third element (zero-indexed) in the `items` array. This is essential for bulk import endpoints where clients need to know which rows failed without re-matching errors to rows by field name.

### Real-World Case Study: Shopify GraphQL Validation Errors

Shopify's Admin API (both REST and GraphQL) returns structured validation errors with field paths. In the REST API, errors follow a `{ "errors": { "field_name": ["message"] } }` shape. In the GraphQL API, errors use the `userErrors` pattern: `{ "userErrors": [{ "field": ["lineItems", "0", "quantity"], "message": "Quantity must be greater than zero" }] }`. The `field` array is equivalent to a JSON Pointer path split on `/`. Shopify's developer documentation shows that APIs returning structured field-path errors report significantly fewer "which field caused the error?" support questions than APIs returning only top-level messages. The field path is the minimum information needed for a client to display inline validation feedback without guessing.

## Source

- [JSON:API — Error Objects](https://jsonapi.org/format/#error-objects)
- [RFC 6901 — JavaScript Object Notation (JSON) Pointer](https://rfc-editor.org/rfc/rfc6901)
- [RFC 9457 — Problem Details for HTTP APIs](https://rfc-editor.org/rfc/rfc9457)
- [Shopify API — Error Handling](https://shopify.dev/docs/api/usage/response-codes)
- [APIs You Won't Hate — Validation Errors](https://apisyouwonthate.com/blog/rest-api-error-choose-your-own-adventure)

## Process

1. Identify all inputs that require validation: request body fields, path parameters, query parameters, and headers.
2. Run validation against all fields and collect the complete error list before constructing the response.
3. Map each error to a `pointer` (for body fields using RFC 6901) or `parameter` (for query string inputs).
4. Construct the `422` response with an `errors` array containing per-field `title` and `detail` entries.
5. Run `harness validate` to confirm skill files are well-formed and cross-references are correct.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-problem-details-rfc, api-error-contracts, api-bulk-operations, api-status-codes

## Success Criteria

- Validation responses include all failing fields in a single response, never just the first one.
- Field paths use RFC 6901 JSON Pointer syntax (`/field/subfield/index`), not dot notation or custom path formats.
- `422 Unprocessable Entity` is used for semantic validation failures; `400 Bad Request` is reserved for structural/parse failures.
- Each error object includes a stable `title` (the rule) and an instance-specific `detail` (the offending value and why it failed).
- Query parameter errors use a `parameter` field, not a `pointer` field.
