# API Design Knowledge Skills

**Keywords:** REST, HTTP semantics, pagination, versioning, error contracts, rate limiting, webhooks, OpenAPI, idempotency, SDK ergonomics, API authentication, deprecation

## Overview

36 language-agnostic API design knowledge skills teaching durable principles — not library
APIs. Fills the conceptual layer beneath the existing `graphql-*`, `trpc-*`, and `events-*`
implementation skills and complements the `harness-api-design` rigid skill.

**Goals:**

- A complete novice following these skills produces API designs indistinguishable from an expert's
- Every skill teaches one distinct concept with worked examples from real production APIs
- Bidirectional cross-references connect into existing graphql-_, trpc-_, owasp-_, events-_,
  security-_, perf-_, and db-\* skills
- All 4 platforms (claude-code, gemini-cli, cursor, codex) at full parity

**Out of scope:**

- Framework-specific API implementation (covered by graphql-_, trpc-_, etc.)
- Server implementation patterns (covered by harness-api-design rigid skill)
- gRPC/Protobuf (distinct protocol family — future domain candidate)
- API gateway configuration (infrastructure, not design)

## Decisions

| Decision                                                       | Rationale                                                                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `api-*` prefix                                                 | Terse, matches `db-*`/`perf-*` convention, no collision with `harness-api-design`                                                   |
| One concept per skill                                          | Follows db-\* pattern (separate `db-btree-index`, `db-hash-index`); enables granular cross-references                               |
| 36 skills across 8 clusters                                    | Natural decomposition of 13 spec coverage areas; count driven by concepts, not a target                                             |
| Distinct from overlapping skills                               | `api-rate-limiting` teaches the consumer contract; `owasp-rate-limiting` teaches the defense. Different angles, bidirectional links |
| gRPC excluded                                                  | Different protocol family with its own mental model; future domain candidate                                                        |
| Same 8-section SKILL.md template                               | Proven at 180+ knowledge skills; no reason to diverge                                                                               |
| `type: knowledge`, `tier: 3`, `cognitive_mode: advisory-guide` | Standard for all knowledge skills                                                                                                   |
| Topic-cluster implementation order                             | REST Foundations first (prerequisite), Contract & Tooling last (depends on all prior clusters)                                      |

## Technical Design

### Skill Manifest

#### Cluster 1: REST Foundations (5 skills)

| Skill ID                   | Description                                                                      | Key Cross-References                           |
| -------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------- |
| `api-rest-maturity-model`  | Richardson Maturity Model levels 0-3 with examples of each                       | api-hateoas, api-resource-modeling             |
| `api-resource-modeling`    | Nouns vs verbs, resource identification, URI design                              | api-resource-granularity, api-nested-vs-flat   |
| `api-resource-granularity` | Fine vs coarse resources, aggregation patterns                                   | api-resource-modeling, api-field-selection     |
| `api-nested-vs-flat`       | Nested resource paths vs flat with filters — when each applies                   | api-resource-modeling, api-filtering-sorting   |
| `api-hateoas`              | Hypermedia as the engine of application state — practical application and limits | api-rest-maturity-model, api-pagination-cursor |

#### Cluster 2: HTTP Semantics (5 skills)

| Skill ID                   | Description                                              | Key Cross-References                             |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| `api-http-methods`         | GET/POST/PUT/PATCH/DELETE semantics, safety, idempotency | api-status-codes, api-idempotency-keys           |
| `api-status-codes`         | Status code selection by scenario, common misuses        | api-http-methods, api-error-contracts            |
| `api-content-negotiation`  | Accept/Content-Type headers, versioning via media types  | api-versioning-header, api-http-caching          |
| `api-http-caching`         | Cache-Control, ETag, Vary, CDN interaction               | api-conditional-requests, perf-cdn-cache-control |
| `api-conditional-requests` | If-None-Match, If-Modified-Since, optimistic concurrency | api-http-caching, db-optimistic-locking          |

#### Cluster 3: Request/Response Design (6 skills)

