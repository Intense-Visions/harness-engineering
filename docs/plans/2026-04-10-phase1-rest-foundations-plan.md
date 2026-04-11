# Plan: Phase 1 — REST Foundations (api-\* Knowledge Skills)

**Date:** 2026-04-10
**Spec:** docs/changes/api-design-knowledge-skills/proposal.md
**Session:** changes--api-design-knowledge-skills--proposal
**Estimated tasks:** 12
**Estimated time:** 45 minutes

## Goal

Create 5 api-\* knowledge skills for the REST Foundations cluster across all 4 platforms (claude-code, gemini-cli, cursor, codex), validated and ready for use.

## Observable Truths (Acceptance Criteria)

1. Each of the 5 skills has a SKILL.md (150-250 lines) under `agents/skills/claude-code/<skill-id>/` with all 8 required sections: Intro Hook, When to Use, Instructions (Key Concepts + Worked Example + Anti-Patterns), Details, Source, Process, Harness Integration, Success Criteria.
2. Each of the 5 skills has a `skill.yaml` with `type: knowledge`, `tier: 3`, `cognitive_mode: advisory-guide`, `tools: []`, and all 4 platforms listed.
3. All 4 platforms (gemini-cli, cursor, codex) have identical SKILL.md files and equivalent skill.yaml files for all 5 skills (same content as claude-code; skill.yaml field order may vary slightly per platform convention).
4. When `harness validate` is run, it reports `validation passed` with no errors.
5. The cross-references `api-hateoas`, `api-resource-modeling`, `api-resource-granularity`, `api-nested-vs-flat`, `api-field-selection`, `api-filtering-sorting`, `api-pagination-cursor` all appear in `related_skills` of the appropriate skills.

## File Map

```
CREATE agents/skills/claude-code/api-rest-maturity-model/SKILL.md
CREATE agents/skills/claude-code/api-rest-maturity-model/skill.yaml
CREATE agents/skills/claude-code/api-resource-modeling/SKILL.md
CREATE agents/skills/claude-code/api-resource-modeling/skill.yaml
CREATE agents/skills/claude-code/api-resource-granularity/SKILL.md
CREATE agents/skills/claude-code/api-resource-granularity/skill.yaml
CREATE agents/skills/claude-code/api-nested-vs-flat/SKILL.md
CREATE agents/skills/claude-code/api-nested-vs-flat/skill.yaml
CREATE agents/skills/claude-code/api-hateoas/SKILL.md
CREATE agents/skills/claude-code/api-hateoas/skill.yaml
CREATE agents/skills/gemini-cli/api-rest-maturity-model/SKILL.md
CREATE agents/skills/gemini-cli/api-rest-maturity-model/skill.yaml
CREATE agents/skills/gemini-cli/api-resource-modeling/SKILL.md
CREATE agents/skills/gemini-cli/api-resource-modeling/skill.yaml
CREATE agents/skills/gemini-cli/api-resource-granularity/SKILL.md
CREATE agents/skills/gemini-cli/api-resource-granularity/skill.yaml
CREATE agents/skills/gemini-cli/api-nested-vs-flat/SKILL.md
CREATE agents/skills/gemini-cli/api-nested-vs-flat/skill.yaml
CREATE agents/skills/gemini-cli/api-hateoas/SKILL.md
CREATE agents/skills/gemini-cli/api-hateoas/skill.yaml
CREATE agents/skills/cursor/api-rest-maturity-model/SKILL.md
CREATE agents/skills/cursor/api-rest-maturity-model/skill.yaml
CREATE agents/skills/cursor/api-resource-modeling/SKILL.md
CREATE agents/skills/cursor/api-resource-modeling/skill.yaml
CREATE agents/skills/cursor/api-resource-granularity/SKILL.md
CREATE agents/skills/cursor/api-resource-granularity/skill.yaml
CREATE agents/skills/cursor/api-nested-vs-flat/SKILL.md
CREATE agents/skills/cursor/api-nested-vs-flat/skill.yaml
CREATE agents/skills/cursor/api-hateoas/SKILL.md
CREATE agents/skills/cursor/api-hateoas/skill.yaml
CREATE agents/skills/codex/api-rest-maturity-model/SKILL.md
CREATE agents/skills/codex/api-rest-maturity-model/skill.yaml
CREATE agents/skills/codex/api-resource-modeling/SKILL.md
CREATE agents/skills/codex/api-resource-modeling/skill.yaml
CREATE agents/skills/codex/api-resource-granularity/SKILL.md
CREATE agents/skills/codex/api-resource-granularity/skill.yaml
CREATE agents/skills/codex/api-nested-vs-flat/SKILL.md
CREATE agents/skills/codex/api-nested-vs-flat/skill.yaml
CREATE agents/skills/codex/api-hateoas/SKILL.md
CREATE agents/skills/codex/api-hateoas/skill.yaml
```

