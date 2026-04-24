<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate-docs` to regenerate. -->

# Skills Catalog

738 skills across 3 tiers. Tier 1 and 2 skills are registered as slash commands. Tier 3 skills are discoverable via the `search_skills` MCP tool. See the [Features Overview](../guides/features-overview.md) for narrative documentation.

## Tier 1 — Workflow (13 skills)

### add-harness-component

Add a component to an existing harness project

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** constructive-architect
- **Depends on:** initialize-harness-project

### harness-autopilot

Autonomous phase execution loop — chains planning, execution, verification, and review, pausing only at human decision points

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** constructive-architect
- **Depends on:** harness-planning, harness-execution, harness-verification, harness-code-review

### harness-brainstorming

Structured ideation and exploration with harness methodology

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** constructive-architect
- **Depends on:** harness-planning, harness-soundness-review

### harness-debugging

Systematic debugging with harness validation and state tracking

- **Triggers:** manual, on_bug_fix
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** diagnostic-investigator

### harness-execution

Execute a planned set of tasks with harness validation and state tracking

- **Triggers:** manual, on_new_feature, on_bug_fix
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer
- **Depends on:** harness-verification

### harness-onboarding

Onboard a new developer to a harness-managed project

- **Triggers:** manual, on_project_init
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** advisory-guide

### harness-planning

Structured project planning with harness constraints and validation

- **Triggers:** manual, on_new_feature, on_project_init
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** constructive-architect
- **Depends on:** harness-verification, harness-soundness-review

### harness-refactoring

Safe refactoring with validation before and after changes

- **Triggers:** manual, on_refactor
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** meticulous-implementer

### harness-router

Natural language router to harness skills — classifies intent, confirms, dispatches

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** analytical-classifier

### harness-skill-authoring

Create and maintain harness skills following the rich skill format

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** constructive-architect

### harness-tdd

Test-driven development integrated with harness validation

- **Triggers:** manual, on_new_feature, on_bug_fix
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer
- **Depends on:** harness-verification

### initialize-harness-project

Scaffold a new harness-compliant project

- **Triggers:** manual, on_project_init
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** constructive-architect
- **Depends on:** initialize-test-suite-project

### initialize-test-suite-project

Scaffold or migrate a test-suite project (API, E2E/UI, or shared library) with test-suite-specific layer models, tags, reporter stack, and custom report

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** constructive-architect
- **Depends on:** initialize-harness-project

## Tier 2 — Maintenance (22 skills)

### cleanup-dead-code

Detect and auto-fix dead code including dead exports, commented-out code, and orphaned dependencies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** diagnostic-investigator

### detect-doc-drift

Detect documentation that has drifted from code

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** diagnostic-investigator

### enforce-architecture

Validate architectural layer boundaries, detect violations, and auto-fix import ordering and forbidden import replacement

- **Triggers:** manual, on_pr, on_commit
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-architecture-advisor

Interactive architecture advisor that surfaces trade-offs and helps humans choose

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** advisory-guide

### harness-code-review

Multi-phase code review pipeline with mechanical checks, graph-scoped context, and parallel review agents

- **Triggers:** manual, on_pr, on_review
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** adversarial-reviewer

### harness-codebase-cleanup

Orchestrate dead code removal and architecture violation fixes with shared convergence loop

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** systematic-orchestrator
- **Depends on:** cleanup-dead-code, enforce-architecture, harness-hotspot-detector

### harness-dependency-health

Analyze structural health of the codebase using graph metrics

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** analytical-reporter

### harness-docs-pipeline

Orchestrator composing 4 documentation skills into a sequential pipeline with convergence-based remediation and qualitative health reporting

- **Triggers:** manual, on_doc_check
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** constructive-architect
- **Depends on:** detect-doc-drift, align-documentation, validate-context-engineering, harness-knowledge-mapper

### harness-hotspot-detector

Identify structural risk hotspots via co-change and churn analysis

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** analytical-reporter

### harness-impact-analysis

Graph-based impact analysis — answers "if I change X, what breaks?"

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** analytical-reporter

### harness-integrity

Unified integrity gate — chains verify (quick gate) with AI review into a single report

- **Triggers:** manual, on_pr, on_milestone
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier
- **Depends on:** harness-verify, harness-code-review

### harness-knowledge-pipeline

4-phase knowledge extraction, reconciliation, drift detection, and remediation with convergence loop

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** constructive-architect

### harness-perf

Performance enforcement and benchmark management

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier
- **Depends on:** harness-verify

### harness-release-readiness

Audit npm release readiness, run maintenance checks, offer auto-fixes, track progress across sessions

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier
- **Depends on:** detect-doc-drift, cleanup-dead-code, align-documentation, enforce-architecture, harness-diagnostics, harness-parallel-agents

### harness-roadmap

Create and manage a unified project roadmap from existing specs and plans

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** constructive-architect

### harness-roadmap-pilot

AI-assisted selection of the next highest-impact roadmap item with scoring, assignment, and skill transition

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** constructive-architect
- **Depends on:** harness-brainstorming, harness-autopilot, harness-roadmap

### harness-security-scan

Lightweight mechanical security scan for health checks

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer

### harness-soundness-review

Deep soundness analysis of specs and plans with auto-fix and convergence loop

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-supply-chain-audit

6-factor dependency risk evaluation for supply chain security

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer
- **Depends on:** harness-security-scan

### harness-test-advisor

Graph-based test selection — answers "what tests should I run?"

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** advisory-guide

### harness-verification

Comprehensive harness verification of project health and compliance

- **Triggers:** manual, on_pr, on_commit
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-verify

Binary pass/fail quick gate — runs test, lint, typecheck commands and returns structured result

- **Triggers:** manual, on_task_complete
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

## Tier 3 — Domain (703 skills)

### a11y-aria-patterns

Apply ARIA roles, states, and properties correctly to enhance assistive technology support

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### a11y-color-contrast

Ensure sufficient color contrast ratios and avoid color-only information conveyance

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### a11y-form-patterns

Build accessible forms with proper labeling, validation, and error handling

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### a11y-image-text-alt

Write effective alt text for images and provide text alternatives for non-text content

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### a11y-keyboard-navigation

Ensure all interactive elements are reachable and operable via keyboard alone

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### a11y-modal-patterns

Build accessible modal dialogs with focus trapping, escape dismissal, and screen reader announcements

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### a11y-motion-animation

Implement animations that respect user motion preferences and avoid triggering vestibular disorders

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### a11y-screen-reader-testing

Test web applications with screen readers to verify accessible user experience

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### a11y-semantic-html

Use semantic HTML elements to convey document structure and meaning to assistive technology

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### a11y-testing-automation

Automate accessibility testing with axe-core, jest-axe, Playwright, and CI integration

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### align-documentation

Auto-fix documentation drift issues

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** meticulous-verifier
- **Depends on:** detect-doc-drift

### angular-component-pattern

Author Angular components with correct inputs/outputs, change detection, and lifecycle hooks

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### angular-directive-pattern

Create attribute and structural directives with @Directive, hostBindings, and host listeners

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### angular-http-interceptors

Intercept HTTP requests with HttpInterceptorFn for auth headers, retry logic, and error handling

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### angular-lazy-loading

Reduce initial bundle size with loadComponent, loadChildren, preloading strategies, and deferrable views

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### angular-performance-patterns

Optimize Angular app performance with OnPush, trackBy, virtual scrolling, and deferrable views

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### angular-pipe-pattern

Create custom Angular pipes for pure data transformation and leverage built-in pipes correctly

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### angular-reactive-forms

Build type-safe reactive forms with FormGroup, FormControl, Validators, and dynamic form arrays

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### angular-routing-guards

Protect and preload routes with functional CanActivateFn, CanDeactivateFn, and ResolveFn guards

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### angular-rxjs-patterns

Apply RxJS patterns in Angular — switchMap, takeUntilDestroyed, async pipe, and error handling

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### angular-schematics

Use ng generate, custom schematics, and angular.json workspace config for scaffolding and configuration

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### angular-service-di

Design Angular services with dependency injection, providers, and injection tokens

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### angular-signals-pattern

Manage reactive state with Angular Signals — signal(), computed(), effect(), and toSignal()

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### angular-standalone-components

Build module-free Angular apps with standalone components, bootstrapApplication, and lazy routes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### angular-state-management

Manage application state with NgRx Store, createAction/createReducer/createSelector, or signal stores

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### angular-testing-patterns

Test Angular components, services, and pipes with TestBed, ComponentFixture, and service mocks

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-api-keys

API key design — generation entropy requirements, rotation strategy, scoping permissions, transmission via Authorization header, storage hashing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-authentication-patterns

API auth landscape overview — when to use API keys vs OAuth2 vs JWT vs mTLS, trust levels, client types, token lifetimes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-backward-compatibility

Additive change rules, Postel's law, breaking change taxonomy, automated breaking-change detection

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-bulk-operations

Batch endpoints including bulk create/update/delete, partial failure semantics, transactional vs best-effort batches, and Idempotency-Key on bulk

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-conditional-requests

If-None-Match, If-Modified-Since, If-Match conditional headers, 304 Not Modified, and optimistic concurrency control

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-content-negotiation

Accept/Content-Type header semantics, media-type versioning, charset and encoding negotiation, and Vary header requirements

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-contract-testing

Consumer-driven contract testing — Pact fundamentals, provider verification, schema validation in CI (spectral, vacuum), breaking change detection (oasdiff), contract as living documentation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-deprecation-strategy

Sunset header (RFC 8594), Deprecation header, migration guide design, compatibility windows, communication cadence

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-error-contracts

Consistent error response structure — machine-readable codes, human-readable messages, actionable remediation, and error taxonomies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-field-selection

Sparse fieldsets and partial responses via ?fields= syntax, nested field selection, and performance tradeoffs vs GraphQL

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-filtering-sorting

Query parameter design for filter operators (eq, gt, lt, in, contains), sort syntax, filter injection prevention, and performance hints

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-hateoas

Hypermedia as the engine of application state -- practical HAL and JSON:API link design with adoption criteria

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-http-caching

Cache-Control directives, ETag generation, Vary header strategy, CDN interaction, and cache invalidation patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-http-methods

GET/POST/PUT/PATCH/DELETE semantics, safety and idempotency properties, and when to use each HTTP method

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-idempotency-keys

Idempotency key design — UUID v4 generation, key storage TTL, 24h window convention, at-least-once vs exactly-once semantics, safe retry scope

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-long-running-operations

Async request patterns — 202 Accepted + polling, operation resource pattern, callback/webhook notification, status endpoint design, Google AIP-151

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-nested-vs-flat

Nested resource paths vs flat URLs with filters -- decision criteria and URL depth guidelines

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-oauth2-flows

OAuth2 flows — authorization code + PKCE, client credentials, device code, implicit (deprecated), token introspection, refresh token rotation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-openapi-design

Contract-first OpenAPI 3.1 design — schema reuse ($ref, components), discriminator for polymorphism, operationId naming conventions, AsyncAPI for event-driven APIs, code generation integration

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-pagination-cursor

Cursor-based pagination with opaque tokens, base64 encoding, forward/backward traversal, and cursor stability guarantees

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-pagination-keyset

Keyset (seek) pagination with composite key design, sort order stability, and consistent performance at 10M+ rows

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-pagination-offset

Offset/limit pagination including COUNT(\*) costs, page drift on inserts/deletes, max offset limits, and UI implications

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-problem-details-rfc

RFC 9457 Problem Details for HTTP APIs — type URI, title, status, detail, instance fields, custom extensions, and application/problem+json content type

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-rate-limit-headers

Rate limit response headers — X-RateLimit-Limit/Remaining/Reset, IETF RateLimit draft standard, Retry-After semantics, per-resource quota pools

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-rate-limiting

Rate limit design as consumer contract — quota tiers, burst vs sustained limits, per-user vs per-app limits, fair-use policy, quota negotiation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-resource-granularity

Fine-grained vs coarse-grained resource design -- aggregation patterns and over-fetching tradeoffs

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-resource-modeling

Nouns vs verbs in URI design, resource identification, and URL structure for REST APIs

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-rest-maturity-model

Richardson Maturity Model levels 0-3 -- evaluating and advancing REST API design maturity

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-retry-guidance

Retry-After headers, exponential backoff signals, transient vs permanent error classification, 429 vs 503 semantics, and idempotency requirement for safe retries

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-sdk-ergonomics

Client library design — method naming (verb-noun), pagination helpers (auto-cursor iteration), error surface (typed exceptions vs error objects), retry built-ins, idiomatic patterns per language, discoverability

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-status-codes

Status code selection by scenario, common misuses (200 for errors, 404 vs 403, 400 vs 422), and response contract design

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-validation-errors

Field-level validation error design — multi-field error arrays, JSON Pointer (RFC 6901) paths, source/pointer vs source/parameter, and 422 vs 400 choice

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-versioning-header

Accept header versioning (content negotiation), custom version headers (API-Version:), vendor media types (application/vnd.company.v2+json)

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-versioning-url

URL path versioning (/v1/, /v2/) — when to use, URI pollution tradeoffs, major-only vs minor versioning, migration timeline patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-webhook-design

Webhook registration, payload design, delivery guarantees (at-least-once), retry policy, ordering guarantees, fan-out patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### api-webhook-security

Signature verification (HMAC-SHA256), timestamp validation (replay attack defense), tolerance windows, secret rotation, TLS requirement

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### astro-component-pattern

Structure .astro components with frontmatter, template, and scoped styles following Astro conventions

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### astro-content-collections

Organize and validate content with Astro content collections, schema definitions, and getCollection

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### astro-deployment-config

Deploy Astro projects to Vercel, Node, Cloudflare, and Netlify with the correct adapter and environment variable setup

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### astro-image-optimization

Optimize images with astro:assets, the Image component, and remote image configuration

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### astro-integration-pattern

Add official and custom Astro integrations using hooks, the integration API, and addRenderer

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### astro-islands-architecture

Apply Islands Architecture with client directives and partial hydration to ship minimal JavaScript

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### astro-multi-framework

Mix React, Vue, Svelte, and Solid components in one Astro project with framework isolation and shared state via nanostores

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### astro-routing-pattern

Implement file-based routing, dynamic routes, and getStaticPaths for static and server-rendered pages

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### astro-server-endpoints

Build API endpoints and middleware in Astro for GET/POST handlers and server-side request processing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### astro-ssr-hybrid

Configure SSR and hybrid rendering with output modes, adapters, and per-page prerender control

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### astro-view-transitions

Implement smooth page transitions and persistent islands using Astro View Transitions API

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### check-mechanical-constraints

Run all mechanical constraint checks (context validation + architecture)

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier
- **Depends on:** validate-context-engineering, enforce-architecture

### css-animation-pattern

Create performant CSS animations with Tailwind transitions and keyframe utilities

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### css-component-variants

Build type-safe component variants with cva (class-variance-authority)

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### css-css-modules

Scope CSS to components with CSS Modules for collision-free class names

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### css-custom-components

Build reusable styled components with Tailwind patterns and prop-driven APIs

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### css-dark-mode

Implement dark mode with Tailwind's dark variant and CSS custom properties

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### css-design-tokens

Define and manage design tokens for colors, spacing, and typography in Tailwind

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### css-headless-ui

Style accessible headless components from Radix UI and Headless UI with Tailwind

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### css-layout-patterns

Build common layouts with Tailwind flexbox and grid utilities

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### css-performance-patterns

Optimize CSS performance with content-visibility, containment, and render-efficient patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### css-responsive-design

Build responsive layouts with Tailwind breakpoints and container queries

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### css-tailwind-merge

Resolve Tailwind class conflicts with tailwind-merge for safe className composition

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### css-tailwind-pattern

Apply Tailwind CSS utility-first patterns for consistent, maintainable styling

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-acid-in-practice

WAL, fsync, crash recovery, and durability guarantees across database engines

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-acid-properties

Atomicity, consistency, isolation, and durability -- practical implications and failure modes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-adjacency-list

Parent-child hierarchies via self-referencing foreign key, recursive CTEs, and depth queries

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-audit-trail

Change tracking via triggers or application-level logging with immutable append-only audit logs

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-btree-index

B-tree index structure, range queries, ordering, and default index type behavior

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-cap-theorem

Consistency, availability, partition tolerance -- practical meaning and common misunderstandings

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-closure-table

Ancestor-descendant pair table for fast path queries and flexible hierarchy operations

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-composite-index

Multi-column indexes, column ordering strategy, and the leftmost prefix rule

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-connection-pooling

PgBouncer configuration, pool modes (session/transaction/statement), and sizing formulas

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-connection-sizing

max_connections tuning, per-connection memory overhead, and serverless pool constraints

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-covering-index

Index-only scans using INCLUDE columns to avoid heap table lookups

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-deadlock-prevention

Lock ordering, timeout strategies, deadlock detection, and resolution patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-denormalization

When and how to intentionally denormalize for performance, read-heavy patterns, and materialized views

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-document-in-relational

JSONB columns for semi-structured data -- when to embed vs normalize, indexing JSON, and hybrid modeling

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-entity-attribute-value

EAV pattern for dynamic attributes -- when justified, why usually avoided, and alternatives

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-eventual-consistency

BASE properties, convergence strategies, and conflict resolution patterns for eventually consistent systems

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-expand-contract

Add new, migrate data, remove old -- safe column and table renames using expand-contract

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-explain-reading

Reading EXPLAIN and EXPLAIN ANALYZE output, understanding cost estimation, and comparing actual vs estimated rows

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-expression-index

Indexes on computed expressions, functional indexes, and specialized index types (GIN, GiST)

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-first-normal-form

Atomic values, no repeating groups, and primary key requirement for First Normal Form (1NF)

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-graph-in-relational

Modeling graph relationships in SQL with recursive queries and knowing when to use a graph DB instead

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-hash-index

Hash indexes for equality-only lookups and when to prefer them over B-tree

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-hierarchical-data

Comparison of adjacency list, nested sets, closure table, and materialized path -- a selection guide

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-horizontal-sharding

Shard key selection, cross-shard queries, resharding strategies, and consistent hashing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-isolation-levels

Read uncommitted through serializable -- PostgreSQL's MVCC-based isolation implementation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-isolation-selection

Choosing isolation levels for specific workloads -- performance vs correctness trade-offs

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-migration-rollback

Forward-only vs reversible migrations, data backfill safety, and blue-green schema strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-mvcc

Multi-version concurrency control, snapshot isolation, tuple visibility, and vacuum/bloat management

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-nested-sets

Left/right numbering for hierarchies -- fast reads, expensive writes, and when to use

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-optimistic-locking

Version columns, conditional updates, conflict detection and retry patterns for optimistic concurrency control

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-partial-index

Filtered indexes with WHERE clauses to reduce index size and target specific query patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-pessimistic-locking

SELECT FOR UPDATE, lock granularity, lock duration, and row-level locking strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-polymorphic-associations

Single-table inheritance, class-table inheritance, and shared foreign key patterns for polymorphic data

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-query-rewriting

Rewriting queries for planner efficiency -- CTEs vs subqueries, EXISTS vs IN, and sargable predicates

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-query-statistics

pg_stats, histogram bounds, selectivity estimation, and the ANALYZE command

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-read-phenomena

Dirty reads, non-repeatable reads, phantom reads, and serialization anomalies explained with concrete examples

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-scan-types

Sequential scan, index scan, bitmap scan, and index-only scan -- when the planner chooses each

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-second-normal-form

Full functional dependency and eliminating partial dependencies for Second Normal Form (2NF)

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-table-partitioning

Range, list, and hash partitioning -- declarative partitioning, partition pruning, and maintenance

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-temporal-data

Valid-time, transaction-time, and bitemporal tables for tracking data as it changes over time

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-third-normal-form

Eliminating transitive dependencies and knowing when 3NF is sufficient for Third Normal Form (3NF)

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-time-series

Append-only tables, time-based partitioning, retention policies, and TimescaleDB patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-vertical-partitioning

Table splitting, hot/cold data separation, TOAST management, and large object strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### db-zero-downtime-migration

Online schema changes without downtime -- avoiding locks, pg_repack, and gh-ost patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-affordances

Perceived actionability — signifiers, constraints, mappings (Don Norman), flat design's affordance problem, touch targets, hover states as affordance

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-alignment

Visual order — edge, center, optical vs. mathematical alignment, alignment as invisible structure

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-apple-hig

Apple Human Interface Guidelines covering clarity/deference/depth, vibrancy and materials, SF Symbols, semantic colors, safe areas, and platform-specific navigation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-atomic-design

Composition methodology for building design systems using atoms, molecules, organisms, templates, and pages

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-brand-consistency

Visual coherence — brand attributes to design decisions, voice to visual mapping, consistency vs monotony, brand flex zones, multi-platform coherence

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-color-accessibility

Color independence — conveying information without color alone, colorblind-safe palettes, perceptual uniformity

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-color-harmony

Color wheel relationships — complementary, analogous, triadic, split-complementary, tetradic schemes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-color-psychology

Emotional and cultural color associations — warmth/coolness, trust, urgency, industry conventions

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-component-anatomy

Anatomy of reusable components covering slots, variants, states, sizes, composition patterns, and compound components

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-consistency

Internal vs. external consistency — consistent patterns within a product, platform convention adherence, and when to break consistency deliberately

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-content-density

Information density tradeoffs — compact vs. comfortable vs. spacious, data-dense vs. marketing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-contrast-ratio

Luminance contrast for readability and visual weight — WCAG ratios, contrast as hierarchy tool

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-dark-mode-color

Color adaptation for dark themes — inverted hierarchy, reduced saturation, elevation through lightness

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-data-viz-design

Data visualization principles — chart selection, color encoding, annotation, Tufte's data-ink ratio, accessible charts, avoiding chartjunk, small multiples

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-design-audit

Evaluating existing design — heuristic evaluation, consistency inventory, accessibility audit, competitive analysis, identifying design debt

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-design-critique

Structured feedback — critique frameworks (like/wish/wonder, what/why/improve), separating subjective preference from objective assessment

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-design-documentation

Documenting design decisions — design rationale, spec handoff, annotating designs, living documentation, decision logs, the DESIGN.md format

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-design-governance

Living system maintenance covering contribution models, deprecation, versioning, adoption metrics, and documentation standards

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-elevation-shadow

Depth as information — shadow anatomy (offset, blur, spread, color), elevation scale, chromatic shadows, material metaphor, dark mode shadows

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-empty-error-states

Empty and error state design — empty states as onboarding, error states as recovery, 404 pages, zero-data states, degraded states, constructive error messages

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-feedback-patterns

System response design — immediate vs delayed feedback, optimistic updates, progress indicators, confirmation patterns, undo vs confirm, toast/snackbar/banner

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-fluent-design

Microsoft Fluent 2 design system covering light/depth/motion/material/scale, acrylic material, reveal highlight, connected animations, responsive containers, and token theming

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-font-pairing

Combining typefaces — contrast principles, superfamilies, serif+sans rules, limiting to 2-3 families

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-form-ux

Form design beyond labels — progressive disclosure, inline validation timing, smart defaults, forgiving formats, single-column superiority, error recovery

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-gestalt-closure-continuity

Pattern completion — the brain fills gaps in incomplete shapes (closure) and follows smooth paths over abrupt changes (continuity), implications for icons, progress indicators, and visual flow

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-gestalt-common-fate

Motion grouping — elements that move or change together are perceived as a unit, implications for animation, loading states, and batch operations

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-gestalt-figure-ground

Depth perception — distinguishing foreground from background, ambiguous figure-ground as design tool, z-axis ordering, overlay and modal perception

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-gestalt-proximity

Spatial grouping — elements near each other perceived as related, controlling group membership through distance, common region as proximity amplifier

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-gestalt-similarity

Visual kinship — elements sharing color, size, shape, or texture perceived as related, creating categories without explicit labels

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-grid-systems

Grid theory — column, modular, baseline, compound grids, breaking the grid intentionally

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-i18n-design

Designing for internationalization — text expansion, RTL layout, icon cultural sensitivity, date/number/currency formatting, pseudolocalization

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-iconography

Icon design principles — optical sizing, stroke consistency, pixel grid alignment, metaphor clarity, icon families, filled vs outlined, icon as language

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-illustration-style

Illustration system — style consistency, spot vs hero illustrations, illustration as brand voice, abstract vs representational, illustration tokens

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-imagery-photography

Image in design — art direction, aspect ratios, focal point, image treatments (duotone, overlay, blur), placeholder strategy, image as hero vs supporting

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-information-architecture

Structuring information — card sorting, tree testing, mental models, labeling systems, organization schemes, findability

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-loading-patterns

Perceived performance — skeleton screens, progressive loading, optimistic rendering, shimmer effects, content-first loading, perceived vs actual speed

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-material-design-3

Google Material You design language covering dynamic color, tonal palettes, elevation with tonal surface color, shape theming, and motion choreography

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-micro-interactions

Small moments that delight — trigger, rules, feedback, loops/modes (Dan Saffer's framework), when micro-interactions aid usability vs decoration

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-motion-principles

Purposeful animation — Disney's 12 principles adapted for UI, easing curves, duration guidelines, choreography, motion as feedback vs decoration, reducing motion

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-naming-conventions

Design system nomenclature for semantic and descriptive names, color naming, size naming, and cross-discipline vocabulary

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-navigation-ux

Wayfinding — navigation models (hub-spoke, hierarchy, flat, content-driven), persistent vs contextual nav, breadcrumbs, information scent

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-palette-construction

Building functional palettes — primary/secondary/accent, neutral scales, semantic colors, tint/shade generation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-parallax-scroll

Scroll-driven depth — rate-differential parallax, scroll-triggered reveals, sticky sections, scroll narrative, performance constraints, motion sensitivity

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-readability

Optimizing for reading — line length, leading, paragraph spacing, alignment, F-pattern/Z-pattern

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-responsive-strategy

Responsive as design decision — content priority, progressive disclosure, design-first breakpoints

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-responsive-type

Type across viewports — fluid typography (clamp), viewport scaling, minimum sizes, maintaining hierarchy

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-state-design

UI state inventory — empty, loading, partial, error, success, offline, disabled, read-only, and how each state communicates system status

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-token-architecture

Token taxonomy covering primitive, semantic, and component tokens with naming conventions, aliasing, and theme switching

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-transitions-timing

Temporal design — enter/exit asymmetry, stagger patterns, easing functions (ease-out for enter, ease-in for exit), duration by element size, interruptibility

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-type-scale

Mathematical type scales — modular, major third, perfect fourth, golden ratio, custom scales

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-typographic-hierarchy

Reading order through type — size, weight, color, spacing, case, and position as hierarchy signals

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-typography-fundamentals

Anatomy of type — x-height, ascenders, counters, serifs, stroke contrast, optical sizing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-visual-hierarchy

Directing attention — size, color, contrast, position, isolation, motion as hierarchy tools

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-web-fonts

Font loading strategy — performance vs. FOUT/FOIT, variable fonts, subsetting, system font stacks

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### design-whitespace

Space as design element — macro vs. micro, breathing room, density control, whitespace as luxury signal

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### drizzle-filtering-pattern

Filter Drizzle queries with eq(), and(), or(), between(), sql template tag, and custom conditions

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### drizzle-migrations

Manage Drizzle schema evolution with drizzle-kit generate/push/migrate and introspect

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### drizzle-performance-patterns

Optimize Drizzle queries with prepared statements, db.batch(), explain analysis, and join-based N+1 avoidance

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### drizzle-query-builder

Compose type-safe SQL with Drizzle's fluent query builder for select, insert, update, and delete

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### drizzle-raw-sql

Execute raw SQL safely in Drizzle with the sql template tag, db.execute(), and placeholder()

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### drizzle-relations-pattern

Define Drizzle relations with relations(), one(), many(), references(), and inferred types

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### drizzle-schema-definition

Define Drizzle ORM schemas with pgTable/mysqlTable/sqliteTable, column types, indexes, and constraints

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### drizzle-transactions

Execute atomic Drizzle operations with db.transaction(), nested transactions, and rollback semantics

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### drizzle-with-nextjs

Integrate Drizzle with Next.js using Neon/Vercel Postgres, edge runtime, and connection pooling

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### events-event-schema

Define and evolve event schemas using a schema registry with Avro, Protobuf, or JSON Schema

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### events-event-storming

Run event storming workshops to discover domain events, commands, and bounded contexts

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### events-idempotency

Handle duplicate message delivery safely using idempotency keys and deduplication stores

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### events-kafka-patterns

Produce and consume Kafka messages with partitioning, consumer groups, and offset management

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### events-message-queue

Use message queues for reliable async delivery with competing consumers and dead letter queues

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### events-outbox-pattern

Reliably publish domain events using the transactional outbox and CDC polling approach

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### events-pubsub-pattern

Implement publisher-subscriber communication with topic-based routing and fan-out delivery

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### events-redis-pubsub

Use Redis pub/sub channels and keyspace notifications for lightweight real-time messaging

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### events-saga-choreography

Coordinate distributed workflows through event chains and compensation events without an orchestrator

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### events-sse-pattern

Stream one-way server events to browsers using Server-Sent Events and EventSource

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### events-webhooks-pattern

Implement reliable webhook delivery with retry backoff, signature verification, and queuing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### events-websocket-pattern

Implement bidirectional real-time communication using WebSocket protocol and Socket.io

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-abstract-factory

Create families of related objects through factory interfaces without coupling to concrete types

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-adapter-pattern

Wrap incompatible interfaces to make them work together without modifying source code

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-bridge-pattern

Separate abstraction from implementation to allow them to vary independently

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-builder-pattern

Construct complex objects step-by-step using fluent builders and director classes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-chain-of-responsibility

Pass requests along a handler chain with short-circuit and async chain support

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-command-pattern

Encapsulate operations as command objects to support undo, redo, and command queuing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-composite-pattern

Compose objects into tree structures and treat individual and composite objects uniformly

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-decorator-pattern

Attach additional behavior to objects at runtime by wrapping them in decorator objects

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-facade-pattern

Provide a simplified interface to a complex subsystem to reduce coupling for clients

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-factory-method

Define a factory interface that subclasses use to decide which object to instantiate

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-flyweight-pattern

Share fine-grained objects to reduce memory usage by separating intrinsic and extrinsic state

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-iterator-pattern

Traverse collections with Symbol.iterator and generators for lazy, composable sequences

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-mediator-pattern

Decouple components by routing communication through a central mediator or event bus

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-memento-pattern

Capture and restore object state using mementos for undo history and time-travel

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-null-object

Eliminate null checks by providing default no-op implementations of interfaces

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-observer-pattern

Implement push-based notification between Subject and Observer with typed subscriptions

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-prototype-pattern

Clone objects using prototype registry and structured clone for deep copy scenarios

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-proxy-pattern

Control access to an object using virtual, protection, logging, and caching proxy patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-singleton

Ensure a class has exactly one instance using module-level singletons and WeakRef patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-state-pattern

Replace conditional logic with state objects that delegate behavior to the current state

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-strategy-pattern

Encapsulate interchangeable algorithms behind a common interface for runtime selection

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-template-method

Define an algorithm skeleton in a base class with abstract steps filled by subclasses

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### gof-visitor-pattern

Add operations to object structures without modifying them using double dispatch

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### graphql-apollo-server

Configure and run Apollo Server with plugins, context, and data sources

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### graphql-auth-patterns

Implement authentication and authorization in GraphQL with directives, middleware, and field-level guards

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### graphql-client-patterns

Structure GraphQL client code with fragments, cache policies, and optimistic updates

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### graphql-codegen-pattern

Generate type-safe code from GraphQL schemas and operations using GraphQL Code Generator

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### graphql-dataloader-pattern

Batch and cache data fetches to eliminate N+1 queries in GraphQL resolvers

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### graphql-error-handling

Handle errors in GraphQL with structured error types, union results, and formatError

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### graphql-federation-pattern

Compose a unified GraphQL API from independently deployed subgraph services

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### graphql-pagination-patterns

Implement cursor-based and offset pagination in GraphQL using the connection spec

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### graphql-performance-patterns

Optimize GraphQL API performance with query complexity limits, caching, and persisted queries

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### graphql-resolver-pattern

Implement resolvers with clean separation between data fetching and business logic

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### graphql-schema-design

Design expressive, evolvable GraphQL schemas with clear type hierarchies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### graphql-subscriptions

Implement real-time data streaming with GraphQL subscriptions over WebSocket

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### harness-accessibility

WCAG accessibility scanning, contrast checking, ARIA validation, and remediation

- **Triggers:** manual, on_new_feature, on_project_init
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier
- **Depends on:** harness-design-system

### harness-api-design

REST, GraphQL, gRPC API design with OpenAPI specs and versioning strategies

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-auth

OAuth2, JWT, RBAC/ABAC, session management, and MFA patterns

- **Triggers:** manual, on_new_feature, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-caching

Cache strategies, invalidation patterns, and distributed caching

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-chaos

Chaos engineering, fault injection, and resilience validation

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** adversarial-reviewer

### harness-compliance

SOC2, HIPAA, GDPR compliance checks, audit trails, and regulatory checklists

- **Triggers:** manual, on_milestone, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-containerization

Dockerfile review, Kubernetes manifests, container registry management

- **Triggers:** manual, on_pr, on_commit
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-data-pipeline

ETL/ELT patterns, data quality checks, pipeline testing, and data workflow management

- **Triggers:** manual, on_pr, on_commit
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-data-validation

Schema validation, data contracts, and pipeline data quality

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-database

Schema design, migrations, ORM patterns, and migration safety checks

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-deployment

CI/CD pipelines, blue-green, canary, and environment management

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-design

Aesthetic direction workflow, anti-pattern enforcement, DESIGN.md generation, and strictness configuration

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** advisory-guide
- **Depends on:** harness-design-system

### harness-design-mobile

Token-bound mobile component generation with React Native, SwiftUI, Flutter, and Compose patterns and platform-specific design rules

- **Triggers:** manual, on_new_feature, on_commit
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer
- **Depends on:** harness-design-system, harness-design

### harness-design-system

Design token generation, palette selection, typography, spacing, and design intent management

- **Triggers:** manual, on_new_feature, on_project_init
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** constructive-architect

### harness-design-web

Token-bound web component generation with Tailwind/CSS, React/Vue/Svelte patterns, and design constraint verification

- **Triggers:** manual, on_new_feature, on_commit
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer
- **Depends on:** harness-design-system, harness-design

### harness-diagnostics

Classify errors into taxonomy categories and route to resolution strategies

- **Triggers:** manual, on_bug_fix
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** diagnostic-investigator

### harness-dx

Developer experience auditing — README quality, API documentation, getting-started guides, and example validation

- **Triggers:** manual, on_milestone, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-e2e

End-to-end testing with Playwright, Cypress, and Selenium including page objects and flakiness remediation

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer

### harness-event-driven

Message queues, event sourcing, CQRS, and saga patterns

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** constructive-architect

### harness-feature-flags

Flag lifecycle management, A/B testing infrastructure, and gradual rollouts

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-git-workflow

Git workflow best practices integrated with harness validation

- **Triggers:** manual, on_pr, on_commit
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** meticulous-verifier

### harness-i18n

Internationalization scanning — detect hardcoded strings, missing translations, locale-sensitive formatting, RTL issues, and generate actionable reports across web, mobile, and backend

- **Triggers:** manual, on_pr, on_commit, on_review
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-i18n-process

Upstream i18n process injection — inject internationalization considerations into brainstorming, planning, and review workflows with adaptive prompt-mode or gate-mode enforcement

- **Triggers:** on_new_feature, on_review
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** advisory-guide

### harness-i18n-workflow

Translation lifecycle management — configuration, scaffolding, string extraction, coverage tracking, pseudo-localization, and retrofit for existing projects

- **Triggers:** manual, on_project_init
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** constructive-architect
- **Depends on:** harness-i18n

### harness-incident-response

Runbook generation, postmortem analysis, and SLO/SLA tracking

- **Triggers:** manual, on_bug_fix
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** diagnostic-investigator

### harness-infrastructure-as-code

Terraform, CloudFormation, Pulumi patterns and IaC best practices

- **Triggers:** manual, on_new_feature, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-integration-test

Service boundary testing, API integration testing, and consumer-driven contract validation

- **Triggers:** manual, on_new_feature, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-knowledge-mapper

Auto-generate always-current knowledge maps from graph topology

- **Triggers:** manual, on_commit, on_milestone
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** constructive-architect

### harness-load-testing

Stress testing, capacity planning, and performance benchmarking with k6/Artillery/Gatling

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-ml-ops

Model serving patterns, experiment tracking, prompt evaluation, and ML pipeline management

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-mobile-patterns

Mobile platform lifecycle, permissions, deep linking, push notifications, and app store submission

- **Triggers:** manual, on_new_feature, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-mutation-test

Test quality validation through mutation testing with Stryker and mutation scoring

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** adversarial-reviewer

### harness-observability

Structured logging, metrics, distributed tracing, and alerting strategies

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-parallel-agents

Coordinate multiple agents working in parallel on a harness project

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** constructive-architect

### harness-perf-tdd

Performance-aware TDD with benchmark assertions in the red-green-refactor cycle

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer
- **Depends on:** harness-tdd, harness-perf

### harness-pre-commit-review

Lightweight pre-commit quality gate combining mechanical checks and AI review

- **Triggers:** manual, on_commit
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Depends on:** harness-code-review

### harness-product-spec

User story generation, EARS acceptance criteria, and PRD creation from issues

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** constructive-architect

### harness-property-test

Property-based and generative testing with fast-check, hypothesis, and automatic shrinking

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** constructive-architect

### harness-resilience

Circuit breakers, rate limiting, bulkheads, retry patterns, and fault tolerance

- **Triggers:** manual, on_new_feature, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-secrets

Vault integration, credential rotation, and environment variable hygiene

- **Triggers:** manual, on_pr, on_commit
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-security-review

Deep security audit with OWASP baseline and stack-adaptive analysis

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer

### harness-sql-review

SQL query optimization, index analysis, N+1 detection, and query plan review

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** adversarial-reviewer

### harness-state-management

Manage persistent session state across harness agent sessions

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** meticulous-implementer

### harness-test-data

Test factories, fixtures, database seeding, and test data isolation

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-ux-copy

Microcopy auditing, error message quality, voice/tone guides, and UI string consistency

- **Triggers:** manual, on_pr, on_review
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-visual-regression

Screenshot comparison, visual diff detection, and baseline management

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### js-abstract-factory-pattern

Create families of related objects without specifying their concrete classes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-adapter-pattern

Convert the interface of a class into another interface that clients expect

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-bridge-pattern

Decouple abstraction from implementation so both can vary independently

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-chain-of-responsibility-pattern

Pass a request along a chain of handlers until one handles it

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-command-pattern

Encapsulate operations as objects to support undo, queue, and logging

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-composite-pattern

Compose objects into tree structures and treat individual objects and composites uniformly

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-constructor-pattern

Use constructor functions or classes to create and initialize objects

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-decorator-pattern

Extend object behavior dynamically without modifying its source

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-dynamic-import

Load ES modules on demand with import() to reduce initial bundle size and enable code splitting

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-facade-pattern

Provide a simplified interface to a complex subsystem

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-factory-pattern

Create objects via a factory function without specifying the exact class

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-flyweight-pattern

Share common state across many fine-grained objects to reduce memory usage

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-iterator-pattern

Traverse a collection sequentially without exposing its internal structure

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-mediator-middleware-pattern

Route component interactions through a central mediator to reduce coupling

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-mixin-pattern

Add reusable behaviors to classes without deep inheritance chains

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-module-pattern

Encapsulate private state and expose a public API using closures or ES modules

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-observer-pattern

Notify subscribers automatically when an observable object's state changes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-prototype-pattern

Share properties and methods across instances via the prototype chain

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-provider-pattern

Make shared data available to multiple child components without prop-drilling

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-proxy-pattern

Intercept and control object property access with ES6 Proxy

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-revealing-module-pattern

Define all logic privately and selectively expose only the public API

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-singleton-pattern

Ensure a class has only one instance and provide a global access point

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-state-pattern

Allow an object to alter its behavior when its internal state changes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-static-import

Use static import declarations to load ES modules at parse time for tree-shaking and static analysis

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-strategy-pattern

Define a family of algorithms and make them interchangeable without altering the client

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-template-method-pattern

Define the skeleton of an algorithm in a base class and let subclasses override specific steps

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### js-visitor-pattern

Add new operations to object structures without modifying the objects

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### microservices-api-gateway

Route, aggregate, and secure client requests through an API gateway or BFF pattern

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### microservices-bulkhead-pattern

Isolate failures with bulkheads using thread pools and semaphores to protect shared resources

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### microservices-circuit-breaker

Prevent cascading failures with circuit breaker, half-open state, and fallback logic

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### microservices-config-server

Centralize configuration, feature flags, and secrets management across services

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### microservices-cqrs-pattern

Separate read and write models to optimize query and command performance independently

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### microservices-decomposition

Design service boundaries using bounded contexts, DDD, and functional cohesion principles

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### microservices-distributed-tracing

Propagate trace context and emit spans across services using OpenTelemetry

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### microservices-event-sourcing

Store state as an immutable sequence of events with projections, snapshots, and replay

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### microservices-health-check

Implement /health and /ready endpoints for liveness and readiness probes in containers

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### microservices-outbox-pattern

Guarantee at-least-once event delivery using a transactional outbox and polling publisher

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### microservices-saga-pattern

Coordinate distributed transactions using choreography and orchestration sagas with compensation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### microservices-service-discovery

Implement service registration and dynamic discovery with health checks in microservices

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### microservices-sidecar-pattern

Inject cross-cutting concerns like observability and security via a sidecar proxy

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### microservices-strangler-fig

Migrate monoliths incrementally using the strangler fig pattern with facade routing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### mobile-animation-patterns

Create fluid 60fps animations with React Native Reanimated and shared values

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### mobile-deployment-patterns

Deploy React Native apps with EAS Build, EAS Submit, OTA updates, and CI/CD pipelines

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### mobile-expo-setup

Set up and configure Expo projects with managed workflow, EAS Build, and development builds

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### mobile-flatlist-patterns

Build performant scrollable lists with FlatList, SectionList, and FlashList

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### mobile-gesture-handling

Implement touch gestures with React Native Gesture Handler for swipe, pan, pinch, and long press

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### mobile-native-modules

Bridge native platform APIs into React Native with Expo Modules and Turbo Modules

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### mobile-navigation-pattern

Implement stack, tab, and drawer navigation in React Native with type-safe routing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### mobile-network-patterns

Handle network requests, offline support, and connectivity monitoring in React Native

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### mobile-performance-patterns

Optimize React Native app performance with profiling, memoization, and native thread management

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### mobile-push-notifications

Implement push notifications with Expo Notifications, FCM, and APNs

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### mobile-storage-patterns

Persist data on mobile with AsyncStorage, SecureStore, MMKV, and SQLite

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### mobile-testing-patterns

Test React Native apps with Jest, Testing Library, and Detox for unit, integration, and E2E coverage

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-config-module

Manage environment config with ConfigModule.forRoot, ConfigService, and Joi schema validation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-controller-pattern

Define HTTP route handlers with @Controller, method decorators, params, and versioning

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-dependency-injection

Master NestJS DI container with tokens, useClass/useValue/useFactory providers

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-dto-validation

Validate request payloads with class-validator, class-transformer, and DTO patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-event-driven

Build event-driven systems with EventEmitter2, CQRS module, CommandBus, and QueryBus

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-exception-filters

Handle errors globally with @Catch, ExceptionFilter, and custom exception hierarchies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-graphql-integration

Build GraphQL APIs with GraphQLModule, @Resolver, @Query/@Mutation, @ObjectType, and DataLoader

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-guards-pattern

Protect routes with @UseGuards, CanActivate, JWT guards, and role-based access control

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-interceptors-pattern

Transform responses and add cross-cutting behavior with NestInterceptor and CallHandler

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-microservices

Connect services with ClientsModule, @MessagePattern, @EventPattern, and TCP/Redis transport

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-middleware-pattern

Apply NestMiddleware and functional middleware with consumer.forRoutes binding

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-module-pattern

Organize NestJS applications with @Module, imports/exports, global and dynamic modules

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-pipes-pattern

Validate and transform request data with PipeTransform, ValidationPipe, and custom pipes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-service-pattern

Encapsulate business logic in @Injectable services with repository pattern separation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-swagger-integration

Document APIs with @ApiProperty, @ApiOperation, @ApiTags, and DocumentBuilder

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nestjs-testing-patterns

Test NestJS apps with Test.createTestingModule, jest mocks, supertest e2e, and overrideProvider

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-app-router

App Router architecture, layouts, nested routes, and route segments in Next.js 13+

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-auth-patterns

Authentication patterns, session handling, and middleware auth guards in Next.js

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-caching-strategies

fetch cache options, revalidate, cache tags, and unstable_cache patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-data-fetching

Server-side data patterns, avoiding waterfalls, sequential vs parallel fetching

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-deployment-optimization

Bundle analysis, code splitting, dynamic imports, and next/dynamic optimization

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-environment-config

Environment variables, next.config.ts, and server-only module boundaries

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-error-boundaries

error.tsx, global-error.tsx, not-found.tsx, and error recovery patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-image-optimization

next/image component, responsive images, priority loading, and sizes configuration

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-metadata-api

generateMetadata, static and dynamic metadata, Open Graph images

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-middleware-pattern

Edge middleware, matchers, NextRequest/NextResponse for cross-cutting concerns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-monorepo-setup

Next.js in monorepos, shared packages, and Turborepo integration

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-parallel-intercepting-routes

Parallel routes (@folder), intercepting routes ((.)), and modal patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-route-handlers

API routes in App Router using route.ts, HTTP method exports, and request handling

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-server-actions

Server Actions, form mutations, progressive enhancement, and useFormState

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-server-components

React Server Components in Next.js — client/server boundaries, composition, and data access

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-static-generation

SSG, generateStaticParams, ISR, and revalidate strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-streaming-suspense

Streaming SSR, Suspense boundaries, and loading.tsx conventions

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### next-testing-patterns

Component testing with App Router, mocking server components, and MSW integration

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-buffer-encoding

Handle binary data, encodings, and conversions with Node.js Buffer and TextEncoder

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-child-process

Spawn and manage child processes with exec, spawn, fork, and IPC communication

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-crypto-patterns

Implement hashing, HMAC, signing, encryption, and key derivation with Node.js crypto

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-environment-config

Manage environment configuration with process.env, dotenv, and validation for 12-factor apps

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-error-handling

Handle uncaught exceptions, promise rejections, and errors across async Node.js code

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-esm-patterns

Write Node.js ES modules correctly using import.meta.url, package.json type, and CJS interop

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-event-emitter

Use Node.js EventEmitter for typed pub-sub communication with memory leak prevention

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-express-patterns

Structure Express applications with middleware chains, routers, and proper error handling

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-fastify-patterns

Build performant APIs with Fastify using schema validation, plugins, decorators, and hooks

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-http-server

Build low-level HTTP servers with Node.js http module and middleware pattern

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-path-fs-patterns

Perform file system operations correctly using fs.promises, path utilities, and file watching

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-performance-profiling

Profile Node.js applications using --prof, clinic.js, memory snapshots, and event loop lag

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-streams-pattern

Process large data efficiently using Node.js Readable, Writable, and Transform streams

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-testing-patterns

Test Node.js APIs and modules using supertest, nock, and test containers

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### node-worker-threads

Offload CPU-intensive work to worker threads using MessageChannel and shared buffers

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nuxt-auto-imports

Use Nuxt's automatic import system for composables, components, and utils without explicit import statements

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nuxt-composables-pattern

Fetch data and manage async state in Nuxt using useAsyncData, useFetch, useLazyFetch, and useNuxtApp

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nuxt-deployment-config

Configure Nuxt deployment targets with Nitro presets, hybrid rendering, and output modes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nuxt-layouts-pages

Structure Nuxt apps with file-based pages, named layouts, and definePageMeta

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nuxt-middleware-pattern

Guard and transform routes using Nuxt route middleware and server middleware

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nuxt-modules-pattern

Build and configure Nuxt modules using defineNuxtModule, addComponent, and module hooks

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nuxt-plugins-pattern

Extend the Nuxt app instance with plugins using defineNuxtPlugin and provide/inject

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nuxt-seo-metadata

Configure SEO metadata, Open Graph tags, and structured data using useSeoMeta and useHead

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nuxt-server-routes

Build server-side API routes using Nitro's defineEventHandler and H3 utilities

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nuxt-state-management

Manage SSR-safe shared state with useState and Pinia in Nuxt applications

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### nuxt-testing-patterns

Test Nuxt components and pages using @nuxt/test-utils, mountSuspended, and mockNuxtImport

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### otel-context-propagation

Propagate trace context across service boundaries with W3C TraceContext and baggage

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### otel-custom-instrumentation

Add custom spans and attributes to business-critical code paths

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### otel-error-tracking

Track and correlate errors across services with OpenTelemetry span exceptions and status

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### otel-exporter-config

Configure OTLP exporters for traces, metrics, and logs to observability backends

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### otel-logging-pattern

Correlate structured logs with traces using OpenTelemetry log signals

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### otel-metrics-pattern

Record application metrics with OpenTelemetry counters, histograms, and gauges

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### otel-nestjs-integration

Integrate OpenTelemetry with NestJS using decorators and module-based configuration

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### otel-nextjs-integration

Add OpenTelemetry tracing to Next.js with instrumentation hook and edge runtime support

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### otel-performance-insights

Identify performance bottlenecks using trace analysis, histogram metrics, and span timing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### otel-sampling-strategies

Control trace volume with head and tail sampling strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### otel-sdk-setup

Initialize the OpenTelemetry Node.js SDK with providers, exporters, and auto-instrumentation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### otel-tracing-pattern

Instrument distributed traces with OpenTelemetry spans for request flow visibility

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### owasp-auth-patterns

Implement secure authentication with proper session management, JWT best practices, and token rotation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### owasp-cryptography

Apply cryptographic best practices for hashing, encryption, signing, and key management

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### owasp-csrf-protection

Defend state-changing endpoints with CSRF tokens, SameSite cookies, and origin validation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### owasp-dependency-security

Manage third-party dependency risks with auditing, lockfiles, and vulnerability scanning

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### owasp-file-upload-security

Secure file upload endpoints against malicious files, path traversal, and resource exhaustion

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### owasp-idor-prevention

Prevent insecure direct object references by enforcing ownership checks and indirect reference maps

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### owasp-injection-prevention

Prevent SQL, NoSQL, and command injection via parameterized queries and input validation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### owasp-logging-monitoring

Implement security logging and monitoring to detect and respond to threats

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### owasp-rate-limiting

Protect APIs with rate limiting, throttling, and abuse prevention strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### owasp-secrets-management

Manage secrets safely via env vars and secrets managers, never logging or hardcoding credentials

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### owasp-security-headers

Configure HTTP security headers to protect against XSS, clickjacking, MIME sniffing, and data leaks

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### owasp-xss-prevention

Prevent reflected, stored, and DOM-based XSS via CSP headers, output encoding, and input sanitization

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-browser-cache

Browser caching — Cache-Control directives, ETag validation, immutable assets, stale-while-revalidate, and cache partitioning

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-bundle-analysis

Bundle analysis — Bundle visualization, size budgets, dependency cost analysis, and CI-integrated size tracking

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-cache-invalidation

Cache invalidation — TTL strategies, event-driven invalidation, cache stampede prevention, and versioned cache keys

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-cdn-cache-control

CDN cache control — cache keys, Vary header strategies, surrogate control, cache purging, and edge TTL management

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-cdn-strategies

CDN architecture — edge caching, origin shielding, cache tiers, edge compute, and multi-CDN strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-client-side-rendering

Client-side rendering — SPA rendering optimization, skeleton screens, progressive rendering, and virtual DOM performance

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-code-splitting

Code splitting — Route-based, component-based, and vendor splitting with dynamic imports for reduced initial bundle size

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-compression

Content compression — Brotli vs gzip comparison, compression levels, content-encoding negotiation, and static vs dynamic compression

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-connection-costs

Network connection overhead — DNS resolution, TCP handshake, TLS negotiation, connection reuse, and keep-alive strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-connection-pooling

Connection pooling — Pool sizing, connection lifecycle overhead, PgBouncer, serverless pooling, and pool monitoring

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-critical-rendering-path

Browser rendering pipeline — Parse, Style, Layout, Paint, Composite stages and optimization strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-cumulative-layout-shift

CLS measurement — layout shift sources, impact/distance fractions, prevention strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-dom-parsing

HTML parsing — tokenization, tree construction, speculative parsing, parser-blocking scripts

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-edge-rendering

Edge rendering — Edge compute platforms, regional deployment, latency optimization, and edge-specific constraints

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-event-loop

Event loop architecture — task queues, microtask queue, rendering steps, task prioritization

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-font-loading

Font loading — font-display strategies, subsetting, variable fonts, FOIT/FOUT mitigation, and preloading critical fonts

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-garbage-collection

Garbage collection — generational GC, V8 heap architecture, GC pauses, allocation pressure

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-heap-profiling

Heap profiling — Chrome DevTools heap snapshots, allocation tracking, retained vs shallow size

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-http2-multiplexing

HTTP/2 stream multiplexing — concurrent requests, server push, prioritization, and head-of-line blocking mitigation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-http3-quic

HTTP/3 and QUIC protocol — 0-RTT connections, connection migration, stream-level flow control, and UDP-based transport

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-image-formats

Image formats — WebP, AVIF, JPEG XL format selection, quality tuning, and automated conversion pipelines

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-index-strategies

Index strategies — B-tree, hash, GIN, GiST, composite, partial, and covering indexes for query optimization

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-interaction-to-next-paint

INP measurement — input delay, processing time, presentation delay, long task attribution

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-largest-contentful-paint

LCP measurement — root causes, sub-part timing, optimization strategies for the largest visible element

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-layout-reflow

Layout triggers — forced synchronous layouts, layout thrashing, containment strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-lazy-loading

Lazy loading — Intersection Observer patterns, route-based loading, component-level deferral, and progressive hydration

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-lazy-loading-media

Media lazy loading — Native image lazy loading, video poster strategies, placeholder techniques, and progressive image rendering

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-long-tasks

Long task detection — breaking up work, yielding to the main thread, scheduler API, web workers

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-memory-leaks

Memory leak patterns — detached DOM, closures, event listeners, timers, WeakRef strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-module-federation

Module federation — Micro-frontend runtime sharing, remote module loading, shared dependency management, and version negotiation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-n-plus-one

N+1 query detection — Identifying N+1 patterns, eager loading, DataLoader batching, and ORM-specific solutions

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-paint-compositing

Paint layers and compositor — GPU compositing, will-change, layer promotion, paint complexity

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-performance-api

Performance Observer and timing APIs — PerformanceEntry types, User Timing, Resource Timing, Navigation Timing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-profiling-methodology

Systematic profiling workflow — bottleneck identification, measurement discipline, before/after methodology

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-query-optimization

Query optimization — EXPLAIN analysis, query plans, index usage, optimizer hints, and slow query diagnosis

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-resource-hints

Resource hints — preload, prefetch, preconnect, dns-prefetch, modulepreload, and fetchpriority for optimal resource loading

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-responsive-images

Responsive images — srcset, sizes, picture element, art direction, and device-appropriate image delivery

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-server-side-caching

Server-side caching — Redis, Memcached, application-level caching patterns, cache-aside, write-through, and read-through strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-server-side-rendering

Server-side rendering — SSR performance trade-offs, hydration cost, streaming SSR, and selective hydration strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-service-worker-caching

Service Worker caching — Lifecycle management, caching strategies, offline support, background sync, and Workbox patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-static-generation

Static generation — Build-time rendering, incremental static regeneration, on-demand revalidation, and hybrid rendering strategies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-streaming-rendering

Streaming rendering — React Suspense streaming, chunked transfer encoding, out-of-order streaming, and progressive page delivery

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-style-calculation

CSS selector matching — specificity costs, style recalculation triggers, selector performance

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-svg-optimization

SVG optimization — Minification, inline vs external strategies, sprite sheets, accessibility, and rendering performance

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-tree-shaking

Tree shaking — Dead code elimination, side-effect configuration, ESM requirements, and module-level optimization

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### perf-web-workers

Web Workers — Dedicated workers, SharedWorker, Comlink RPC, SharedArrayBuffer, and off-main-thread computation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### prisma-client-queries

Query data with Prisma Client findUnique/findMany, create/update/delete, upsert, select, include

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### prisma-filtering-sorting

Filter and sort Prisma queries with where, AND/OR/NOT, orderBy, and cursor/offset pagination

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### prisma-migrations

Manage database schema evolution with prisma migrate dev/deploy/reset and migration history

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### prisma-performance-patterns

Optimize Prisma queries with select, findUnique index hits, batching, and avoiding N+1

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### prisma-raw-queries

Execute type-safe raw SQL with $queryRaw, $executeRaw, and Prisma.sql template tag

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### prisma-relations-pattern

Model one-to-one, one-to-many, many-to-many, and self-relations with @relation in Prisma

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### prisma-schema-design

Design Prisma schemas with datasource, generator, models, field types, and field attributes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### prisma-seeding-pattern

Seed databases idempotently with prisma/seed.ts, --seed flag, and environment branching

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### prisma-soft-delete

Implement soft deletes in Prisma with middleware or $extends query extensions and deletedAt pattern

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### prisma-transactions

Execute atomic operations with Prisma $transaction, interactive transactions, and nested writes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### prisma-type-generation

Use generated Prisma types like XxxCreateInput, XxxWhereInput, $Enums, and validator utilities

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-2026

Modern React patterns for 2025-2026 including React 19, Compiler, and AI-integrated UI

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-client-rendering

Render React entirely in the browser for highly interactive single-page applications

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-compound-pattern

Build multi-part components that share state implicitly via context

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-concurrent-ui

Build responsive UIs using React 18 concurrent features and transitions

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-container-presentational

Separate data-fetching containers from stateless presentational components

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-context-pattern

Share state across the component tree without prop drilling using React Context

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-dynamic-import

Load modules on demand to reduce initial bundle size and improve startup performance

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-hoc-pattern

Extend component behavior by wrapping in a higher-order component

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-hooks-pattern

Reuse stateful logic across components via custom hooks

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-islands-pattern

Hydrate only interactive UI islands, leaving static content as HTML

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-memoization-pattern

Prevent expensive re-renders and recomputations with React memoization APIs

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-progressive-hydration

Delay hydration of below-fold or non-critical components to improve TTI

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-provider-pattern

Make data available to any component in the tree without prop drilling

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-render-props-pattern

Share stateful logic by passing a render function as a prop

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-server-components

Run components on the server to eliminate client JavaScript and enable direct data access

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-server-rendering

Pre-render React components on the server for improved SEO and initial load performance

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-state-management-pattern

Choose the right state management approach for your React application scale

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-static-import

Bundle all dependencies at build time for predictable loading performance

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### react-suspense-pattern

Declaratively handle async loading states with React Suspense boundaries

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### redux-entity-adapter

Normalize collections with createEntityAdapter for efficient CRUD on entity state

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### redux-listener-middleware

React to dispatched actions with createListenerMiddleware for side effects

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### redux-persistence-pattern

Persist and rehydrate Redux state across sessions with redux-persist or manual storage

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### redux-rtk-optimistic

Implement optimistic updates and pessimistic updates with RTK Query cache

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### redux-rtk-query-endpoints

Define query and mutation endpoints with cache tags and transformations

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### redux-rtk-query-setup

Configure RTK Query API service with createApi and fetchBaseQuery

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### redux-selectors-pattern

Derive and memoize state with createSelector for efficient re-renders

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### redux-slice-pattern

Structure Redux state with createSlice for reducers, actions, and initial state

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### redux-store-setup

Configure the Redux store with configureStore, middleware, and dev tools

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### redux-testing-patterns

Test Redux slices, thunks, selectors, and connected components effectively

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### redux-thunk-pattern

Handle async operations with createAsyncThunk for data fetching and side effects

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### redux-typescript-patterns

Type Redux state, actions, thunks, and hooks with full TypeScript inference

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### resilience-bulkhead-pattern

Isolate failures with bulkheads to limit blast radius of failing components

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### resilience-chaos-testing

Validate resilience by injecting controlled failures with chaos engineering techniques

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### resilience-circuit-breaker

Protect services from cascading failures with the circuit breaker pattern

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### resilience-dead-letter

Handle permanently failing messages with dead letter queues for inspection and reprocessing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### resilience-fallback-pattern

Provide degraded but functional responses when primary operations fail

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### resilience-health-checks

Implement health check endpoints for service readiness and liveness monitoring

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### resilience-idempotency

Ensure safe retries with idempotency keys and at-least-once delivery guarantees

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### resilience-rate-limiting

Control request throughput with rate limiting using token bucket and sliding window algorithms

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### resilience-retry-pattern

Handle transient failures with configurable retry strategies and backoff

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### resilience-timeout-pattern

Prevent resource exhaustion with request timeouts and AbortController

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-abac-design

Attribute-based access control -- policy engines, XACML concepts, attribute evaluation, and when ABAC is the right model over RBAC

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-asymmetric-encryption

RSA, elliptic curve cryptography (ECDSA, Ed25519, X25519), key exchange (ECDHE), and when to use asymmetric vs symmetric encryption

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-attack-trees

Attack tree construction and analysis -- modeling multi-step adversary strategies as goal-oriented tree decompositions for prioritizing defenses

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-audit-log-design

Security audit log design -- what to log, structured event format, tamper evidence, retention, and the balance between observability and privacy

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-authentication-flows

Secure design of login, registration, password reset, magic link, and SSO authentication flows -- preventing account enumeration, credential theft, and session fixation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-capability-based-security

Object capabilities vs ambient authority -- unforgeable tokens that grant specific rights, eliminating confused deputy attacks by construction

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-certificate-management

CA hierarchy, certificate pinning, Certificate Transparency, ACME/Let's Encrypt, and the lifecycle of X.509 certificates from issuance to revocation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-ci-security-testing

SAST, DAST, SCA, and secrets scanning in CI/CD pipelines -- automated security testing that runs on every commit

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-code-signing

Artifact signing, verification pipelines, Sigstore keyless signing, and ensuring that deployed software was built by trusted parties

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-compliance-logging

SOC2, GDPR, HIPAA, and PCI-DSS logging requirements -- what to log, how long to retain it, and how to prove compliance through audit trails

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-credential-storage

Password hashing with Argon2id, bcrypt, and scrypt -- salting, peppering, adaptive cost, and upgrade strategies for legacy hashes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-cryptographic-randomness

Cryptographically secure random number generation -- CSPRNG, entropy sources, nonce generation, and why Math.random() will get you breached

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-dependency-auditing

Vulnerability scanning, lockfile integrity, update strategies, and managing the security risk of third-party dependencies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-deserialization-attacks

Insecure deserialization vulnerabilities -- gadget chains, object injection, and why accepting serialized objects from untrusted sources is inherently dangerous

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-environment-variable-risks

Why environment variables leak secrets and safer alternatives -- process listings, crash dumps, child processes, logging, and the 12-factor app's blind spot

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-forensics-fundamentals

Digital forensics for developers -- log analysis, artifact collection, timeline reconstruction, and maintaining chain of custody for evidence

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-hashing-fundamentals

Cryptographic hash functions (SHA-256, SHA-3, BLAKE3), collision resistance, preimage resistance, and correct use cases for hashing vs encryption vs MAC

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-hmac-signatures

HMAC for message authentication and digital signatures for non-repudiation -- when to use which, how they fail, and implementation pitfalls

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-hsts-preloading

HTTP Strict Transport Security and preload lists -- eliminating the first-request HTTP downgrade window and ensuring browsers never connect over plaintext

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-identity-verification

Continuous authentication and device trust -- verifying identity beyond the initial login using behavioral signals, device posture, and risk-adaptive challenges

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-incident-containment

Incident triage, isolation strategies, evidence preservation, and the first 60 minutes of a security incident -- what to do and what not to touch

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-injection-families

Unified mental model for injection vulnerabilities -- SQL, command, LDAP, XSS, template, header -- all share the same root cause of mixing code and data

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-log-correlation

SIEM architecture, correlation rules, alert fatigue management, and turning raw logs into actionable security intelligence

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-memory-safety

Memory safety vulnerabilities -- buffer overflows, use-after-free, double-free -- and mitigation through safe languages, bounds checking, and memory-safe abstractions

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-mfa-design

Multi-factor authentication design -- TOTP, WebAuthn/passkeys, SMS risks, recovery flows, and step-up authentication for sensitive operations

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-microsegmentation

Network and application-level segmentation -- isolating workloads so that compromising one service does not grant lateral movement to others

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-mtls-design

Mutual TLS for service-to-service authentication -- both sides present certificates, eliminating the need for shared secrets or API keys between services

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-penetration-testing

Penetration test scoping, methodology, rules of engagement, and remediation workflows -- maximizing the value of offensive security assessments

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-post-incident-review

Blameless post-incident reviews for security incidents -- structured analysis, root cause identification, remediation tracking, and organizational learning

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-race-conditions

TOCTOU vulnerabilities, double-spend attacks, file system races, and the security implications of non-atomic operations in concurrent systems

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-rbac-design

Role-based access control modeling -- role hierarchies, permission granularity, role explosion prevention, and the principle of least privilege

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-rebac-design

Relationship-based access control using the Zanzibar model -- modeling authorization as a graph of relationships between subjects and resources

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-sbom-provenance

Software bill of materials, SLSA framework, and build provenance -- proving what went into your software and how it was built

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-secrets-lifecycle

Secret rotation, distribution, revocation, and the principle that secrets must be ephemeral, auditable, and never embedded in code

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-security-champions

Embedding security expertise in development teams through security champion programs -- scaling security knowledge without scaling the security team

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-session-management

Session lifecycle design -- token generation, fixation prevention, binding, idle and absolute timeouts, revocation, and secure cookie configuration

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-shift-left-design

Integrating threat modeling and security analysis into the design phase -- finding security flaws when they cost $1 to fix instead of $100 in production

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-symmetric-encryption

AES and ChaCha20 symmetric ciphers, modes of operation (GCM vs CBC vs CTR), key sizes, IV/nonce management, and authenticated encryption

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-threat-modeling-process

End-to-end threat modeling process -- from scoping and DFD construction through threat enumeration, risk rating, and mitigation tracking

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-threat-modeling-stride

STRIDE methodology for systematic threat identification across spoofing, tampering, repudiation, information disclosure, denial of service, and elevation of privilege

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-tls-fundamentals

TLS 1.3 handshake, cipher suite selection, certificate chain validation, and why TLS 1.0/1.1 must be disabled

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-trust-boundaries

Trust boundary identification, data flow diagrams, and the principle that all security controls concentrate at boundary crossings

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-vault-patterns

Centralized secrets management using vault systems -- HashiCorp Vault, cloud KMS, sealed secrets, dynamic credentials, and the principle of secrets as cattle not pets

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-vulnerability-disclosure

Responsible disclosure, CVE process, coordinated vulnerability disclosure, and managing the lifecycle from discovery to public advisory

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### security-zero-trust-principles

Zero trust architecture principles -- never trust, always verify, least privilege, assume breach, and continuous verification regardless of network position

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### state-context-pattern

Manage shared state with React Context and useReducer for prop-drilling avoidance

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### state-jotai-atoms

Build bottom-up atomic state with Jotai atoms for granular React state management

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### state-selection-patterns

Select and derive state efficiently across stores to minimize component re-renders

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### state-server-client-sync

Synchronize server state with client state using React Query patterns and cache coordination

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### state-zustand-devtools

Debug Zustand stores with Redux DevTools integration via the devtools middleware

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### state-zustand-immer

Write mutable-style updates in Zustand stores with the Immer middleware

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### state-zustand-persist

Persist Zustand store to localStorage or custom storage with the persist middleware

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### state-zustand-react

Optimize Zustand re-renders with selectors, shallow comparison, and subscription patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### state-zustand-slices

Split large Zustand stores into composable slices for modular state

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### state-zustand-store

Create lightweight global stores with Zustand's create function

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### svelte-adapter-config

Configure SvelteKit deployment adapters for Node, Vercel, Cloudflare, and static hosting

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### svelte-component-composition

Compose Svelte 5 components with snippets, {@render}, children, and named content slots

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### svelte-error-pages

Handle expected and unexpected errors in SvelteKit using +error.svelte, error(), and handleError hooks

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### svelte-form-actions

Handle form submissions with SvelteKit actions, use:enhance, fail(), redirect(), and progressive enhancement

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### svelte-load-functions

Fetch and stream data for SvelteKit pages using load(), server load, universal load, and depends()

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### svelte-performance-patterns

Optimize SvelteKit performance with code splitting, preloading, virtualization, and lazy loading

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### svelte-routing-pattern

Structure SvelteKit applications with file-based routing, +page.svelte, +layout.svelte, and route params

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### svelte-runes-pattern

Write reactive Svelte 5 components using $state, $derived, $effect, $props, and $bindable

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### svelte-server-hooks

Intercept requests and handle errors in SvelteKit using hooks.server.ts with handle, handleFetch, handleError, and sequence

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### svelte-state-management

Manage local, shared, and cross-component state in SvelteKit using runes, context API, and module-level state

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### svelte-stores-pattern

Share reactive state across components with Svelte writable, readable, derived stores, and custom store contracts

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### svelte-testing-patterns

Test Svelte components and SvelteKit routes using Vitest, @testing-library/svelte, render, and fireEvent

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### svelte-transitions-animations

Animate Svelte elements with built-in transitions (fade/fly/slide), custom transitions, and motion directives

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### tanstack-cache-management

queryClient.setQueryData, cancelQueries, removeQueries, and observer patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### tanstack-dependent-queries

enabled flag, query dependencies, chaining, and parallel vs sequential queries

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### tanstack-devtools

@tanstack/react-query-devtools, cache panel, network inspector, and debugging

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### tanstack-infinite-queries

useInfiniteQuery, getNextPageParam, cursor pagination, and flattening pages

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### tanstack-mutation-patterns

useMutation, variables, onSuccess/onError/onSettled, and retry configuration

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### tanstack-optimistic-updates

Optimistic mutations, onMutate, rollback on error, and cache snapshot patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### tanstack-prefetching

prefetchQuery, dehydrate/hydrate, SSR with Next.js, and router-level prefetch

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### tanstack-query-invalidation

invalidateQueries, refetchType, staleTime, and gcTime tuning

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### tanstack-query-keys

Query key factories, key hierarchies, colocated keys, and invalidation scope

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### tanstack-suspense-mode

useSuspenseQuery, error boundaries, streaming, and React 18 integration

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-accessibility-testing

Automate WCAG accessibility checks using axe-core with Playwright and jest-axe

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-component-react

Test React components with Testing Library using user-centric queries and async utilities

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-component-svelte

Test Svelte components with Testing Library using render, fireEvent, and waitFor

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-contract-testing

Verify service compatibility using Pact consumer-provider contract tests

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-coverage-patterns

Configure and interpret test coverage thresholds for meaningful quality signals

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-e2e-strategy

Choose the right test layer (unit/integration/E2E) and prevent flaky tests in CI

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-factory-patterns

Build maintainable test data using factory functions, builders, and faker.js

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-integration-patterns

Write integration tests that exercise real dependencies using test databases and containers

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-mock-patterns

Mock modules, functions, and timers in Vitest and Jest to isolate units under test

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-msw-pattern

Intercept HTTP requests in tests using Mock Service Worker handlers at the network level

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-performance-testing

Measure and assert on code performance using vitest bench and timing budgets

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-playwright-patterns

Write maintainable Playwright tests using page objects, fixtures, and parallel execution

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-playwright-setup

Configure Playwright test runner with fixtures, reporters, and browser contexts

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-property-based

Generate exhaustive test cases automatically using fast-check property-based testing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-snapshot-patterns

Use snapshot testing selectively for stable outputs, knowing when to avoid it

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-tdd-workflow

Drive design through tests using red-green-refactor cycle and test-first discipline

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-unit-patterns

Write focused, isolated unit tests using AAA pattern with describe/it/expect

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### test-vitest-config

Configure Vitest with workspaces, environments, coverage, and TypeScript integration

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### trpc-context-pattern

createTRPCContext, request context, database injection, and session access

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### trpc-error-handling

TRPCError, error codes (UNAUTHORIZED, NOT_FOUND), and custom error formatters

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### trpc-input-validation

Zod integration, input/output schemas, .input()/.output(), and transformers

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### trpc-middleware-pattern

tRPC middleware, t.middleware, context enrichment, and auth guards

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### trpc-nextjs-integration

App Router integration, createCaller, server-side caller, and RSC patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### trpc-react-query-integration

api.xxx.useQuery, useMutation, type inference end-to-end with TanStack Query

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### trpc-router-composition

Router merging, nested routers, procedure organization, and createTRPCRouter

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### trpc-subscription-pattern

WebSocket subscriptions, observable, on, and asyncGenerator patterns in tRPC

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-async-patterns

Type async/await, Promise chains, and concurrent patterns correctly in TypeScript

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-branded-types

Prevent mixing semantically distinct primitives using branded opaque types

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-class-patterns

Use abstract classes, private fields, access modifiers, and implements vs extends correctly

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-conditional-types

Use conditional types, infer, and distributive logic to derive types programmatically

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-config-patterns

Configure tsconfig with extends, project references, composite builds, and incremental compilation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-declaration-merging

Extend existing types, modules, and namespaces via declaration merging and augmentation

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-decorator-patterns

Implement class, method, and property decorators with reflect-metadata in TypeScript

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-discriminated-unions

Model mutually exclusive states with discriminated unions and exhaustive narrowing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-error-handling-types

Model and type errors explicitly using Result types, discriminated unions, and typed throws

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-generics-pattern

Write reusable, type-safe functions and interfaces using TypeScript generics

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-mapped-types

Transform object types by iterating over their keys with mapped type syntax

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-module-patterns

Organize TypeScript code with ES modules, barrel exports, path aliases, and declaration files

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-performance-patterns

Reduce TypeScript compilation time and type complexity with targeted optimizations

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-satisfies-operator

Validate objects against a type without widening using the satisfies keyword

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-strict-mode

Enable and satisfy strict TypeScript checks including strictNullChecks and exactOptionalPropertyTypes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-template-literal-types

Construct precise string types using template literal syntax and string manipulation types

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-testing-types

Test TypeScript types at compile time using expect-type, tsd, and vitest type matchers

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-type-guards

Narrow union types safely using type guards, assertion functions, and control flow

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-utility-types

Apply built-in TypeScript utility types to transform and compose types without redundancy

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ts-zod-integration

Use Zod schemas as the single source of truth for runtime validation and TypeScript types

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-active-voice

Active voice in UI writing — active vs passive voice, when passive is acceptable, verb-first patterns for buttons and actions

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-button-cta-copy

Button and CTA copy — verb-noun pattern, specificity over vagueness, context-sensitive labels, and writing buttons that tell users exactly what will happen

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-confirmation-dialogs

Confirmation dialogs — destructive action writing, consequence clarity, and specific button labels that make irreversibility unmistakable

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-content-hierarchy

Content hierarchy in UI — heading structure, progressive disclosure in text, inverted pyramid for interface writing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-data-table-copy

Data table copy — column headers, empty cells, truncation patterns, filter and sort labels, bulk action copy

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-destructive-action-copy

Destructive action copy — irreversibility warnings, undo availability, double-confirmation patterns, cooldown messaging

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-empty-states

Empty states — first-use, user-cleared, and no-results patterns that motivate action, set expectations, and turn blank screens into onramps

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-error-messages

Error messages — what went wrong, why it matters, how to fix it, the three-part error pattern for clear, actionable error communication

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-error-severity

Error severity communication — calibrating error tone to severity, from field validation to system failure to data loss

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-form-labels

Form labels and helper text — label clarity, placeholder anti-patterns, required-field indication, and writing forms that users complete without confusion

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-inclusive-language

Inclusive language in UI — gender-neutral, ability-neutral, culture-aware writing, avoiding idioms that exclude

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-internationalization-writing

Writing for internationalization — source strings that survive translation, concatenation traps, pluralization, date and number references

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-loading-states

Loading state copy — progress transparency, expectation setting, and writing text that reduces perceived wait time and prevents users from abandoning

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-microcopy-principles

Microcopy principles — clarity, brevity, human voice, active voice, and the core rules all UI text follows

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-navigation-labels

Navigation label writing — menu item naming, breadcrumb clarity, tab labels, and sidebar organization that users scan without reading

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-notification-copy

Notification and alert copy — urgency calibration, actionability, toast vs banner vs modal selection, and writing messages that inform without overwhelming

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-onboarding-copy

Onboarding copy — progressive disclosure, value-first framing, reducing anxiety, and welcome flows that convert sign-ups into active users

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-permission-access-copy

Permission and access copy — role-based messaging, upgrade prompts, gating copy, "you don't have access" patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-plain-language

Plain language for UI — reading level targeting, jargon elimination, sentence structure for scanning

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-search-copy

Search copy — placeholder text, zero-results messaging, autocomplete hints, search scope indicators, saved search patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-settings-preferences

Settings and preferences copy — toggle descriptions, preference explanations, consequence previews, settings organization

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-success-feedback

Success feedback copy — confirmation messages, celebration calibration, and next-step prompts that close the action loop and guide users forward

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-tooltip-contextual-help

Tooltip and contextual help writing — when to use tooltips, what to put in them, and progressive disclosure patterns that educate without interrupting

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-voice-tone

Voice and tone in UI writing — defining voice (constant) vs tone (contextual), formality calibration, and emotional register

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### ux-writing-for-scanning

Writing for scanning — F-pattern, front-loading keywords, chunking, bullet vs prose decisions for UI text

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### validate-context-engineering

Validate repository context engineering practices (AGENTS.md, doc coverage, knowledge map)

- **Triggers:** manual, on_pr, on_commit
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** flexible
- **Cognitive mode:** meticulous-verifier

### vue-async-components

Load Vue components lazily to reduce initial bundle size using defineAsyncComponent

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### vue-component-events

Communicate from child to parent components using emits and defineEmits

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### vue-composables-pattern

Extract and reuse stateful logic across components using Vue composables

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### vue-directive-pattern

Create custom Vue directives for low-level DOM manipulation and reusable DOM behavior

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### vue-pinia-pattern

Manage shared application state with Pinia stores in the Options or Setup style

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### vue-provide-inject

Share data across a component tree without prop-drilling using provide/inject

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### vue-reactive-refs

Create and manage reactive primitive values and objects using ref and reactive

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### vue-renderless-components

Extract behavior into components that render nothing, delegating all rendering to the consumer via slots

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### vue-slots-pattern

Use named, scoped, and dynamic slots to build flexible, composable component APIs

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### vue-teleport-pattern

Render a component's HTML at a different location in the DOM using Vue's Teleport

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### vue-watchers-pattern

React to data changes with watch and watchEffect for side effects and async operations

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### xstate-actor-pattern

Spawn and manage child actors for independent concurrent state machines

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### xstate-guards-actions

Control transitions with guards and execute side effects with actions

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### xstate-history-states

Remember and restore previous state configurations with history states

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### xstate-invoke-pattern

Invoke promises, callbacks, and child machines as services in state nodes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### xstate-machine-definition

Define statecharts with createMachine for explicit state transitions and context

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### xstate-parallel-states

Model concurrent state regions with parallel state nodes

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### xstate-react-integration

Connect XState machines to React components with useMachine and useActor hooks

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### xstate-testing-patterns

Test XState machines with model-based testing and direct state assertions

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### xstate-typegen

Generate full type safety for XState machines with typegen and setup patterns

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### xstate-visualization

Visualize and inspect XState machines with Stately Inspector and VS Code extension

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### zod-array-validation

Validate arrays, tuples, records, maps, and sets with Zod's collection primitives

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### zod-async-validation

Run async Zod validation with parseAsync, safeParseAsync, async refinements, and external checks

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### zod-error-handling

Handle Zod validation failures with safeParse, ZodError, error.format, error.flatten, and custom error maps

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### zod-infer-types

Derive TypeScript types from Zod schemas with z.infer, input vs output types, and ZodTypeAny

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### zod-nextjs-integration

Validate Next.js server actions, API routes, and form data with Zod schemas

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### zod-object-patterns

Shape and compose Zod objects with pick, omit, partial, required, extend, merge, strict, and passthrough

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### zod-schema-definition

Define runtime-validated TypeScript schemas with z.object, primitives, enums, and composition

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### zod-string-validation

Validate and transform strings with Zod's min, max, email, url, regex, trim, and custom messages

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### zod-transform-refine

Transform and validate data with Zod's transform, refine, superRefine, and preprocess APIs

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide

### zod-union-discriminated

Model variant types with z.union, z.discriminatedUnion, z.intersection, and type narrowing

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli, cursor, codex
- **Type:** knowledge
- **Cognitive mode:** advisory-guide