| Skill ID                | Description                                                              | Key Cross-References                               |
| ----------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| `api-pagination-cursor` | Cursor-based pagination — implementation, tradeoffs, cursor encoding     | api-pagination-offset, graphql-pagination-patterns |
| `api-pagination-offset` | Offset/limit pagination — simplicity vs consistency tradeoffs            | api-pagination-cursor, api-pagination-keyset       |
| `api-pagination-keyset` | Keyset (seek) pagination — performance at scale                          | api-pagination-cursor, db-btree-index              |
| `api-filtering-sorting` | Query parameter design for filtering and sorting collections             | api-nested-vs-flat, api-pagination-cursor          |
| `api-field-selection`   | Sparse fieldsets, partial responses, GraphQL-style field picking in REST | api-resource-granularity, graphql-client-patterns  |
| `api-bulk-operations`   | Batch endpoints, bulk create/update/delete, partial failure semantics    | api-idempotency-keys, api-error-contracts          |

#### Cluster 4: Error Handling (4 skills)

| Skill ID                  | Description                                                                | Key Cross-References                         |
| ------------------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| `api-error-contracts`     | Consistent error response structure, error codes, actionable messages      | api-problem-details-rfc, api-status-codes    |
| `api-problem-details-rfc` | RFC 9457 (Problem Details for HTTP APIs) — structure, extensions, adoption | api-error-contracts, api-validation-errors   |
| `api-validation-errors`   | Field-level validation error design, multi-error responses                 | api-problem-details-rfc, api-bulk-operations |
| `api-retry-guidance`      | Retry-After headers, backoff signals, transient vs permanent errors        | api-rate-limit-headers, api-idempotency-keys |

#### Cluster 5: Versioning & Evolution (4 skills)

| Skill ID                     | Description                                                                     | Key Cross-References                              |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| `api-versioning-url`         | URL path versioning (/v1/, /v2/) — simplicity vs URI pollution                  | api-versioning-header, api-backward-compatibility |
| `api-versioning-header`      | Accept header versioning, custom version headers                                | api-versioning-url, api-content-negotiation       |
| `api-deprecation-strategy`   | Sunset headers, migration guides, compatibility windows, timeline communication | api-backward-compatibility, api-sdk-ergonomics    |
| `api-backward-compatibility` | Additive changes, Postel's law, breaking change detection                       | api-deprecation-strategy, api-versioning-url      |

#### Cluster 6: Security & Access (5 skills)

| Skill ID                      | Description                                                                  | Key Cross-References                                    |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| `api-authentication-patterns` | API auth landscape — keys, OAuth2, JWT, mTLS — when each applies             | api-api-keys, api-oauth2-flows, security-authentication |
| `api-api-keys`                | Key generation, rotation, scoping, transmission (header vs query)            | api-authentication-patterns, owasp-secrets-management   |
| `api-oauth2-flows`            | Authorization code, client credentials, PKCE — flow selection by client type | api-authentication-patterns, owasp-auth-patterns        |
| `api-rate-limiting`           | Rate limit design as consumer contract — quotas, tiers, fair usage           | api-rate-limit-headers, owasp-rate-limiting             |
| `api-rate-limit-headers`      | X-RateLimit-\*, Retry-After, RateLimit draft standard headers                | api-rate-limiting, api-retry-guidance                   |

#### Cluster 7: Async & Events (4 skills)

| Skill ID                      | Description                                                               | Key Cross-References                          |
| ----------------------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| `api-webhook-design`          | Webhook registration, payload design, delivery guarantees, retry policy   | api-webhook-security, events-webhooks-pattern |
| `api-webhook-security`        | Signature verification, replay attack defense, HMAC, timestamp validation | api-webhook-design, security-hmac             |
| `api-idempotency-keys`        | Idempotency key design, at-least-once vs exactly-once, key storage        | api-http-methods, events-idempotency-pattern  |
| `api-long-running-operations` | Async request patterns, polling, callbacks, status endpoints              | api-webhook-design, api-status-codes          |

#### Cluster 8: Contract & Tooling (3 skills)

| Skill ID               | Description                                                                        | Key Cross-References                           |
| ---------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| `api-openapi-design`   | Contract-first OpenAPI design, schema reuse, code generation                       | api-contract-testing, api-error-contracts      |
| `api-contract-testing` | Consumer-driven contracts, Pact, schema validation in CI                           | api-openapi-design, api-backward-compatibility |
| `api-sdk-ergonomics`   | Client library design — naming, discoverability, error surface, pagination helpers | api-deprecation-strategy, api-error-contracts  |