## Tasks

---

### Task 1: Create api-rest-maturity-model skill (claude-code)

**Depends on:** none
**Files:**

- `agents/skills/claude-code/api-rest-maturity-model/SKILL.md`
- `agents/skills/claude-code/api-rest-maturity-model/skill.yaml`

1. Create directory:

   ```bash
   mkdir -p /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/api-rest-maturity-model
   ```

2. Write `agents/skills/claude-code/api-rest-maturity-model/skill.yaml`:

   ```yaml
   name: api-rest-maturity-model
   version: '1.0.0'
   description: Richardson Maturity Model levels 0-3 -- evaluating and advancing REST API design maturity
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
     - api-hateoas
     - api-resource-modeling
     - api-http-methods
     - api-status-codes
   stack_signals:
     - rest
     - api
     - http
   keywords:
     - richardson-maturity-model
     - REST
     - maturity-levels
     - hypermedia
     - HTTP-verbs
     - resource-oriented
   metadata:
     author: community
     upstream: martinfowler.com/articles/richardsonMaturityModel.html
   state:
     persistent: false
     files: []
   depends_on: []
   ```

3. Write `agents/skills/claude-code/api-rest-maturity-model/SKILL.md` with all 8 sections. The full content:

   ````markdown
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
   ````

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

   ```

   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add api-rest-maturity-model knowledge skill (claude-code)`

---

### Task 2: Create api-resource-modeling skill (claude-code)

**Depends on:** none (can run in parallel with Task 1)
**Files:**

- `agents/skills/claude-code/api-resource-modeling/SKILL.md`
- `agents/skills/claude-code/api-resource-modeling/skill.yaml`

1. Create directory:

   ```bash
   mkdir -p /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/api-resource-modeling
   ```

2. Write `agents/skills/claude-code/api-resource-modeling/skill.yaml`:

   ```yaml
   name: api-resource-modeling
   version: '1.0.0'
   description: Nouns vs verbs in URI design, resource identification, and URL structure for REST APIs
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
     - api-resource-granularity
     - api-nested-vs-flat
     - api-rest-maturity-model
     - api-http-methods
     - api-filtering-sorting
   stack_signals:
     - rest
     - api
     - http
   keywords:
     - resource-modeling
     - URI-design
     - nouns-vs-verbs
     - resource-identification
     - URL-structure
     - REST
   metadata:
     author: community
     upstream: restfulapi.net/resource-naming
   state:
     persistent: false
     files: []
   depends_on: []
   ```

