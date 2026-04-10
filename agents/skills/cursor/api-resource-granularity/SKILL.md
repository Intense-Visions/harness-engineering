# Resource Granularity

> Resource granularity determines how much data a single API resource exposes. Fine-grained resources are flexible but chatty; coarse-grained resources reduce round trips but over-fetch. The right granularity matches your clients' actual access patterns.

## When to Use

- Designing a new API and deciding how to scope each resource
- Investigating mobile client performance issues caused by too many round trips (under-fetching)
- Debugging slow API responses caused by returning too much data (over-fetching)
- Evaluating whether to introduce a composite endpoint for a specific client use case
- Reviewing a PR that adds an endpoint returning deeply nested objects
- Deciding whether field selection (`?fields=`) is worth the complexity

## Instructions

### Key Concepts

**Fine-grained resources** expose one concept per endpoint. Clients compose the data they need from multiple requests.

```
GET /users/42          → { id, name, email }
GET /users/42/address  → { street, city, zip }
GET /users/42/orders   → [ ... ]
```

**Coarse-grained resources** bundle related data into one response. Clients get more than they asked for, but in fewer round trips.

```
GET /users/42?include=address,recent-orders
→ { id, name, email, address: {...}, recentOrders: [...] }
```

**The tradeoff:**

| Dimension         | Fine-grained                           | Coarse-grained                     |
| ----------------- | -------------------------------------- | ---------------------------------- |
| Round trips       | Many (N+1 risk)                        | Few                                |
| Response size     | Small                                  | Large                              |
| Cache granularity | High (each resource cached separately) | Low (bundle invalidated as a unit) |
| Evolvability      | Easy (change one resource)             | Harder (bundle evolves as a whole) |
| Client fit        | Generic clients                        | Specific client use cases          |

**Aggregation patterns:**

1. **Composite resource.** A dedicated URL bundles related data for a common client need.

   ```
   GET /dashboard/user/42  → user + account summary + recent activity
   ```

   Suitable when a single client (e.g., mobile home screen) has a fixed, known data requirement.

2. **Include/expand parameter.** The base resource optionally embeds related data.

   ```
   GET /orders/42?expand=customer,items
   ```

   Used by Stripe (`?expand[]=customer`) to let callers control depth without separate calls.

3. **Field selection.** Sparse fieldsets reduce payload size without changing resource boundaries.
   ```
   GET /users/42?fields=id,name,email
   ```
   See `api-field-selection` for implementation detail.

### Worked Example

A mobile app displays a feed of posts. Each post needs author name, avatar, post text, and like count.

**Fine-grained (chatty):**

```
GET /feed                   → [{ postId: 1 }, { postId: 2 }, ...]
GET /posts/1                → { text, authorId, likeCount }
GET /users/{authorId}       → { name, avatarUrl }
... (repeated for each post)
```

On a feed of 20 posts, this is 41 requests. Mobile latency makes this unusable.

**Coarse-grained (aggregated feed resource):**

```
GET /feed?limit=20
→ {
    items: [
      {
        post: { id: 1, text: "...", likeCount: 142 },
        author: { id: 7, name: "Alice", avatarUrl: "..." }
      },
      ...
    ],
    nextCursor: "eyJpZCI6MjB9"
  }
```

One request returns everything the client needs. The server joins the data efficiently; the client does not need multiple round trips.

**Targeted aggregation, not wholesale bundling:**

The feed resource is coarse-grained by design for its specific client. The `/posts/1` and `/users/7` endpoints remain fine-grained for other callers. Do not coarsen your entire API — create targeted aggregations for specific, well-understood access patterns.

### Anti-Patterns

1. **The "kitchen sink" resource.** `GET /users/42` returning profile, address, orders, invoices, activity log, and preferences in one response serves no client well — it over-fetches for every one of them. Build aggregations for specific use cases, not all-purpose mega-resources.

2. **Fine-grained resources without any aggregation option.** A pure fine-grained API forces mobile clients into N+1 request chains. Always provide an aggregation path for your highest-traffic client workflows.

3. **Aggregating data that changes on different cadences.** If user profile rarely changes but order list changes constantly, bundling them together destroys cache effectiveness. The bundle invalidates whenever either part changes. Keep fast-changing and slow-changing data in separate cacheable resources.

4. **Using granularity to hide schema complexity.** If a coarse-grained endpoint returns a deeply nested structure with 30+ fields, the problem is schema complexity, not granularity. See `api-field-selection` to let callers request only what they need.

## Details

### The N+1 Problem in REST

The N+1 problem originates in ORM query patterns (`db-n-plus-one-queries`) but manifests identically in REST APIs. A list endpoint returns N items; each item requires a separate request for related data — N+1 total requests.

Mitigation strategies:

- **Embed related data** in the collection response (`?expand=author`)
- **Composite resource** that pre-joins the common access pattern
- **Batch endpoint** that accepts multiple IDs: `GET /users?ids=1,2,3,7,9`

### Stripe's Expand Pattern

Stripe's API lets callers control expansion depth at request time:

```
GET /v1/charges/ch_abc?expand[]=customer&expand[]=payment_intent
```

The response embeds the full customer and payment intent objects instead of returning just their IDs. This balances fine-grained defaults with coarse-grained convenience, without requiring dedicated composite endpoints for every use case.

### Real-World Case Study: Mobile App Optimization

A travel booking app's hotel detail screen made 7 API calls on load: hotel info, photos, room types, availability, reviews, nearby attractions, and a policy summary. P95 load time was 4.2 seconds on 4G. The team introduced `GET /hotels/{id}/detail-bundle` — a server-side join returning all 7 data sets in one response. P95 dropped to 0.8 seconds. The individual endpoints remained unchanged for other clients. The bundle is cache-keyed on the hotel ID with a 5-minute TTL; the slower-changing policy and photos data accepts stale serving.

## Source

- Allamaraju, S. "RESTful Web Services Cookbook" O'Reilly (2010)
- [Stripe API Expanding Responses](https://stripe.com/docs/api/expanding_objects)
- [Microsoft REST API Guidelines — Composite Resources](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md)

## Process

1. List your API's top 3-5 client workflows (e.g., home screen load, order detail page, admin dashboard). Identify the data each workflow needs.
2. Check for N+1 patterns: does the workflow require a list endpoint followed by per-item requests? If so, introduce an aggregation (composite resource, expand parameter, or batch endpoint).
3. Audit existing coarse-grained endpoints for over-fetching: if most callers only use a subset of the response, add field selection or split the resource.
4. Ensure slow-changing and fast-changing data are in separate cacheable resources; do not bundle them.
5. Run `harness validate` to confirm skill files are well-formed.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-resource-modeling, api-field-selection, api-nested-vs-flat, api-pagination-cursor

## Success Criteria

- High-traffic client workflows avoid N+1 request chains through aggregation, expand parameters, or batch endpoints.
- Coarse-grained aggregations are purpose-built for specific use cases, not all-purpose mega-resources.
- Fast-changing and slow-changing data are in separate cacheable resources.
- Field selection (`?fields=`) or expand parameters are available on high-traffic list endpoints to control response size.
