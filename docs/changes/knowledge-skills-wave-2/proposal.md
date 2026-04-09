# Knowledge Skills Wave 2: Five Expert Domains

## Overview

Five additional domain knowledge skill sets, following the same standard established by the
design knowledge skills (Wave 1): **a complete novice following these skills produces work
indistinguishable from an expert's.**

Each domain is fully framework-agnostic — the skills teach durable principles, not library
APIs. They cross-reference existing behavioral and framework skills to create bidirectional
graph traversal from pattern skills into foundational knowledge.

## Decisions

| Decision                        | Rationale                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| Same skill format as design-\*  | Consistency with Wave 1; format is proven at 55 skills                                    |
| Framework-agnostic only         | ORM/framework-specific knowledge already covered; these fill the conceptual layer beneath |
| 150-250 lines per SKILL.md      | Wave 1 standard: enough for worked examples, anti-patterns, real-world citations          |
| All 4 platforms                 | claude-code, gemini-cli, cursor, codex — full parity from day one                         |
| Sequenced, not parallel         | Each domain tackled to completion before starting the next                                |
| related_skills cross-references | Back-reference into existing relevant skills (prisma-_, owasp-_, gof-\*, etc.)            |

## Domains

### 1. Performance Engineering (~45 skills)

**The gap:** Performance knowledge is tribal. Engineers learn that their app is slow, then
google fixes. There is no systematic mental model for why things are slow and what class of
fix applies. Existing skills (css-performance, next-deployment-optimization,
mobile-performance-patterns) are framework-specific; none teach the underlying model.

**Coverage:**

- Browser rendering pipeline (parse → style → layout → paint → composite)
- Core Web Vitals (LCP, FID/INP, CLS — measurement, root causes, remediation)
- Network performance (HTTP/2, HTTP/3, connection costs, CDN, prefetch, preload)
- JavaScript runtime (event loop, microtasks, long tasks, scheduler, worker threads)
- Caching hierarchies (browser cache, CDN cache, server cache, in-memory, database)
- Bundle optimization (code splitting, tree shaking, lazy loading, module federation)
- Memory management (heap, GC pressure, leaks, profiling)
- Image and asset optimization (format selection, responsive images, lazy loading)
- Database query performance (N+1, index usage, query plans, connection pooling)
- Rendering strategies (SSR, CSR, SSG, ISR, streaming — when each wins)

**Cross-references:** css-performance, next-deployment-optimization, node-performance-profiling,
angular-performance-patterns, mobile-performance-patterns, otel-performance-insights,
test-performance-testing

### 2. Database Design (~45 skills)

**The gap:** Engineers using Prisma or Drizzle are implicitly doing database design without
knowing the fundamentals. The ORM skills teach the tool; nothing teaches the discipline.
Schema decisions made in week 1 are load-bearing for years.

**Coverage:**

- Normalization (1NF through BCNF — when to normalize, when to intentionally denormalize)
- Indexing strategy (B-tree, hash, composite, partial, covering, expression indexes)
- Query planning and optimization (EXPLAIN, index scans vs seq scans, statistics)
- Schema design patterns (polymorphism, EAV, adjacency list, nested sets, closure table)
- ACID properties (atomicity, consistency, isolation, durability — practical implications)
- Transaction isolation levels (read uncommitted through serializable — when each applies)
- Concurrency patterns (optimistic locking, pessimistic locking, MVCC)
- CAP theorem and BASE (consistency tradeoffs, eventual consistency)
- Data modeling for specific patterns (time series, hierarchical, graph, document in relational)
- Migration strategy (zero-downtime migrations, expand/contract pattern)
- Connection management (pooling, pool sizing, connection overhead)
- Sharding and partitioning (horizontal vs vertical, partition key selection)

**Cross-references:** prisma-schema-design, drizzle-schema-definition, drizzle-migrations,
prisma-migrations, prisma-transactions, drizzle-transactions, prisma-performance-patterns,
drizzle-performance-patterns, events-event-sourcing, microservices-cqrs-pattern

### 3. Security Fundamentals (~45 skills)

**The gap:** The owasp-\* skills are a defensive checklist — they tell you what not to do.
There is no knowledge layer explaining the threat model, the cryptographic primitives, or
the architectural patterns that make systems secure by construction rather than by checklist.

**Coverage:**