3. Write `agents/skills/claude-code/api-resource-modeling/SKILL.md`:

   ```markdown
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

   POST /createOrder
   GET /getOrder?id=42
   POST /cancelOrder
   POST /shipOrder
   GET /listOrdersByCustomer?customerId=7

   ```

   **Draft 2 (resource-centric, Level 2):**
   ```

   POST /orders → 201 Created, Location: /orders/42
   GET /orders/42 → 200 OK
   POST /orders/42/cancellations → 201 Created (models the cancellation event)
   POST /orders/42/shipments → 201 Created, Location: /orders/42/shipments/s1
   GET /customers/7/orders → 200 OK, paginated list

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

   GET /repos/{owner}/{repo} — repository resource
   GET /repos/{owner}/{repo}/issues — issues collection
   POST /repos/{owner}/{repo}/issues — create issue
   GET /repos/{owner}/{repo}/issues/42 — single issue
   POST /repos/{owner}/{repo}/issues/42/comments — comment on issue
   POST /repos/{owner}/{repo}/merges — merge (controller resource)

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
   3. For actions that resist noun mapping, model the *result* of the action as a sub-resource or controller resource.
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
   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add api-resource-modeling knowledge skill (claude-code)`

---

### Task 3: Create api-resource-granularity skill (claude-code)

**Depends on:** none (can run in parallel with Tasks 1-2)
**Files:**

- `agents/skills/claude-code/api-resource-granularity/SKILL.md`
- `agents/skills/claude-code/api-resource-granularity/skill.yaml`

1. Create directory:

   ```bash
   mkdir -p /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/api-resource-granularity
   ```

2. Write `agents/skills/claude-code/api-resource-granularity/skill.yaml`:

   ```yaml
   name: api-resource-granularity
   version: '1.0.0'
   description: Fine-grained vs coarse-grained resource design -- aggregation patterns and over-fetching tradeoffs
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
     - api-resource-modeling
     - api-field-selection
     - api-nested-vs-flat
     - api-pagination-cursor
   stack_signals:
     - rest
     - api
     - http
   keywords:
     - resource-granularity
     - coarse-grained
     - fine-grained
     - aggregation
     - over-fetching
     - under-fetching
     - composite-resource
   metadata:
     author: community
     upstream: restfulapi.net/resource-naming
   state:
     persistent: false
     files: []
   depends_on: []
   ```

3. Write `agents/skills/claude-code/api-resource-granularity/SKILL.md`:

   ```markdown
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

   GET /users/42 → { id, name, email }
   GET /users/42/address → { street, city, zip }
   GET /users/42/orders → [ ... ]

   ```

   **Coarse-grained resources** bundle related data into one response. Clients get more than they asked for, but in fewer round trips.

   ```

   GET /users/42?include=address,recent-orders
   → { id, name, email, address: {...}, recentOrders: [...] }

   ```

   **The tradeoff:**

   | Dimension | Fine-grained | Coarse-grained |
   |-----------|-------------|----------------|
   | Round trips | Many (N+1 risk) | Few |
   | Response size | Small | Large |
   | Cache granularity | High (each resource cached separately) | Low (bundle invalidated as a unit) |
   | Evolvability | Easy (change one resource) | Harder (bundle evolves as a whole) |
   | Client fit | Generic clients | Specific client use cases |

   **Aggregation patterns:**

   1. **Composite resource.** A dedicated URL bundles related data for a common client need.
   ```

   GET /dashboard/user/42 → user + account summary + recent activity

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

   GET /feed → [{ postId: 1 }, { postId: 2 }, ...]
   GET /posts/1 → { text, authorId, likeCount }
   GET /users/{authorId} → { name, avatarUrl }
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
   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add api-resource-granularity knowledge skill (claude-code)`

---

### Task 4: Create api-nested-vs-flat skill (claude-code)

**Depends on:** none (can run in parallel with Tasks 1-3)
**Files:**

- `agents/skills/claude-code/api-nested-vs-flat/SKILL.md`
- `agents/skills/claude-code/api-nested-vs-flat/skill.yaml`

1. Create directory:

   ```bash
   mkdir -p /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/api-nested-vs-flat
   ```