### Skill File Format

Each skill follows the established knowledge skill template:

**skill.yaml:**

```yaml
name: api-<skill-id>
version: '1.0.0'
description: <concise description with deliverables>
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
  - <2-7 cross-references>
stack_signals:
  - rest
  - api
  - http
keywords:
  - <5-15 domain keywords>
metadata:
  author: community
  upstream: <authoritative documentation URL>
state:
  persistent: false
  files: []
depends_on: []
```

**SKILL.md sections:**

1. Intro Hook (1-2 lines, uppercase concept, benefit statement)
2. When to Use (5-10 scenario bullets)
3. Instructions (Key Concepts + Worked Example + Anti-Patterns, 100-130 lines)
4. Details (Advanced Topics + Real-World Case Studies)
5. Source (3-5 authoritative references)
6. Process (3-5 step practitioner workflow)
7. Harness Integration (type: knowledge boilerplate + related_skills)
8. Success Criteria (3-6 testable acceptance criteria)

### Cross-Reference Strategy

**Inbound (existing skills referencing new api-\* skills):**

- graphql-schema-design → api-resource-modeling, api-field-selection
- graphql-pagination-patterns → api-pagination-cursor, api-pagination-offset, api-pagination-keyset
- graphql-auth-patterns → api-authentication-patterns, api-oauth2-flows
- graphql-error-handling → api-error-contracts, api-problem-details-rfc
- trpc-router-composition → api-resource-modeling, api-nested-vs-flat
- trpc-error-handling → api-error-contracts, api-status-codes
- trpc-input-validation → api-validation-errors
- events-webhooks-pattern → api-webhook-design, api-webhook-security
- events-idempotency-pattern → api-idempotency-keys
- owasp-auth-patterns → api-authentication-patterns, api-oauth2-flows
- owasp-rate-limiting → api-rate-limiting, api-rate-limit-headers
- owasp-secrets-management → api-api-keys
- security-authentication → api-authentication-patterns
- security-hmac → api-webhook-security
- perf-cdn-cache-control → api-http-caching
- db-optimistic-locking → api-conditional-requests
- db-btree-index → api-pagination-keyset

**Outbound:** All listed in the skill manifest tables above.

## Success Criteria

- All 36 skills follow the 8-section SKILL.md template
- Each SKILL.md is 150-250 lines with worked examples from real production APIs
- Every skill has an anti-patterns section with at least 2 anti-patterns
- All skill.yaml files use `type: knowledge`, `tier: 3`, `cognitive_mode: advisory-guide`, empty `tools[]`, all 4 platforms
- Bidirectional `related_skills` cross-references within api-_ and outward to graphql-_, trpc-_, owasp-_, events-_, security-_, perf-_, db-_ skills
- Existing skills that are cross-referenced get updated with back-links to new api-\* skills
- `harness validate` passes after all skills are written
- Schema validation tests pass
- The novice standard holds: a complete novice following these skills designs APIs indistinguishable from an expert's

## Implementation Order

8 phases, one per cluster, executed sequentially. Each phase delivers independently useful skills.

| Phase | Cluster                  | Count | Dependencies                             |
| ----- | ------------------------ | ----- | ---------------------------------------- |
| 1     | REST Foundations         | 5     | None — foundational                      |
| 2     | HTTP Semantics           | 5     | Phase 1 (REST context)                   |
| 3     | Request/Response Design  | 6     | Phase 1-2 (resource + HTTP knowledge)    |
| 4     | Error Handling           | 4     | Phase 2 (status codes)                   |
| 5     | Versioning & Evolution   | 4     | Phase 2-3 (HTTP + response patterns)     |
| 6     | Security & Access        | 5     | Phase 1-2 (REST + HTTP)                  |
| 7     | Async & Events           | 4     | Phase 2, 4 (HTTP + error patterns)       |
| 8     | Contract & Tooling       | 3     | Phase 3-5 (needs full design vocabulary) |
| 9     | Cross-Reference Backfill | —     | Phase 1-8 (all skills exist)             |

Phase 9 updates existing graphql-_, trpc-_, owasp-_, events-_, security-_, perf-_, and db-_
skills with back-links to new api-_ skills.
