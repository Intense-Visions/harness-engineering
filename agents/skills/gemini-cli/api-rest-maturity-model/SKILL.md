# Richardson Maturity Model

> The Richardson Maturity Model grades REST APIs on a four-level scale — from RPC-over-HTTP tunneling (Level 0) to full hypermedia controls (Level 3). Each level adds constraints that improve discoverability, cacheability, and client-server decoupling.

## When to Use

- Evaluating an existing API's design maturity before a major revision
- Deciding how far to take REST constraints on a new project
- Explaining to stakeholders why "JSON over POST" is not REST
- Reviewing a PR that adds a new resource endpoint
- Onboarding engineers to REST principles beyond CRUD
- Choosing between resource-oriented and action-oriented URL design

## Instructions

### Key Concepts

The model, described by Leonard Richardson and popularized by Martin Fowler, defines four levels:

| Level | Name                | Characteristic                                    |
| ----- | ------------------- | ------------------------------------------------- |
| 0     | The Swamp of POX    | Single endpoint, HTTP as transport tunnel         |
| 1     | Resources           | Separate URLs per resource                        |
| 2     | HTTP Verbs          | Correct method semantics (GET, POST, PUT, DELETE) |
| 3     | Hypermedia Controls | Responses include links to available next actions |

Each level is strictly additive — Level 2 requires Level 1, Level 3 requires Level 2.

**Level 0 — The Swamp of POX (Plain Old XML/JSON)**

A single endpoint handles all operations. The HTTP method is irrelevant; the payload specifies the action.

```http
POST /api
Content-Type: application/json

{ "action": "getUser", "userId": 42 }
```

```http
POST /api
Content-Type: application/json

{ "action": "deleteUser", "userId": 42 }
```

This is RPC tunneled over HTTP. There is no distinction between safe and unsafe operations. Caching is impossible (all POST). Errors arrive as `200 OK` with an error payload.

**Level 1 — Resources**

Each resource gets its own URL. Operations are still passed in the request body, but clients can now bookmark and reason about individual resources.

```http
POST /users/42
Content-Type: application/json

{ "action": "get" }
```

Improvement: resource identity is in the URL. Still not exploiting HTTP method semantics.

**Level 2 — HTTP Verbs**

This is the practical REST target for most production APIs. HTTP methods carry semantic meaning, and status codes communicate outcomes.

```http
GET /users/42
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{ "id": 42, "name": "Alice", "email": "alice@example.com" }
```

```http
DELETE /users/42
```

```http
HTTP/1.1 204 No Content
```

```http
POST /users
Content-Type: application/json

{ "name": "Bob", "email": "bob@example.com" }
```

```http
HTTP/1.1 201 Created
Location: /users/43
```

GET is safe (no side effects) and idempotent. DELETE is idempotent. POST creates a new resource and returns `201 Created` with a `Location` header. Errors use 4xx/5xx status codes — not `{ "status": "error" }` in a 200 body.

### Worked Example

A medical appointment booking API at each level:

**Level 0:**

```http
POST /appointmentService
{ "action": "bookAppointment", "date": "2024-03-15", "doctorId": "d7" }

POST /appointmentService
{ "action": "cancelAppointment", "appointmentId": "a42" }
```

**Level 1:**

```http
POST /doctors/d7/appointments
{ "action": "book", "date": "2024-03-15" }

POST /appointments/a42
{ "action": "cancel" }
```

**Level 2:**

```http
POST /doctors/d7/appointments
Content-Type: application/json
{ "date": "2024-03-15", "patientId": "p99" }
→ 201 Created, Location: /appointments/a43

DELETE /appointments/a42
→ 204 No Content
```

**Level 3:**

```json
GET /appointments/a43
→ 200 OK
{
  "id": "a43",
  "date": "2024-03-15",
  "status": "confirmed",
  "_links": {
    "self": { "href": "/appointments/a43" },
    "cancel": { "href": "/appointments/a43", "method": "DELETE" },
    "reschedule": { "href": "/appointments/a43/reschedule", "method": "POST" },
    "doctor": { "href": "/doctors/d7" }
  }
}
```