2. Write `agents/skills/claude-code/api-nested-vs-flat/skill.yaml`:

   ```yaml
   name: api-nested-vs-flat
   version: '1.0.0'
   description: Nested resource paths vs flat URLs with filters -- decision criteria and URL depth guidelines
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
     - api-resource-modeling
     - api-filtering-sorting
     - api-resource-granularity
     - api-nested-vs-flat
   stack_signals:
     - rest
     - api
     - http
   keywords:
     - nested-resources
     - flat-URLs
     - URL-depth
     - resource-hierarchy
     - path-parameters
     - query-parameters
   metadata:
     author: community
     upstream: restfulapi.net/resource-naming
   state:
     persistent: false
     files: []
   depends_on: []
   ```

3. Write `agents/skills/claude-code/api-nested-vs-flat/SKILL.md`:

   ```markdown
   # Nested vs Flat Resource URLs

   > Nested URLs express ownership hierarchies; flat URLs with query parameters express arbitrary membership or filtering. The decision affects URL stability, caching, access control, and client complexity.

   ## When to Use

   - Designing a URL structure for a resource that belongs to a parent (comments on a post, items in an order)
   - Deciding whether a resource should live at `/parents/{id}/children` or `/children?parentId={id}`
   - Reviewing a PR that adds a deeply nested route (three or more levels)
   - Evaluating URL stability when a resource might be re-parented or accessed in multiple contexts
   - Explaining to a team why `/users/42/posts/7/comments/3/likes` is problematic

   ## Instructions

   ### Key Concepts

   **Nested URLs** encode the parent-child relationship in the path:
   ```

   GET /users/42/posts
   GET /users/42/posts/7/comments

   ```

   **Flat URLs with filters** move the parent relationship to a query parameter:
   ```

   GET /posts?userId=42
   GET /comments?postId=7

   ```

   **Decision criteria:**

   | Signal | Prefer Nested | Prefer Flat |
   |--------|--------------|-------------|
   | Resource cannot exist without parent | Yes (comment without post) | No |
   | Resource has only one parent type | Yes | No (if multiple parent types) |
   | Client always knows the parent ID | Yes | Depends |
   | Resource is accessed in multiple parent contexts | No | Yes |
   | URL depth would exceed 2 levels | No | Yes |
   | Access control is scoped to parent | Yes (URL structure aids enforcement) | No |

   **The two-level rule:** Nest a maximum of two levels. `/users/42/posts` is acceptable. `/users/42/posts/7/comments` is at the limit. `/users/42/posts/7/comments/3/likes` is too deep — flatten it.

   **Flattening deep hierarchies:**

   ```

   # Deep (avoid)

   GET /users/42/posts/7/comments/3/likes

   # Flat (prefer)

   GET /likes?commentId=3

   # Or: flat canonical URL with nested alias

   GET /comments/3/likes (nested, 2 levels from canonical comment resource)

   ```

   ### Worked Example

   A blogging platform has posts, comments, and likes on comments.

   **Draft 1 — fully nested:**
   ```

   GET /users/42/posts → user's posts
   GET /users/42/posts/7 → single post
   POST /users/42/posts/7/comments → add comment
   GET /users/42/posts/7/comments → post's comments
   POST /users/42/posts/7/comments/3/likes → like a comment
   GET /users/42/posts/7/comments/3/likes → comment's likes

   ```

   Problem: to fetch comment 3's likes, the client must know the user ID (42), post ID (7), and comment ID (3). If the comment is later moved to a different post, every URL breaks. The client must carry the full ancestry chain.

   **Draft 2 — two-level nesting with flat deep resources:**
   ```

   GET /posts?authorId=42 → filter by author (flat)
   GET /posts/7 → canonical post URL (flat)
   POST /posts/7/comments → comments on a post (1 level nesting, OK)
   GET /posts/7/comments → comments on a post
   POST /comments/3/likes → likes on a comment (1 level nesting, OK)
   GET /comments/3/likes → comment's likes

   ```

   Likes also get a canonical flat address:
   ```

   GET /likes?commentId=3 → same data, filterable

   ```

   The client no longer needs the post's parent user to fetch a comment's likes. Comment 3 has a canonical URL (`/comments/3`) that is stable even if the comment moves to a different post.

   **Access control with nested URLs:**

   Nested URLs make scope-based access control natural. Middleware can extract the parent ID from the path and enforce ownership before the handler runs:

   ```

   GET /organizations/org-7/projects/proj-12/members

   ```

   The middleware verifies the requester belongs to `org-7` before checking project membership. The ownership chain is explicit in the URL. This is a genuine benefit of nesting.

   ### Anti-Patterns

   1. **Deep nesting beyond two levels.** Each additional level makes URLs brittle (break on re-parenting), harder to cache, and harder to construct for clients. `/a/{id}/b/{id}/c/{id}/d/{id}` is a symptom of modeling the database schema rather than the access patterns.

   2. **Duplicating the same resource under multiple parents.** If comments are accessible at both `/posts/7/comments/3` and `/articles/7/comments/3`, you have two canonical URLs for the same resource. Clients and caches disagree on staleness. Pick one canonical URL; use the other as an alias with a redirect if needed.

   3. **Nesting resources that can have multiple parent types.** A file attached to a message, a project, and an invoice should live at `/files/{id}` with filters (`?messageId=`, `?projectId=`), not nested under each parent type.

   4. **Using nested URLs to express filtering.** `/users/42/orders/active` — is `active` a sub-resource or a filter? If it is a filter, use `/orders?userId=42&status=active`. Reserve nesting for genuine ownership relationships.

   ## Details

   ### When Flat Wins: The Multi-Parent Problem

   GitHub's pull request reviews illustrate the tradeoff:

   ```

   GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews

   ```

   This is deep (4 levels) but each ancestor is required context: you cannot review a pull request without knowing the repo and owner. The full ancestry is always available to the client. GitHub accepts the depth because the parent chain is always known and stable.

   Contrast with tags, which can belong to issues, pull requests, or releases:

   ```

   # What GitHub does NOT do:

   GET /repos/{owner}/{repo}/issues/{issue_number}/labels (nested)
   GET /repos/{owner}/{repo}/labels (flat — label registry)

   ```

   Labels are fetched from the issue context when reviewing an issue, but the label registry is flat. Multi-parent resources that need to be listed independently belong at a flat URL.

   ### Canonical URL and Aliases

   A resource should have one canonical URL. Nested URLs can serve as scoped aliases that redirect to the canonical form:

   ```

   GET /posts/7/comments/3
   → 301 Moved Permanently
   Location: /comments/3

   ```

   Or serve the same response from both paths and set `Content-Location: /comments/3` to signal the canonical address. This keeps nested URLs useful for navigation while ensuring cache consistency.

   ## Source

   - Masse, M. "REST API Design Rulebook" O'Reilly (2011)
   - [Microsoft REST API Guidelines — URL Structure](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md)
   - [GitHub REST API Docs](https://docs.github.com/en/rest) — practical examples of nesting vs flat
   - [RFC 3986 — URI Generic Syntax](https://www.rfc-editor.org/rfc/rfc3986)

   ## Process

   1. For each resource, ask: "Can this resource exist without its parent?" If no, nesting is appropriate. If yes, flat with filter parameters is safer.
   2. Count nesting depth. If the URL exceeds 2 levels, flatten deeper children to their own top-level collection with filter parameters.
   3. Check for multi-parent resources. If a resource belongs to more than one parent type, use a flat canonical URL with filter parameters.
   4. Define a canonical URL for every resource. Nested aliases may exist but must redirect to or agree with the canonical.
   5. Run `harness validate` to confirm skill files are well-formed.

   ## Harness Integration

   - **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
   - **No tools or state** -- consumed as context by other skills and agents.
   - **related_skills:** api-resource-modeling, api-filtering-sorting, api-resource-granularity

   ## Success Criteria

   - URL nesting does not exceed two levels for any resource.
   - Resources that can exist independently of their parent have a canonical flat URL.
   - Multi-parent resources use flat URLs with query parameter filters.
   - Every resource has exactly one canonical URL; nested aliases redirect to the canonical form.
   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add api-nested-vs-flat knowledge skill (claude-code)`

