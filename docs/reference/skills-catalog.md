<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate-docs` to regenerate. -->

# Skills Catalog

79 skills across 3 tiers. Tier 1 and 2 skills are registered as slash commands. Tier 3 skills are discoverable via the `search_skills` MCP tool.

## Tier 1 — Workflow (11 skills)

### add-harness-component

Add a component to an existing harness project

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** constructive-architect
- **Depends on:** initialize-harness-project

### harness-autopilot

Autonomous phase execution loop — chains planning, execution, verification, and review, pausing only at human decision points

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** constructive-architect
- **Depends on:** harness-planning, harness-execution, harness-verification, harness-code-review

### harness-brainstorming

Structured ideation and exploration with harness methodology

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** constructive-architect
- **Depends on:** harness-planning, harness-soundness-review

### harness-debugging

Systematic debugging with harness validation and state tracking

- **Triggers:** manual, on_bug_fix
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** diagnostic-investigator

### harness-execution

Execute a planned set of tasks with harness validation and state tracking

- **Triggers:** manual, on_new_feature, on_bug_fix
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer
- **Depends on:** harness-verification

### harness-onboarding

Onboard a new developer to a harness-managed project

- **Triggers:** manual, on_project_init
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** advisory-guide

### harness-planning

Structured project planning with harness constraints and validation

- **Triggers:** manual, on_new_feature, on_project_init
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** constructive-architect
- **Depends on:** harness-verification, harness-soundness-review

### harness-refactoring

Safe refactoring with validation before and after changes

- **Triggers:** manual, on_refactor
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** meticulous-implementer

### harness-skill-authoring

Create and maintain harness skills following the rich skill format

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** constructive-architect

### harness-tdd

Test-driven development integrated with harness validation

- **Triggers:** manual, on_new_feature, on_bug_fix
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer
- **Depends on:** harness-verification

### initialize-harness-project

Scaffold a new harness-compliant project

- **Triggers:** manual, on_project_init
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** constructive-architect

## Tier 2 — Maintenance (19 skills)

### cleanup-dead-code

Detect and auto-fix dead code including dead exports, commented-out code, and orphaned dependencies

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** diagnostic-investigator

### detect-doc-drift

Detect documentation that has drifted from code

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** diagnostic-investigator

### enforce-architecture

Validate architectural layer boundaries, detect violations, and auto-fix import ordering and forbidden import replacement

- **Triggers:** manual, on_pr, on_commit
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-architecture-advisor

Interactive architecture advisor that surfaces trade-offs and helps humans choose

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** advisory-guide

### harness-code-review

Multi-phase code review pipeline with mechanical checks, graph-scoped context, and parallel review agents

- **Triggers:** manual, on_pr, on_review
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** adversarial-reviewer

### harness-codebase-cleanup

Orchestrate dead code removal and architecture violation fixes with shared convergence loop

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** systematic-orchestrator
- **Depends on:** cleanup-dead-code, enforce-architecture, harness-hotspot-detector

### harness-dependency-health

Analyze structural health of the codebase using graph metrics

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** analytical-reporter

### harness-docs-pipeline

Orchestrator composing 4 documentation skills into a sequential pipeline with convergence-based remediation and qualitative health reporting

- **Triggers:** manual, on_doc_check
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** constructive-architect
- **Depends on:** detect-doc-drift, align-documentation, validate-context-engineering, harness-knowledge-mapper

### harness-hotspot-detector

Identify structural risk hotspots via co-change and churn analysis

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** analytical-reporter

### harness-impact-analysis

Graph-based impact analysis — answers "if I change X, what breaks?"

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** analytical-reporter

### harness-integrity

Unified integrity gate — chains verify (quick gate) with AI review into a single report

- **Triggers:** manual, on_pr, on_milestone
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier
- **Depends on:** harness-verify, harness-code-review

### harness-perf

Performance enforcement and benchmark management

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier
- **Depends on:** harness-verify

### harness-release-readiness

Audit npm release readiness, run maintenance checks, offer auto-fixes, track progress across sessions

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier
- **Depends on:** detect-doc-drift, cleanup-dead-code, align-documentation, enforce-architecture, harness-diagnostics, harness-parallel-agents

### harness-roadmap

Create and manage a unified project roadmap from existing specs and plans

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** constructive-architect

### harness-security-scan

Lightweight mechanical security scan for health checks

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer

### harness-soundness-review

Deep soundness analysis of specs and plans with auto-fix and convergence loop

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-test-advisor

Graph-based test selection — answers "what tests should I run?"

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** advisory-guide

### harness-verification

Comprehensive harness verification of project health and compliance

- **Triggers:** manual, on_pr, on_commit
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-verify

Binary pass/fail quick gate — runs test, lint, typecheck commands and returns structured result

- **Triggers:** manual, on_task_complete
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

## Tier 3 — Domain (49 skills)

### align-documentation

Auto-fix documentation drift issues

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** meticulous-verifier
- **Depends on:** detect-doc-drift

### check-mechanical-constraints

Run all mechanical constraint checks (context validation + architecture)

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier
- **Depends on:** validate-context-engineering, enforce-architecture

### harness-accessibility

WCAG accessibility scanning, contrast checking, ARIA validation, and remediation

- **Triggers:** manual, on_new_feature, on_project_init
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier
- **Depends on:** harness-design-system

### harness-api-design

REST, GraphQL, gRPC API design with OpenAPI specs and versioning strategies

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-auth

OAuth2, JWT, RBAC/ABAC, session management, and MFA patterns

- **Triggers:** manual, on_new_feature, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-caching

Cache strategies, invalidation patterns, and distributed caching

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-chaos

Chaos engineering, fault injection, and resilience validation

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** adversarial-reviewer

### harness-compliance

SOC2, HIPAA, GDPR compliance checks, audit trails, and regulatory checklists

- **Triggers:** manual, on_milestone, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-containerization

Dockerfile review, Kubernetes manifests, container registry management

- **Triggers:** manual, on_pr, on_commit
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-data-pipeline

ETL/ELT patterns, data quality checks, pipeline testing, and data workflow management

- **Triggers:** manual, on_pr, on_commit
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-data-validation

Schema validation, data contracts, and pipeline data quality

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-database

Schema design, migrations, ORM patterns, and migration safety checks

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-deployment

CI/CD pipelines, blue-green, canary, and environment management

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-design

Aesthetic direction workflow, anti-pattern enforcement, DESIGN.md generation, and strictness configuration

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** advisory-guide
- **Depends on:** harness-design-system

### harness-design-mobile

Token-bound mobile component generation with React Native, SwiftUI, Flutter, and Compose patterns and platform-specific design rules

- **Triggers:** manual, on_new_feature, on_commit
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer
- **Depends on:** harness-design-system, harness-design

### harness-design-system

Design token generation, palette selection, typography, spacing, and design intent management

- **Triggers:** manual, on_new_feature, on_project_init
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** constructive-architect

### harness-design-web

Token-bound web component generation with Tailwind/CSS, React/Vue/Svelte patterns, and design constraint verification

- **Triggers:** manual, on_new_feature, on_commit
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer
- **Depends on:** harness-design-system, harness-design

### harness-diagnostics

Classify errors into taxonomy categories and route to resolution strategies

- **Triggers:** manual, on_bug_fix
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** diagnostic-investigator

### harness-dx

Developer experience auditing — README quality, API documentation, getting-started guides, and example validation

- **Triggers:** manual, on_milestone, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-e2e

End-to-end testing with Playwright, Cypress, and Selenium including page objects and flakiness remediation

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer

### harness-event-driven

Message queues, event sourcing, CQRS, and saga patterns

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** constructive-architect

### harness-feature-flags

Flag lifecycle management, A/B testing infrastructure, and gradual rollouts

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-git-workflow

Git workflow best practices integrated with harness validation

- **Triggers:** manual, on_pr, on_commit
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** meticulous-verifier

### harness-i18n

Internationalization scanning — detect hardcoded strings, missing translations, locale-sensitive formatting, RTL issues, and generate actionable reports across web, mobile, and backend

- **Triggers:** manual, on_pr, on_commit, on_review
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-i18n-process

Upstream i18n process injection — inject internationalization considerations into brainstorming, planning, and review workflows with adaptive prompt-mode or gate-mode enforcement

- **Triggers:** on_new_feature, on_review
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** advisory-guide

### harness-i18n-workflow

Translation lifecycle management — configuration, scaffolding, string extraction, coverage tracking, pseudo-localization, and retrofit for existing projects

- **Triggers:** manual, on_project_init
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** constructive-architect
- **Depends on:** harness-i18n

### harness-incident-response

Runbook generation, postmortem analysis, and SLO/SLA tracking

- **Triggers:** manual, on_bug_fix
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** diagnostic-investigator

### harness-infrastructure-as-code

Terraform, CloudFormation, Pulumi patterns and IaC best practices

- **Triggers:** manual, on_new_feature, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-integration-test

Service boundary testing, API integration testing, and consumer-driven contract validation

- **Triggers:** manual, on_new_feature, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-knowledge-mapper

Auto-generate always-current knowledge maps from graph topology

- **Triggers:** manual, on_commit, on_milestone
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** constructive-architect

### harness-load-testing

Stress testing, capacity planning, and performance benchmarking with k6/Artillery/Gatling

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-ml-ops

Model serving patterns, experiment tracking, prompt evaluation, and ML pipeline management

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-mobile-patterns

Mobile platform lifecycle, permissions, deep linking, push notifications, and app store submission

- **Triggers:** manual, on_new_feature, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-mutation-test

Test quality validation through mutation testing with Stryker and mutation scoring

- **Triggers:** manual, on_milestone
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** adversarial-reviewer

### harness-observability

Structured logging, metrics, distributed tracing, and alerting strategies

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-parallel-agents

Coordinate multiple agents working in parallel on a harness project

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** constructive-architect

### harness-perf-tdd

Performance-aware TDD with benchmark assertions in the red-green-refactor cycle

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer
- **Depends on:** harness-tdd, harness-perf

### harness-pre-commit-review

Lightweight pre-commit quality gate combining mechanical checks and AI review

- **Triggers:** manual, on_commit
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Depends on:** harness-code-review

### harness-product-spec

User story generation, EARS acceptance criteria, and PRD creation from issues

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** constructive-architect

### harness-property-test

Property-based and generative testing with fast-check, hypothesis, and automatic shrinking

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** constructive-architect

### harness-resilience

Circuit breakers, rate limiting, bulkheads, retry patterns, and fault tolerance

- **Triggers:** manual, on_new_feature, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-secrets

Vault integration, credential rotation, and environment variable hygiene

- **Triggers:** manual, on_pr, on_commit
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### harness-security-review

Deep security audit with OWASP baseline and stack-adaptive analysis

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-implementer

### harness-sql-review

SQL query optimization, index analysis, N+1 detection, and query plan review

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** adversarial-reviewer

### harness-state-management

Manage persistent session state across harness agent sessions

- **Triggers:** manual
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** meticulous-implementer

### harness-test-data

Test factories, fixtures, database seeding, and test data isolation

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-ux-copy

Microcopy auditing, error message quality, voice/tone guides, and UI string consistency

- **Triggers:** manual, on_pr, on_review
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** advisory-guide

### harness-visual-regression

Screenshot comparison, visual diff detection, and baseline management

- **Triggers:** manual, on_pr
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
- **Cognitive mode:** meticulous-verifier

### validate-context-engineering

Validate repository context engineering practices (AGENTS.md, doc coverage, knowledge map)

- **Triggers:** manual, on_pr, on_commit
- **Platforms:** claude-code, gemini-cli
- **Type:** flexible
- **Cognitive mode:** meticulous-verifier
