# Resource Modeling

> REST APIs are organized around resources — nouns that represent things, not verbs that represent actions. Well-modeled resources produce URLs that are predictable, cacheable, and easy to understand without documentation.

## When to Use

- Designing a new API surface from scratch
- Reviewing a PR that introduces new endpoints
- Refactoring an RPC-style API toward resource orientation
- Deciding how to expose a domain concept (user, order, invoice) via HTTP
- Naming a URL for an operation that does not map cleanly to CRUD
- Explaining to a team why `/getUsers` violates REST conventions

## Instructions

### Key Concepts

**Resources are nouns, not verbs.** The HTTP method provides the verb. The URL identifies the thing being acted upon.

| Wrong (verb in URL)     | Right (noun + method)           |
| ----------------------- | ------------------------------- |
| `POST /createUser`      | `POST /users`                   |
| `GET /getOrder/42`      | `GET /orders/42`                |
| `POST /deleteProduct/7` | `DELETE /products/7`            |
| `POST /activateAccount` | `POST /accounts/42/activations` |

**Resource identification rules:**

1. **Use plural nouns for collections.** `/users` (collection), `/users/42` (member).
2. **Use lowercase with hyphens, not camelCase or underscores.** `/order-items`, not `/orderItems` or `/order_items`. Hyphens are more readable in URLs and treated as word separators by search engines.
3. **Do not include file extensions.** Use `Accept` headers for content negotiation, not `/users.json`.
4. **Keep URLs stable.** Once published, changing a URL is a breaking change. Design carefully.

**Mapping domain actions to resources:**

Some operations resist simple noun mapping. Common strategies:

| Domain Action       | Resource Strategy                    | Example                                 |
| ------------------- | ------------------------------------ | --------------------------------------- |
| Send a message      | Create a message resource            | `POST /messages`                        |
| Activate an account | Create a sub-resource for the state  | `POST /accounts/42/activations`         |
| Run a report        | Create a report resource             | `POST /reports` → `GET /reports/r99`    |
| Search              | Use query parameters on a collection | `GET /products?q=widget&category=tools` |
| Merge two records   | Model the merge as a resource        | `POST /record-merges`                   |

The key insight: if you need to perform an action, model the _result_ of that action as a resource. An activation is not a verb — it is a resource whose existence represents the activated state.

### Worked Example

An e-commerce platform is adding order management endpoints. The team debates the URL structure:

**Draft 1 (verb-centric):**

```
POST   /createOrder
GET    /getOrder?id=42
POST   /cancelOrder
POST   /shipOrder
GET    /listOrdersByCustomer?customerId=7
```

**Draft 2 (resource-centric, Level 2):**

```
POST   /orders                          → 201 Created, Location: /orders/42
GET    /orders/42                       → 200 OK
POST   /orders/42/cancellations        → 201 Created (models the cancellation event)
POST   /orders/42/shipments            → 201 Created, Location: /orders/42/shipments/s1
GET    /customers/7/orders             → 200 OK, paginated list
```

Draft 2 advantages:

- `GET /orders/42` is cacheable. `GET /getOrder?id=42` may not be (depends on the proxy, but query-only GETs are less reliably cached).
- Cancellation is modeled as a resource — you can later `GET /orders/42/cancellations` to audit who cancelled and why.
- Shipment is a first-class resource — you can track it, update it, and link to it.

**Handling non-CRUD actions — account verification:**

A user clicks an email verification link. The action is "verify the email."

Bad: `GET /verifyEmail?token=abc123` (side-effecting GET)
Bad: `POST /verifyEmail` (verb URL)
Good: `POST /email-verifications` with `{ "token": "abc123" }` — creates a verification record and triggers the state change as a side effect.

Or if you must use a GET (for email link clicking convenience): acknowledge it violates GET safety and document it explicitly. This is a pragmatic exception, not a design template.

### Anti-Patterns

1. **Verbs in URIs.** `/api/v1/getUserProfile`, `/api/v1/updatePassword`, `/api/v1/deleteAccount` are RPC routes dressed as REST. Replace with `GET /users/42/profile`, `PUT /users/42/password`, `DELETE /users/42`.

2. **Inconsistent plurality.** Mixing `/user/42` and `/orders` in the same API forces clients to memorize which resources are singular. Use plural everywhere.

3. **Implementation details in URLs.** `/database/users/42` or `/v2/mysql/orders` leaks infrastructure. URLs should model the domain, not the implementation.

4. **Using query parameters for resource identity.** `/orders?id=42` is a filter, not a resource address. The canonical address of an order is `/orders/42`. Query parameters are for filtering collections, not identifying members.

5. **Deep nesting beyond two levels.** `/users/42/orders/7/items/3/variants/red` is brittle and hard to cache. See `api-nested-vs-flat` for when to flatten.

## Details

### Controller Resources (the Pragmatic Exception)

Some actions genuinely cannot be modeled as nouns. REST literature calls these "controller resources" — they expose a procedural concept as a resource.

Common examples:

- `POST /emails/42/send` — sends a draft email (the sending is the event)
- `POST /transactions/42/void` — voids a transaction (irreversible state transition)
- `POST /search` — complex search with a body payload too large for a query string

These are acceptable when the action has no natural noun form. Document them clearly in your OpenAPI spec with a note explaining why a controller pattern was chosen. See `api-openapi-design` for spec conventions.

### Resource Naming in Practice: GitHub API

GitHub's API (`api.github.com`) demonstrates resource modeling at scale:

```
GET  /repos/{owner}/{repo}           — repository resource
GET  /repos/{owner}/{repo}/issues    — issues collection
POST /repos/{owner}/{repo}/issues    — create issue
GET  /repos/{owner}/{repo}/issues/42 — single issue
POST /repos/{owner}/{repo}/issues/42/comments — comment on issue
POST /repos/{owner}/{repo}/merges    — merge (controller resource)
```

Note that `/merges` is a controller resource — it creates the result of a merge operation. GitHub chose this over `POST /repos/{owner}/{repo}/pulls/7/merge` (which they also support) to make the action explicit.

## Source

- [REST API Tutorial — Resource Naming](https://restfulapi.net/resource-naming/)
- Allamaraju, S. "RESTful Web Services Cookbook" O'Reilly (2010)
- Masse, M. "REST API Design Rulebook" O'Reilly (2011)
- [RFC 3986 — Uniform Resource Identifier](https://www.rfc-editor.org/rfc/rfc3986)

## Process

1. List the domain concepts your API exposes. Each concept is a candidate resource.
2. Name each resource as a plural noun. Map create/read/update/delete to POST/GET/PUT or PATCH/DELETE.
3. For actions that resist noun mapping, model the _result_ of the action as a sub-resource or controller resource.
4. Validate URI structure: lowercase, hyphens, no verbs, no file extensions, no implementation details.
5. Run `harness validate` to confirm skill files are well-formed.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-resource-granularity, api-nested-vs-flat, api-rest-maturity-model, api-http-methods, api-filtering-sorting

## Success Criteria

- All URLs use plural nouns; no verbs appear in URI paths (controller resources are the documented exception).
- Collections and members follow the pattern: `/resources` (collection), `/resources/{id}` (member).
- Domain actions that cannot map to CRUD are modeled as sub-resources or controller resources, not verb URLs.
- URI conventions are consistent across the entire API surface: lowercase, hyphen-separated, no file extensions.