---

### Task 5: Create api-hateoas skill (claude-code)

**Depends on:** none (can run in parallel with Tasks 1-4)
**Files:**

- `agents/skills/claude-code/api-hateoas/SKILL.md`
- `agents/skills/claude-code/api-hateoas/skill.yaml`

1. Create directory:

   ```bash
   mkdir -p /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/api-hateoas
   ```

2. Write `agents/skills/claude-code/api-hateoas/skill.yaml`:

   ```yaml
   name: api-hateoas
   version: '1.0.0'
   description: Hypermedia as the engine of application state -- practical HAL and JSON:API link design with adoption criteria
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
     - api-rest-maturity-model
     - api-pagination-cursor
     - api-resource-modeling
     - api-http-methods
   stack_signals:
     - rest
     - api
     - http
   keywords:
     - HATEOAS
     - hypermedia
     - HAL
     - JSON:API
     - links
     - self-describing
     - REST-level-3
   metadata:
     author: community
     upstream: martinfowler.com/articles/richardsonMaturityModel.html
   state:
     persistent: false
     files: []
   depends_on: []
   ```

3. Write `agents/skills/claude-code/api-hateoas/SKILL.md`:

   ````markdown
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
   ````

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

   ```

   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add api-hateoas knowledge skill (claude-code)`

