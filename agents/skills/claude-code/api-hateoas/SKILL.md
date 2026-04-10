# HATEOAS

> Hypermedia As The Engine Of Application State (HATEOAS) embeds links to available next actions in every API response. Clients navigate the API by following links rather than constructing URLs — making the API self-describing and decoupling clients from URL structure.

## When to Use

- Designing an API with complex, state-dependent workflows (order lifecycle, document approvals)
- Building a public API where URL changes must not break long-lived third-party integrations
- Evaluating whether to adopt HAL, JSON:API, or a custom link format
- Reviewing a response that hardcodes related resource URLs as string fields
- Explaining why returning `"authorId": 42` is different from returning `"author": { "href": "/users/42" }`
- Deciding whether HATEOAS cost is justified for an internal API

## Instructions

### Key Concepts

HATEOAS is the constraint that distinguishes Level 3 from Level 2 in the Richardson Maturity Model (see `api-rest-maturity-model`). A HATEOAS response tells the client what it can do next, not just what the current state is.

**Without HATEOAS (Level 2):**

```json
{
  "id": 42,
  "status": "pending",
  "amount": 150.0
}
```

The client knows the order is pending, but must have out-of-band knowledge that it can call `DELETE /orders/42` to cancel or `POST /orders/42/payments` to pay. If those URLs change, clients break silently.

**With HATEOAS (Level 3):**

```json
{
  "id": 42,
  "status": "pending",
  "amount": 150.0,
  "_links": {
    "self": { "href": "/orders/42" },
    "cancel": { "href": "/orders/42", "method": "DELETE" },
    "pay": { "href": "/orders/42/payments", "method": "POST" },
    "customer": { "href": "/customers/7" }
  }
}
```

The server controls what actions are available. When the order is paid, the `pay` link disappears and a `refund` link appears. The client does not need to know that paid orders cannot be paid again — the server stops advertising the action.

**HAL (Hypertext Application Language):**

HAL is the most widely adopted hypermedia format. It uses `_links` for navigation and `_embedded` for inline related resources.

```json
{
  "id": 42,
  "status": "shipped",
  "total": 89.99,
  "_links": {
    "self": { "href": "/orders/42" },
    "customer": { "href": "/customers/7" },
    "track": { "href": "/shipments/s99" }
  },
  "_embedded": {
    "items": [
      {
        "sku": "ABC-123",
        "quantity": 2,
        "_links": { "self": { "href": "/products/ABC-123" } }
      }
    ]
  }
}
```

**JSON:API link format:**

```json
{
  "data": {
    "type": "orders",
    "id": "42",
    "attributes": { "status": "shipped", "total": 89.99 },
    "links": { "self": "/orders/42" },
    "relationships": {
      "customer": {
        "links": { "related": "/customers/7" }
      }
    }
  }
}
```

### Worked Example

A document approval workflow has states: `draft`, `submitted`, `under_review`, `approved`, `rejected`. Valid transitions depend on current state and the caller's role.

**Without HATEOAS:**
Clients must embed a state machine: "if status is `submitted` and I am a reviewer, I can call `POST /documents/d1/approvals` or `POST /documents/d1/rejections`." This logic must be duplicated in every client. When the workflow changes, every client must be updated.

**With HATEOAS:**

```json
GET /documents/d1
→ 200 OK
{
  "id": "d1",
  "title": "Q4 Report",
  "status": "submitted",
  "_links": {
    "self": { "href": "/documents/d1" },
    "approve": { "href": "/documents/d1/approvals", "method": "POST" },
    "reject": { "href": "/documents/d1/rejections", "method": "POST" },
    "history": { "href": "/documents/d1/history" }
  }
}
```

A reviewer sees `approve` and `reject` links. The document author sees only `self` and `history`. The state machine lives on the server; clients follow what is advertised.

**Pagination as a practical HATEOAS application:**

```json
GET /orders?page=3
{
  "items": [...],
  "_links": {
    "self":  { "href": "/orders?page=3" },
    "prev":  { "href": "/orders?page=2" },
    "next":  { "href": "/orders?page=4" },
    "first": { "href": "/orders?page=1" },
    "last":  { "href": "/orders?page=11" }
  }
}
```

This is HATEOAS in practice. The client never constructs pagination URLs. See `api-pagination-cursor` for cursor-based navigation links.

### Anti-Patterns