- Threat modeling (STRIDE, attack trees, data flow diagrams, trust boundaries)
- Cryptography primitives (symmetric, asymmetric, hashing, HMAC, digital signatures)
- Authentication design (credential storage, session management, MFA, passkeys)
- Authorization patterns (RBAC, ABAC, ReBAC, capability-based security)
- Zero-trust architecture (never trust, always verify, least privilege, microsegmentation)
- Secrets management (rotation, distribution, vault patterns, environment variable risks)
- Transport security (TLS, certificate pinning, HSTS, cert transparency)
- Supply chain security (dependency auditing, SBOM, provenance, signing)
- Secure SDLC (threat modeling in design, security testing in CI, pen test integration)
- Audit logging and SIEM (what to log, correlation, alerting, tamper evidence)
- Vulnerability classes (memory safety, injection families, deserialization, race conditions)
- Incident response (containment, forensics, disclosure, post-mortem)

**Cross-references:** owasp-auth-patterns, owasp-cryptography, owasp-csrf-protection,
owasp-secrets-management, owasp-injection-prevention, owasp-xss-prevention,
owasp-dependency-security, harness-security, resilience-circuit-breaker

### 4. API Design (~35 skills)

**The gap:** Engineers design APIs by imitation — they copy patterns they've seen elsewhere
without understanding the principles. REST is widely misunderstood (most "REST" APIs are
RPC over HTTP). GraphQL and tRPC are adopted without understanding what problems they solve.
API decisions are highly durable and expensive to change.

**Coverage:**

- REST principles (Richardson Maturity Model, HATEOAS, resource vs action orientation)
- Resource modeling (nouns vs verbs, resource granularity, nested vs flat resources)
- HTTP semantics (method semantics, status code selection, idempotency, safety)
- API versioning (URL versioning, header versioning, content negotiation — tradeoffs)
- Pagination patterns (cursor, offset, keyset — when each applies and fails)
- Error contract design (problem details RFC, error codes, actionable messages)
- Idempotency (idempotency keys, at-least-once vs exactly-once)
- Rate limiting design (token bucket, leaky bucket, sliding window, headers)
- API authentication (API keys, OAuth2 flows, JWT, mTLS — when each applies)
- Webhook design (delivery guarantees, retry, signature verification, replay attack defense)
- OpenAPI / AsyncAPI contract-first design
- SDK and client ergonomics (naming, discoverability, error surface)
- Deprecation strategy (sunset headers, migration guides, compatibility windows)

**Cross-references:** graphql-schema-design, trpc-router-composition, owasp-auth-patterns,
owasp-rate-limiting, resilience-rate-limiting, resilience-idempotency, harness-api,
events-webhooks-pattern, events-event-schema

### 5. UX Writing & Content Design (~25 skills)

**The gap:** The design-\* skills cover visual and interaction design. The words on the screen
are equally important — and equally undertaught. Poor microcopy creates friction even in
visually polished UIs. This domain bridges design and product.

**Coverage:**

- Microcopy principles (clarity, brevity, human voice, active voice)
- Error message design (what went wrong, why it matters, how to fix it)
- Empty state writing (motivate action, set expectations, avoid "No data found")
- Onboarding copy (progressive disclosure, value-first, reduce anxiety)
- Button and CTA writing (verb-noun pattern, specificity, context-sensitivity)
- Form labels and helper text (inline vs tooltip, placeholder text anti-patterns)
- Confirmation dialogs and destructive action copy
- Notification and alert copy (urgency calibration, actionability)
- Tooltip and contextual help writing
- Loading state copy (progress transparency, expectation setting)
- Accessibility of language (plain language, reading level, internationalization impact)
- Content hierarchy and IA writing (navigation labels, section headings)
- Voice and tone (when to be formal, casual, playful — and when not to be)

**Cross-references:** design-empty-error-states, design-information-architecture,
design-feedback-patterns, design-form-ux, design-loading-patterns, design-i18n-design,
design-readability, a11y-form-patterns

## Implementation Order

Each domain is a standalone implementation wave. Execute in sequence:

1. **Wave 2a:** Performance Engineering
2. **Wave 2b:** Database Design
3. **Wave 2c:** Security Fundamentals
4. **Wave 2d:** API Design
5. **Wave 2e:** UX Writing & Content Design

Each wave follows the same autopilot structure as Wave 1 (design):

- Phase 1: Core skills (the most foundational ~15)
- Phase 2: Extended coverage (remaining domain skills)
- Phase 3: Cross-references (bidirectional links to existing related skills)

## Success Criteria

- Each domain delivers the target skill count at 150-250 lines per SKILL.md
- All skills contain: worked examples from real production systems, anti-patterns section,
  related_skills cross-references, and PhD-level depth in the Details section
- All 4 platforms have identical skill files (full parity)
- The novice standard holds: a complete novice following these skills produces work
  indistinguishable from an expert's
- All schema validation tests pass
- Bidirectional related_skills links created from existing skills into each new domain
