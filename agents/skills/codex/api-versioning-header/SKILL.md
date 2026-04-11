# API Versioning — Header

> HEADER VERSIONING NEGOTIATES API VERSION THROUGH HTTP HEADERS RATHER THAN URI PATHS — IT KEEPS URIS CLEAN AND RESOURCE-CENTRIC WHILE ENABLING FINE-GRAINED BEHAVIORAL VERSIONING, VENDOR MEDIA TYPES, AND CONTENT-TYPE-LEVEL DIFFERENTIATION WITHOUT PROLIFERATING PATH PREFIXES.

## When to Use

- Designing a versioning strategy for an internal or partner API where URI cleanliness and REST purity are priorities
- Implementing fine-grained behavioral versioning within a single major URL version (as Stripe does with `Stripe-Version`)
- Publishing a hypermedia API where vendor media types (`application/vnd.company.v2+json`) carry version semantics
- Migrating from URL versioning to header versioning and needing to understand content negotiation mechanics
- Building an API gateway rule set that routes requests based on `Accept` or custom version headers
- Evaluating tradeoffs between `Accept` header negotiation and a custom `API-Version` header for a new API platform
- Auditing an existing API for version header consistency across SDKs and documentation examples

## Instructions

### Key Concepts

1. **Accept header negotiation** — The standard HTTP mechanism for version negotiation uses the `Accept` header with a vendor media type: `Accept: application/vnd.github.v3+json`. The server inspects this header and returns the response formatted for the requested version. If the version is unsupported, the server returns `406 Not Acceptable`. This is true content negotiation per RFC 7231 — the client declares what it can accept, and the server selects the best match.

2. **Vendor media types** — A vendor media type (IANA `vnd.` prefix) encodes the organization, resource type, and version in the `Content-Type` value: `application/vnd.company.resource.v2+json`. This is the most REST-pure versioning approach because the type itself carries the version, and a resource at `/users/42` can serve multiple representations via the same URI. Vendor types must be registered with IANA for public use, though the `vnd.` prefix convention is widely adopted without formal registration.

3. **Custom version headers** — Many APIs use a custom header (`API-Version: 2024-01-01`, `Stripe-Version: 2023-10-16`, `X-GitHub-Api-Version: 2022-11-28`) rather than encoding the version in `Accept`. Custom headers are simpler to implement, easier to document, and avoid content negotiation complexity. The tradeoff: they are not standard HTTP and require consumers to know the header name. Stripe and GitHub both use custom headers for date-based fine-grained versioning.

4. **Default version behavior** — Requests without a version header must have a defined behavior: serve the oldest supported version (for maximum compatibility) or serve the latest version (for minimum maintenance burden). Stripe defaults to each customer's first-used version, stored on the API key — a sophisticated approach that prevents silent breaking changes for long-lived integrations without requiring explicit header pinning.

5. **Caching considerations** — Header-versioned responses require `Vary: Accept` or `Vary: API-Version` in the response to prevent CDN and proxy caches from serving the wrong version. Without `Vary`, a cache that stores a v1 response may return it to a v2 client. Most CDNs handle `Vary` on `Accept` poorly, leading to low cache-hit rates or disabled caching for header-versioned APIs. This is the primary operational argument for URL versioning on high-traffic public APIs.

6. **Version discovery** — Unlike URL versioning where versions are visible in the path, header-versioned APIs must publish supported versions through documentation or a discovery endpoint. A common pattern is a `/versions` endpoint listing all supported versions, their status (active, deprecated, sunset), and their sunset dates. GitHub's REST API exposes this at `GET /versions`.

### Worked Example

GitHub uses a custom version header (`X-GitHub-Api-Version`) for fine-grained date-based versioning, overlaid on their URL-anchored REST API base:

**Explicit version header request:**

```http
GET /repos/octocat/Hello-World
Accept: application/vnd.github+json
Authorization: Bearer ghp_...
X-GitHub-Api-Version: 2022-11-28
```

```http
HTTP/1.1 200 OK
Content-Type: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28

{
  "id": 1296269,
  "name": "Hello-World",
  "full_name": "octocat/Hello-World",
  ...
}
```

**Unsupported version response:**

```http
GET /repos/octocat/Hello-World
X-GitHub-Api-Version: 2009-01-01
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "message": "Unsupported version: 2009-01-01",
  "documentation_url": "https://docs.github.com/rest/overview/api-versions"
}
```

**Stripe date-based version header:**

```http
POST /v1/payment_intents
Authorization: Bearer sk_live_...
Stripe-Version: 2023-10-16
Content-Type: application/x-www-form-urlencoded

amount=2000&currency=usd
```

Stripe stores the version used at API key creation as the default, so long-lived integrations never see unexpected behavioral changes. The `Stripe-Version` header can override this default for testing or migration. Each version is documented in Stripe's changelog at `stripe.com/docs/upgrades` with a complete list of behavioral differences.