1. **HATEOAS without documented link relations.** Links like `"action123": { "href": "..." }` are meaningless without documentation. Use IANA-registered link relations (`self`, `next`, `prev`, `edit`, `delete`) or define custom relations in your API documentation with consistent semantics.

2. **Adding `_links` to every response regardless of whether it adds value.** A `self` link on a deeply internal resource no client navigates to is noise. Apply HATEOAS where it actually changes client behavior — state machines, pagination, and discovery.

3. **HATEOAS as a substitute for documentation.** Links advertise available transitions; they do not describe request bodies, required fields, or error semantics. HATEOAS and OpenAPI are complementary, not alternatives.

4. **Mixing HATEOAS depth inconsistently.** Some resources return `_links`, others return bare IDs. Inconsistency forces clients to handle both patterns. If you adopt HATEOAS, apply it uniformly or not at all.

5. **Hardcoding URLs in the client and ignoring the links.** The entire benefit of HATEOAS is that clients follow links rather than construct URLs. If your clients build URLs from templates and ignore the `_links`, you are paying the response-size cost with none of the decoupling benefit.

## Details

### The Real Cost of HATEOAS

Implementing HATEOAS increases:

- **Response size.** Every response carries link metadata. On high-volume endpoints, this adds meaningful bandwidth.
- **Server complexity.** The server must compute which links are valid for the current state and caller role.
- **Client complexity.** Clients must traverse links rather than construct URLs. Link-following clients are more complex to implement and test.
- **Cache coherence.** Links may change when state changes. A cached response with stale links misleads clients. Set appropriate `Cache-Control` values.

**When the cost is worth it:**

- State-machine workflows where valid transitions depend on server-side state (order lifecycle, approvals, fulfillment)
- Long-lived public APIs where URL stability over years matters more than response compactness
- APIs with many third-party integrators who cannot be coordinated for URL migrations

**When to skip it:**

- Internal APIs where both client and server are deployed together
- Simple CRUD APIs with no meaningful state machine
- Mobile-first APIs where response size is a hard constraint

### Industry Adoption

Most major APIs implement partial HATEOAS: pagination links universally, state-transition links selectively, full HAL rarely.

- **GitHub:** Returns `Link` header for pagination (`next`, `prev`, `last`). Does not use HAL body links.
- **Stripe:** Returns `url` fields on resources but not HAL `_links`. Uses expand parameters rather than embedded resources.
- **PayPal:** Full HATEOAS with HAL `_links` including `self`, `approve`, `capture`, `void` on payment objects. One of the most complete HATEOAS implementations in a major public API.
- **Shopify:** No HATEOAS; cursor-based pagination via `Link` headers.

The pragmatic conclusion: implement pagination links always, state-transition links for complex workflows, and full HAL only when client-server decoupling over time is a first-class requirement.

## Source

- Fielding, R.T. "Architectural Styles and the Design of Network-based Software Architectures" (2000) — original HATEOAS definition
- [HAL Specification](https://stateless.group/hal_specification.html)
- [JSON:API Specification](https://jsonapi.org/)
- [IANA Link Relations Registry](https://www.iana.org/assignments/link-relations/link-relations.xhtml)
- [Martin Fowler — Richardson Maturity Model](https://martinfowler.com/articles/richardsonMaturityModel.html)

## Process

1. Identify state machines in your domain: resources that have a `status` field with constrained valid transitions (order lifecycle, document approval, subscription state).
2. For those resources, add `_links` to responses that advertise only currently valid transitions for the caller's role. Use IANA-registered relation names where possible.
3. Implement pagination links (`next`, `prev`, `first`, `last`) on all collection endpoints — this is the highest-ROI HATEOAS application.
4. For internal or simple CRUD APIs, consider limiting HATEOAS to pagination links and evaluating whether full link embedding is justified.
5. Run `harness validate` to confirm skill files are well-formed.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-rest-maturity-model, api-pagination-cursor, api-resource-modeling, api-http-methods

## Success Criteria

- Pagination responses include `next`, `prev`, `first`, and `last` links in `_links` or `Link` headers.
- State-machine resources advertise only currently valid transitions in `_links`, filtered by caller role.
- Link relations use IANA-registered names (`self`, `next`, `prev`, `edit`) or are documented custom relations.
- HATEOAS is applied uniformly across the API — no mixed patterns where some resources use `_links` and others return bare IDs for the same type of relationship.