---

### Task 6: Validate all 5 claude-code skills

**Depends on:** Tasks 1, 2, 3, 4, 5

[checkpoint:human-verify]

After all 5 claude-code skills are committed, pause to verify before proceeding to platform sync.

1. Confirm all 5 skill directories exist:

   ```bash
   ls /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/ | grep "^api-"
   ```

   Expected output includes:

   ```
   api-hateoas
   api-nested-vs-flat
   api-resource-granularity
   api-resource-modeling
   api-rest-maturity-model
   ```

2. Confirm each directory has exactly 2 files:

   ```bash
   for skill in api-rest-maturity-model api-resource-modeling api-resource-granularity api-nested-vs-flat api-hateoas; do
     echo "$skill:"; ls /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/$skill/
   done
   ```

   Expected: each shows `SKILL.md` and `skill.yaml`.

3. Check SKILL.md line counts (each must be 150-250 lines):

   ```bash
   for skill in api-rest-maturity-model api-resource-modeling api-resource-granularity api-nested-vs-flat api-hateoas; do
     wc -l /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/$skill/SKILL.md
   done
   ```

4. Run: `harness validate`
   Expected output: `v validation passed`

5. If any check fails, fix the offending skill before proceeding to Task 7.

---

### Task 7: Sync all 5 skills to gemini-cli platform

**Depends on:** Task 6 (checkpoint cleared)
**Files:** 10 files across `agents/skills/gemini-cli/`

1. Create directories and copy SKILL.md files (identical to claude-code):

   ```bash
   for skill in api-rest-maturity-model api-resource-modeling api-resource-granularity api-nested-vs-flat api-hateoas; do
     mkdir -p /Users/cwarner/Projects/harness-engineering/agents/skills/gemini-cli/$skill
     cp /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/$skill/SKILL.md \
        /Users/cwarner/Projects/harness-engineering/agents/skills/gemini-cli/$skill/SKILL.md
   done
   ```

