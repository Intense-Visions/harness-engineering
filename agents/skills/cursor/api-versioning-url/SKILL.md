# API Versioning — URL Path

> URL PATH VERSIONING EMBEDS THE API VERSION DIRECTLY IN THE URI (/v1/, /v2/) — IT TRADES CLEAN URI SEMANTICS FOR MAXIMUM VISIBILITY AND CACHEABILITY, MAKING IT THE DEFAULT CHOICE FOR PUBLIC APIs WHERE DEVELOPER EXPERIENCE AND REVERSE-PROXY ROUTING SIMPLICITY OUTWEIGH STRICT REST PURITY.

## When to Use

- Designing the versioning strategy for a new public API that will be consumed by third-party developers
- Migrating a v1 API to v2 with breaking changes and needing simultaneous support for both versions
- Setting API style guide policy for a team or organization that ships multiple services
- Evaluating whether URL versioning or header versioning better fits your gateway and CDN routing model
- Building an SDK where typed version-specific client classes improve generated code clarity
- Routing different API versions to different backend services or microservice deployments
- Communicating breaking changes to external consumers with explicit, copy-pasteable migration examples

## Instructions

### Key Concepts

1. **Version prefix placement** — The version identifier belongs in the first path segment, immediately after the host: `https://api.example.com/v1/users`. Placing it deeper (`/users/v1`) breaks routing rules and makes wildcard proxying fragile. The prefix applies to the entire API surface under it — never to individual resources.

2. **Major-only versioning** — URL versions track breaking changes only. Minor and patch changes (new optional fields, new endpoints, new query parameters) are additive and do not warrant a new version prefix. Incrementing the URL version for non-breaking changes wastes consumer migration effort and signals instability. Follow the rule: if existing clients break, bump the URL version; if they do not, they should not need to.

3. **Simultaneous version support window** — Running v1 and v2 in parallel is operationally expected. Define a support lifecycle at launch: how long v1 is maintained after v2 ships, what SLA applies to each version, and when v1 enters maintenance-only mode. Stripe supports each API version indefinitely; GitHub runs two major versions concurrently; Twilio documents explicit sunset dates per version.

4. **Version routing at the gateway** — URL versioning enables path-based routing at the API gateway, load balancer, or reverse proxy without any header inspection. A single nginx rule `location /v2/` routes to the v2 cluster. This simplicity is a primary reason URL versioning dominates public API design despite REST purists preferring header-based negotiation.

5. **Migration timeline patterns** — Announce v2 at least 6 months before deprecating v1 for external consumers. Publish a migration guide listing every breaking change with before/after examples. Emit `Deprecation` and `Sunset` headers on v1 responses (see api-deprecation-strategy) so tooling can surface warnings automatically. Provide a changelog entry for each version at a stable URL (`/v1/changelog`).

6. **Semantic versioning alignment** — URL versions align with semver's major version number. `/v1/` corresponds to semver `1.x.x`; `/v2/` to `2.x.x`. Minor increments (1.1, 1.2) are expressed through response body evolution (new optional fields, new endpoints) and documented in changelogs — never through new URL segments.

### Worked Example

Stripe's API is the canonical example of production URL versioning at scale. The base URL embeds the major version:

**v1 request — list customers:**

```http
GET /v1/customers?limit=10
Authorization: Bearer sk_live_...
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "object": "list",
  "data": [ ... ],
  "has_more": true,
  "url": "/v1/customers"
}
```

**Stripe's versioning model adds a second dimension:** request-date versioning via the `Stripe-Version` header, but the URL path `/v1/` remains fixed across all Stripe versions. This shows that URL versioning and header versioning are not mutually exclusive — the URL anchors the major API generation while the header gates fine-grained behavioral changes.

**GitHub API URL versioning (REST v3 → REST API):**

```http
GET /v3/repos/octocat/Hello-World
Accept: application/vnd.github.v3+json
Authorization: Bearer ghp_...
```

GitHub migrated from `/v3/` implicit to the explicit REST API base. Their migration guide published all endpoint path changes with redirects from old paths, enabling clients to migrate incrementally.

**Twilio API versioning:**

```http
POST /2010-04-01/Accounts/{AccountSid}/Messages
Authorization: Basic ...
Content-Type: application/x-www-form-urlencoded
```

Twilio uses a date-based URL version (`2010-04-01`) rather than an integer, which conveys stability and timestamp semantics — useful when the API is updated infrequently and date-anchored releases carry meaning for audit and compliance consumers.