**Vendor media type (GitHub legacy v3):**

```http
GET /repos/octocat/Hello-World
Accept: application/vnd.github.v3+json
Authorization: Bearer ghp_...
```

GitHub's older `vnd.github.v3+json` vendor type embedded the version directly in the `Accept` header — true content negotiation. This was replaced by the `X-GitHub-Api-Version` header approach because custom headers are more predictable in proxies and CDN routing rules.

### Anti-Patterns

1. **Missing `Vary` header on cached responses.** A header-versioned API that returns identical `Cache-Control` headers without `Vary: API-Version` (or `Vary: Accept`) allows CDN and proxy caches to serve v1 responses to v2 clients. The bug is intermittent and environment-dependent — it passes local tests and fails in production under CDN. Fix: always include `Vary` on any response dimension that determines the representation.

2. **Silently defaulting to latest version.** An API that silently serves the latest version when no version header is present will break existing clients when a new version ships. Fix: default to the oldest supported version (or the version pinned at key creation, as Stripe does) and document this behavior explicitly. Never let the default version change without a consumer-visible signal.

3. **Undocumented custom header name.** Using `X-Api-Version` in one service, `API-Version` in another, and `App-Version` in a third makes SDK generation impossible and forces consumers to read per-service documentation for every integration. Fix: standardize on one custom header name across all services in an organization and document it prominently in the API style guide.

4. **Ignoring `Accept` header errors.** Returning `200 OK` with the default version when the client requests an unsupported version (`Accept: application/vnd.company.v99+json`) silently ignores the client's intent. The client believes it is receiving v99 format but gets v1. Fix: return `406 Not Acceptable` with a body listing supported versions and their `Accept` values.

## Details

### Content Negotiation vs. Custom Headers: Decision Guide

Use `Accept` header / vendor media types when: building a hypermedia API, strict REST compliance is required, or the API serves multiple representation formats (JSON, XML, MessagePack) that benefit from unified content negotiation.

Use a custom version header (`API-Version`, `Stripe-Version`) when: the API only serves JSON, simplicity for SDK authors is prioritized, or the versioning policy is date-based rather than integer-based.

Avoid mixing both approaches in the same API — consumers face combinatorial complexity debugging which header controls which behavioral dimension.

### Version Discovery Endpoint

Expose supported versions at a stable, unauthenticated endpoint:

```http
GET /versions
```

```json
{
  "supported": [
    {
      "version": "2024-01-15",
      "status": "active",
      "sunset": null
    },
    {
      "version": "2022-11-28",
      "status": "deprecated",
      "sunset": "2025-06-01"
    }
  ],
  "default": "2022-11-28"
}
```

This enables tooling, SDK generators, and integration test suites to enumerate and test all supported versions programmatically.

### Real-World Case Study: Stripe Version Pinning

Stripe's header versioning model — where each API key stores the version at creation time as the default — has enabled them to maintain backward compatibility across hundreds of behavioral versions since 2013 without a single forced migration. When a new customer creates an API key today, they are pinned to the current version. When an existing customer with a 2015-era key makes a request without a `Stripe-Version` header, they receive 2015 behavior. Stripe's engineering team has documented that this model, combined with their version changelog and upgrade guide, reduces migration-related support tickets by an estimated 70% compared to APIs that default to latest. The cost is operational: each behavioral version must be maintained in the codebase indefinitely. Stripe mitigates this with a dedicated versioning team and a structured deprecation process that gates retirement on adoption metrics.

## Source

- [semver.org — Semantic Versioning Specification](https://semver.org)
- [GitHub REST API Versions](https://docs.github.com/en/rest/overview/api-versions)
- [Stripe API Upgrades and Versioning](https://stripe.com/docs/upgrades)
- [RFC 7231 — HTTP/1.1 Semantics: Content Negotiation](https://rfc-editor.org/rfc/rfc7231#section-5.3)
- [APIs You Won't Hate — Picking a Versioning Method](https://apisyouwonthate.com/blog/api-versioning-has-no-right-way)

## Process

1. Choose between `Accept`-based content negotiation and a custom version header; document the decision and its rationale in the API style guide.
2. Define the default-version policy: oldest supported, latest, or key-pinned — and document it as a consumer-facing guarantee.
3. Add `Vary: API-Version` (or `Vary: Accept`) to all version-negotiated responses before deploying behind a CDN or reverse proxy.
4. Publish a `/versions` discovery endpoint listing supported versions, their status, and sunset dates.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-versioning-url, api-content-negotiation, api-backward-compatibility

## Success Criteria

- All version-negotiated responses include a `Vary` header for the version dimension to prevent cache collisions.
- The default version behavior when no header is present is documented and tested as a consumer-facing guarantee.
- A single, consistent version header name is used across all services in the organization.
- A `/versions` discovery endpoint enumerates supported versions, their status, and sunset dates.
- Requests specifying an unsupported version receive `406 Not Acceptable` with a list of valid values.