The Level 3 response tells the client what actions are available without out-of-band documentation. A client following the links never needs to construct URLs manually.

### Anti-Patterns

1. **Claiming Level 2 while returning errors in 200 bodies.** `{ "error": true, "message": "Not found" }` with status `200 OK` is a Level 0 behavior regardless of URL structure. Use 404 with a problem details body. See `api-status-codes` and `api-error-contracts`.

2. **Skipping Level 2 to chase Level 3.** Teams sometimes invest in hypermedia before establishing correct HTTP semantics. The return on Level 2 (cacheability, safe methods, standard tooling) is far larger than Level 3 for most APIs. Level 3 adds cost — implement it only when clients demonstrably benefit from link-driven navigation.

3. **Verbs in URLs at Level 2.** `/users/42/delete` is Level 1 behavior with a Level 2 URL structure. The method already carries the verb: `DELETE /users/42`.

4. **Treating the model as a score to maximize.** Most production APIs should target Level 2. Level 3 has genuine cost (response size, client complexity, cache invalidation) and genuine benefit (evolvability, discoverability) — the benefit must justify the cost for your specific API.

## Details

### Why Level 2 Is the Right Default

The majority of public APIs — Stripe, GitHub, Twilio — operate at Level 2. Level 2 unlocks:

- **Caching:** GET responses are cacheable by default. POST/PUT/DELETE are not. CDNs and browsers use this.
- **Idempotency:** DELETE and PUT are idempotent — retrying on network failure is safe.
- **Tooling:** OpenAPI, Postman, curl, and every HTTP client understand method semantics.
- **Observability:** Log analysis and rate limiting by method is trivial at Level 2.

### When Level 3 Is Worth It

Hypermedia controls pay off when:

- The set of valid next actions depends on server-side state (workflows, state machines)
- Clients are long-lived and must tolerate URL changes without redeployment
- You are building a public API with many third-party integrators and need evolvability

GitHub's API returns `_links` on pull requests pointing to merge, review, and comment endpoints. The client discovers available actions from the response rather than hardcoding URLs.

### Real-World Case Study: Internal RPC Masquerading as REST

A fintech platform built an "API" with a single `/execute` endpoint accepting `{ "command": "transferFunds", ... }`. Every call was a POST. Every response was `200 OK` (including failures). Logging could not distinguish reads from writes. A CDN sat in front and cached nothing. Migrating to Level 2 — separate resource URLs, correct methods, proper status codes — reduced error detection time from minutes (polling logs) to milliseconds (5xx alerts), and CDN hit rate increased from 0% to 61% by making GET /accounts/:id cacheable.

## Source

- [Martin Fowler — Richardson Maturity Model](https://martinfowler.com/articles/richardsonMaturityModel.html)
- Richardson, L. & Ruby, S. "RESTful Web Services" O'Reilly (2007)
- Fielding, R.T. "Architectural Styles and the Design of Network-based Software Architectures" (2000)
- [RFC 9110 — HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)

## Process

1. Identify the current maturity level of your API: single endpoint (0), multiple URLs (1), correct HTTP verbs and status codes (2), hypermedia links (3).
2. If at Level 0 or 1, migrate to Level 2: assign each resource a dedicated URL, map actions to HTTP methods, and replace error-in-200 patterns with 4xx/5xx responses.
3. Evaluate whether Level 3 is justified: if client navigation depends on server state or URL stability is a maintenance burden, add `_links` to responses following the HAL or JSON:API conventions.
4. Run `harness validate` to confirm skill files are well-formed.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-hateoas, api-resource-modeling, api-http-methods, api-status-codes

## Success Criteria

- The API uses separate URLs per resource (Level 1 minimum).
- HTTP methods carry correct semantics: GET is safe, DELETE and PUT are idempotent, POST creates (Level 2).
- Error conditions return appropriate 4xx/5xx status codes, not `200 OK` with an error payload.
- Level 3 hypermedia controls are adopted only when client navigation depends on server-side state or URL evolvability is a documented requirement.