2. For each skill, write a `skill.yaml` to `agents/skills/gemini-cli/<skill-id>/skill.yaml`. These are identical to the claude-code versions **except** the `stability` field moves to the end of the file (matching the observed convention in `agents/skills/gemini-cli/db-acid-properties/skill.yaml` where `stability` appears after `state`).

   Write each of the 5 gemini-cli skill.yaml files, with the same field values as the claude-code versions but with `stability: static` repositioned after `state:` block. Example for `api-rest-maturity-model`:

   ```yaml
   name: api-rest-maturity-model
   version: '1.0.0'
   description: Richardson Maturity Model levels 0-3 -- evaluating and advancing REST API design maturity
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
     - api-hateoas
     - api-resource-modeling
     - api-http-methods
     - api-status-codes
   stack_signals:
     - rest
     - api
     - http
   keywords:
     - richardson-maturity-model
     - REST
     - maturity-levels
     - hypermedia
     - HTTP-verbs
     - resource-oriented
   metadata:
     author: community
     upstream: martinfowler.com/articles/richardsonMaturityModel.html
   state:
     persistent: false
     files: []
   stability: static
   depends_on: []
   ```

   Repeat this pattern for all 5 skills, using the same `related_skills`, `keywords`, `stack_signals`, `metadata.upstream` values as the claude-code counterparts.

3. Run: `harness validate`
4. Commit: `feat(skills): sync api-* REST Foundations skills to gemini-cli platform`

---

### Task 8: Sync all 5 skills to cursor platform

**Depends on:** Task 6 (checkpoint cleared; can run in parallel with Task 7)
**Files:** 10 files across `agents/skills/cursor/`

1. Create directories and copy SKILL.md files:

   ```bash
   for skill in api-rest-maturity-model api-resource-modeling api-resource-granularity api-nested-vs-flat api-hateoas; do
     mkdir -p /Users/cwarner/Projects/harness-engineering/agents/skills/cursor/$skill
     cp /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/$skill/SKILL.md \
        /Users/cwarner/Projects/harness-engineering/agents/skills/cursor/$skill/SKILL.md
   done
   ```

2. Write skill.yaml files for cursor platform. Verify the field order convention used by cursor by reading one existing cursor skill.yaml (e.g., `agents/skills/cursor/db-acid-properties/skill.yaml`) before writing. Match that convention.

   If the cursor platform skill.yaml matches the claude-code format (stability before state), write files with `stability` in that position. If it matches the gemini-cli format (stability after state), write files in that order. The content values are identical to claude-code in both cases.

3. Run: `harness validate`
4. Commit: `feat(skills): sync api-* REST Foundations skills to cursor platform`

---

### Task 9: Sync all 5 skills to codex platform

**Depends on:** Task 6 (checkpoint cleared; can run in parallel with Tasks 7-8)
**Files:** 10 files across `agents/skills/codex/`

1. Create directories and copy SKILL.md files:

   ```bash
   for skill in api-rest-maturity-model api-resource-modeling api-resource-granularity api-nested-vs-flat api-hateoas; do
     mkdir -p /Users/cwarner/Projects/harness-engineering/agents/skills/codex/$skill
     cp /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/$skill/SKILL.md \
        /Users/cwarner/Projects/harness-engineering/agents/skills/codex/$skill/SKILL.md
   done
   ```

2. Write skill.yaml files for codex platform. Verify the field order convention used by codex by reading one existing codex skill.yaml (e.g., `agents/skills/codex/db-acid-properties/skill.yaml`) before writing. Match that convention.

3. Run: `harness validate`
4. Commit: `feat(skills): sync api-* REST Foundations skills to codex platform`

---

### Task 10: Final validation and harness validate

**Depends on:** Tasks 7, 8, 9

1. Verify all 4 platforms have all 5 skill directories:

   ```bash
   for platform in claude-code gemini-cli cursor codex; do
     echo "=== $platform ==="; ls /Users/cwarner/Projects/harness-engineering/agents/skills/$platform/ | grep "^api-"
   done
   ```

   Expected: each platform shows the same 5 `api-*` directories.

2. Verify SKILL.md files are identical across platforms for each skill:

   ```bash
   for skill in api-rest-maturity-model api-resource-modeling api-resource-granularity api-nested-vs-flat api-hateoas; do
     echo "=== $skill ===";
     diff /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/$skill/SKILL.md \
          /Users/cwarner/Projects/harness-engineering/agents/skills/gemini-cli/$skill/SKILL.md && echo "gemini-cli: OK"
     diff /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/$skill/SKILL.md \
          /Users/cwarner/Projects/harness-engineering/agents/skills/cursor/$skill/SKILL.md && echo "cursor: OK"
     diff /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/$skill/SKILL.md \
          /Users/cwarner/Projects/harness-engineering/agents/skills/codex/$skill/SKILL.md && echo "codex: OK"
   done
   ```