### Anti-Patterns

1. **Versioning every minor change.** Creating `/v1/`, `/v2/`, `/v3/` for each additive field addition or new endpoint signals poor discipline and forces consumers into unnecessary migration work. URL versions should be rare, significant, and announce breaking changes. If you are on `/v7/` after two years, your versioning granularity is wrong.

2. **Embedding version mid-path.** `GET /users/v2/profile` creates per-resource versioning that makes routing tables explode and makes it impossible to version the entire API coherently. Clients cannot construct a base URL for "the v2 API" — they must track per-resource versions. Always version at the root segment.

3. **Silently breaking v1 during v2 development.** Running v1 and v2 from the same codebase with feature flags that silently alter v1 behavior is a contract violation. Version boundaries must be hard: a request to `/v1/` must behave identically to its original contract regardless of v2 development activity. Use separate deployments or strict branch-by-abstraction patterns.

4. **No sunset timeline at launch.** Shipping v2 without announcing when v1 will be retired leaves consumers in limbo. They cannot prioritize migration work without a date. Publish a deprecation schedule with v2's launch, even if it is tentative.

## Details

### URI Pollution and the REST Purity Debate

Strict REST theorists argue that versioning in the URI violates the principle that a URI identifies a resource, not a resource-at-a-point-in-time. Under this view, `/v1/users/42` and `/v2/users/42` are two different resources, but they represent the same underlying entity. The counter-argument from pragmatists (and most API teams): URI pollution is a minor aesthetic cost worth paying for the operational benefits of path-based routing, browser history clarity, and copy-pasteable URLs that are immediately interpretable by developers. The REST purity argument is correct in theory; URL versioning wins in practice for public APIs.

### CDN and Caching Benefits

URL versioning enables aggressive CDN caching by version prefix. A CDN rule can cache all `/v1/` responses with a long TTL while purging only `/v2/` on rollout. Header-versioned APIs require `Vary: Accept` or `Vary: API-Version` headers, which most CDNs handle poorly — resulting in cache fragmentation or disabled caching entirely. For read-heavy public APIs, this is a meaningful performance argument for URL versioning.

### Real-World Case Study: Stripe Version Stability

Stripe has maintained `/v1/` as its URL prefix since 2011 — over a decade — while making hundreds of breaking changes via their date-based `Stripe-Version` header. Their approach treats the URL prefix as the API generation (REST API vs. a hypothetical v2 with a fundamentally different paradigm) and the header as the fine-grained version. This two-tier model has allowed Stripe to serve customers using 2012-era API versions alongside customers using today's version from the same `/v1/` base path. The result: zero forced migration events for existing integrations, and a developer reputation that directly contributes to adoption. By contrast, Twilio has sunset multiple URL versions, requiring migration guides and support overhead that Stripe has avoided.

## Source

- [Stripe API Versioning](https://stripe.com/blog/api-versioning)
- [GitHub REST API Versioning](https://docs.github.com/en/rest/overview/api-versions)
- [Twilio API Versioning](https://www.twilio.com/docs/usage/api/api-versioning)
- [APIs You Won't Hate — API Versioning Has No "Right Way"](https://apisyouwonthate.com/blog/api-versioning-has-no-right-way)
- [Microsoft REST API Guidelines — Versioning](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md#versioning)

## Process

1. Decide major-only URL versioning at the root path segment before any endpoint design begins; document this as a team standard.
2. Define the version support lifecycle: simultaneous version count limit, maintenance-only window duration, and sunset timeline policy.
3. At v2 launch, add `Deprecation` and `Sunset` response headers to all v1 endpoints pointing to the migration guide URL.
4. Publish a breaking-change migration guide at a stable URL (`/changelog` or `/migration/v1-to-v2`) with before/after examples for every changed endpoint.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-versioning-header, api-backward-compatibility, api-deprecation-strategy, api-rest-maturity-model

## Success Criteria

- All API endpoints under a major version share a single URL prefix (e.g., `/v1/`) with no per-resource version segments.
- URL version increments occur only on breaking changes; additive changes are deployed without a new version prefix.
- A deprecation timeline is published simultaneously with any new major version launch.
- v1 and v2 responses are independently routable at the gateway or reverse-proxy layer without header inspection.
- A migration guide with before/after examples exists for every breaking change between versions.