3. Run: `harness validate`
   Expected output: `v validation passed`

4. Commit any remaining changes if needed. No commit needed if Tasks 7-9 each committed cleanly.

---

### Task 11: Write session handoff

**Depends on:** Task 10

1. Write `.harness/sessions/changes--api-design-knowledge-skills--proposal/handoff.json`:

   ```json
   {
     "fromSkill": "harness-planning",
     "phase": "VALIDATE",
     "summary": "Phase 1 REST Foundations plan complete — 5 api-* knowledge skills defined across all 4 platforms.",
     "completed": [],
     "pending": [
       "Task 1: Create api-rest-maturity-model skill (claude-code)",
       "Task 2: Create api-resource-modeling skill (claude-code)",
       "Task 3: Create api-resource-granularity skill (claude-code)",
       "Task 4: Create api-nested-vs-flat skill (claude-code)",
       "Task 5: Create api-hateoas skill (claude-code)",
       "Task 6: Validate all 5 claude-code skills [checkpoint:human-verify]",
       "Task 7: Sync all 5 skills to gemini-cli platform",
       "Task 8: Sync all 5 skills to cursor platform",
       "Task 9: Sync all 5 skills to codex platform",
       "Task 10: Final validation and harness validate",
       "Task 11: Write session handoff"
     ],
     "concerns": [
       "skill.yaml field order differs between claude-code (stability before state) and gemini-cli (stability after state) — Tasks 8-9 require verifying cursor and codex conventions before writing files",
       "SKILL.md line counts must be verified at checkpoint (Task 6) — content as written targets 150-250 lines but executor should wc -l to confirm",
       "Cross-references to api-field-selection, api-filtering-sorting, api-pagination-cursor are forward references — those skills do not yet exist; this is expected and correct for Phase 1"
     ],
     "decisions": [
       "Tasks 1-5 are independent and can be executed in parallel",
       "Tasks 7-9 (platform sync) can be executed in parallel after Task 6 checkpoint clears",
       "SKILL.md content is identical across all 4 platforms; only skill.yaml field ordering may differ per platform convention",
       "skill.yaml stability field placement follows each platform's existing convention, verified by reading one existing skill.yaml from that platform before writing"
     ],
     "contextKeywords": [
       "api-rest-maturity-model",
       "api-resource-modeling",
       "api-resource-granularity",
       "api-nested-vs-flat",
       "api-hateoas",
       "richardson-maturity-model",
       "REST-foundations",
       "knowledge-skill",
       "platform-sync"
     ]
   }
   ```

2. Run: `harness validate`
3. No commit needed for handoff.json (session state, not source artifact).

---

## Dependency Graph

```
Tasks 1-5 (create claude-code skills) — independent, run in parallel
    ↓ all complete
Task 6 [checkpoint:human-verify] — validate before platform sync
    ↓ checkpoint cleared
Tasks 7, 8, 9 (platform sync) — independent, run in parallel
    ↓ all complete
Task 10 (final validate)
    ↓
Task 11 (write handoff)
```

## Observable Truth Traceability

| Observable Truth                                    | Delivered By                      |
| --------------------------------------------------- | --------------------------------- |
| 5 SKILL.md files in claude-code, 8 sections each    | Tasks 1-5                         |
| 5 skill.yaml files with correct type/tier/platforms | Tasks 1-5                         |
| All 4 platforms have all 5 skills                   | Tasks 7, 8, 9                     |
| harness validate passes                             | Tasks 1-5 (each), Task 6, Task 10 |
| Cross-references present in related_skills          | Tasks 1-5 (skill.yaml content)    |
