# Harness Engineering for QA: Quickstart Guide

**Accelerate your testing workflows with AI-powered mechanical enforcement.**

This guide is written for QA engineers, SDETs, and test leads who want to integrate Harness Engineering into their daily work. It covers what harness does for QA, how to use it day-to-day, which tools map to which QA activities, and how to build a repeatable, high-confidence quality process.

---

## Table of Contents

1. [What Is Harness Engineering?](#what-is-harness-engineering)
2. [Why QA Should Care](#why-qa-should-care)
3. [Getting Started (5 Minutes)](#getting-started-5-minutes)
4. [The QA Toolkit at a Glance](#the-qa-toolkit-at-a-glance)
5. [Day-to-Day QA Workflows](#day-to-day-qa-workflows)
   - [Reviewing a Pull Request](#1-reviewing-a-pull-request)
   - [Deciding What Tests to Run](#2-deciding-what-tests-to-run)
   - [Writing New Tests](#3-writing-new-tests)
   - [Running Security Checks](#4-running-security-checks)
   - [Validating Coverage Quality](#5-validating-coverage-quality-mutation-testing)
   - [Performance and Load Testing](#6-performance-and-load-testing)
   - [Visual Regression Testing](#7-visual-regression-testing)
   - [End-to-End Testing](#8-end-to-end-testing)
   - [Integration and Contract Testing](#9-integration-and-contract-testing)
   - [Verifying a Feature Is Complete](#10-verifying-a-feature-is-complete)
6. [CI/CD Integration for QA Gates](#cicd-integration-for-qa-gates)
7. [The Knowledge Graph: Your QA Superpower](#the-knowledge-graph-your-qa-superpower)
8. [Improving Your QA Processes Over Time](#improving-your-qa-processes-over-time)
9. [Quick Reference Card](#quick-reference-card)
10. [FAQ](#faq)

---

## What Is Harness Engineering?

Harness Engineering is a toolkit that makes AI coding agents reliable through **mechanical enforcement**. Instead of relying on prompts, conventions, and hope, harness encodes your project's architectural decisions, quality standards, and testing requirements as machine-checkable constraints. Every rule is validated on every change.

For QA, this means:

- **Automated quality gates** that run before code is even merged
- **AI-powered code review** that catches bugs, security issues, and architectural violations
- **Graph-based test intelligence** that tells you exactly which tests to run for any change
- **Structured testing workflows** that guide agents (and humans) through E2E, integration, load, mutation, visual regression, and property-based testing
- **Continuous validation** that keeps documentation, architecture, and code in sync

Harness operates through **slash commands** (e.g., `/harness:code-review`) in your AI coding tool (Claude Code, Gemini CLI, Cursor), **CLI skills** invoked via `harness skill run <name>`, and **CLI commands** for scripts and CI pipelines.

> **Slash commands vs. skills:** Not every skill has a registered slash command. Core workflow skills (review, verify, tdd, etc.) are slash commands you can type directly. Domain-specific testing skills (e2e, mutation-test, load-testing, etc.) are invoked via `harness skill run <name>` or by asking your AI agent to run them. Both work the same way — the difference is just how you invoke them.

---

## Why QA Should Care

| Traditional QA Pain Point                           | How Harness Solves It                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| "Which tests should I run for this PR?"             | `/harness:test-advisor` analyzes the diff and tells you exactly which tests to run, prioritized into 3 tiers                       |
| "Did the dev actually test this?"                   | `/harness:verification` checks at 3 tiers: file EXISTS, code is SUBSTANTIVE (not stubs), and features are WIRED into the system    |
| "I keep finding the same types of bugs in review"   | `/harness:code-review` runs a 7-phase pipeline with parallel AI agents that check for bugs, security, architecture, and compliance |
| "Our tests pass but don't catch real bugs"          | `harness-mutation-test` skill introduces deliberate code mutations to verify your tests actually catch real bugs                   |
| "Security issues slip through to production"        | `harness check-security` scans for secrets, injection, XSS, weak crypto, path traversal, and more — mechanically, every time       |
| "We don't know if our tests cover the right things" | The knowledge graph maps every file to its tests, showing coverage gaps and blast radius for changes                               |
| "Regression testing takes too long"                 | Test advisor + graph-based prioritization lets you run only the tests that matter, cutting suite time dramatically                 |
| "Flaky E2E tests block our pipeline"                | `harness-e2e` skill includes a dedicated Phase 4 for systematic flakiness detection and remediation                                |
| "Docs say one thing, code does another"             | `/harness:detect-doc-drift` mechanically compares documentation against code and flags drift                                       |

---

## Getting Started (5 Minutes)

### Prerequisites

- Node.js 22+
- An AI coding agent: Claude Code, Gemini CLI, or Cursor
- Git

### Install

```bash
npm install -g @harness-engineering/cli
harness setup
```

This installs the CLI and configures slash commands, MCP server, and agent personas for your detected AI clients. After this, `/harness:*` commands are available in every conversation.

### Verify Your Project

If your project already uses harness:

```
/harness:verify
```

This runs all mechanical checks in one pass — configuration, dependencies, lint, typecheck, tests — and gives you a binary pass/fail.

If your project doesn't use harness yet, initialize it:

```
/harness:initialize-project
```

This walks you through setup interactively and scaffolds everything. For test suites (Playwright API suites, E2E/UI suites, or shared test libraries), use the test-suite variant instead, which adds archetype selection, shared-library-vs-scaffold decision, layer variants, tag taxonomy, reporter stack, and a custom report:

```
/harness:initialize-test-suite-project
```

### Build the Knowledge Graph

The knowledge graph powers test intelligence, impact analysis, and blast radius estimation:

```bash
harness scan
```

This builds a structural graph from your code, git history, and documentation. It enables the most powerful QA features like test advisor and impact analysis.

---

## The QA Toolkit at a Glance

### Testing Skills

**Slash commands** (type directly in your AI agent):

| Command                 | What It Does                                                | When to Use                                         |
| ----------------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| `/harness:test-advisor` | Graph-based test selection — "what tests should I run?"     | Before pushing, in CI, when triaging a test failure |
| `/harness:tdd`          | Test-driven development with red-green-refactor enforcement | Writing new tests or features with tests first      |
| `/harness:perf`         | Performance enforcement with benchmarks and baselines       | Performance-critical changes, regression detection  |

**Domain skills** (invoke via `harness skill run <name>` or ask your AI agent):

| Skill                       | What It Does                                         | When to Use                                                 |
| --------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| `harness-e2e`               | E2E browser testing with Playwright/Cypress/Selenium | Testing critical user flows through the UI                  |
| `harness-integration-test`  | Service boundary and API contract testing            | Testing API endpoints, service communication                |
| `harness-load-testing`      | Stress testing with k6, Artillery, or Gatling        | Pre-release capacity validation, baseline perf              |
| `harness-mutation-test`     | Mutation testing to validate test quality            | After hitting coverage thresholds, validating test strength |
| `harness-property-test`     | Property-based generative testing                    | Functions with large input spaces, parsers, validators      |
| `harness-visual-regression` | Screenshot comparison and visual diff detection      | UI component changes, CSS regression prevention             |

> **How to run domain skills:** Either `harness skill run harness-e2e` from the terminal, or ask your AI agent: "Run the harness-e2e skill to set up E2E tests for our login flow."

### Review and Verification Skills

| Skill                       | What It Does                                               | When to Use                                            |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| `/harness:code-review`      | 7-phase code review pipeline with parallel AI agents       | Before merging any PR                                  |
| `/harness:verification`     | 3-tier implementation audit (EXISTS / SUBSTANTIVE / WIRED) | After a feature is "done" — before calling it complete |
| `/harness:integrity`        | Chains verification + AI review in a single pass           | Milestone boundaries, release gates                    |
| `/harness:security-scan`    | Lightweight mechanical security scan                       | Quick triage, CI gates, scheduled sweeps               |
| `/harness:soundness-review` | Deep analysis of specs and plans                           | Before approving a spec or plan                        |

### Maintenance Skills

| Skill                           | What It Does                                                | When to Use                                |
| ------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| `/harness:detect-doc-drift`     | Finds documentation out of sync with code                   | Regular maintenance, pre-release checks    |
| `/harness:cleanup-dead-code`    | Removes unused imports, functions, files                    | Keeping the codebase clean, reducing noise |
| `/harness:enforce-architecture` | Validates layer boundaries, fixes violations                | Preventing architectural decay             |
| `/harness:impact-analysis`      | Graph-based "if I change X, what breaks?"                   | Risk assessment before changes             |
| `/harness:hotspot-detector`     | Identifies structural risk via co-change and churn analysis | Prioritizing where to focus testing effort |

### CLI Commands for CI/Scripts

| Command                  | What It Does                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `harness ci check`       | Run ALL checks in one pass (validate, deps, docs, entropy, security, perf, arch, phase-gate, traceability) |
| `harness check-security` | Security scan only                                                                                         |
| `harness check-deps`     | Dependency boundary validation                                                                             |
| `harness check-docs`     | Documentation coverage check                                                                               |
| `harness check-perf`     | Performance budget enforcement                                                                             |
| `harness validate`       | Configuration and structure validation                                                                     |
| `harness scan`           | Build/refresh the knowledge graph                                                                          |

---

## Day-to-Day QA Workflows

### 1. Reviewing a Pull Request

**The old way:** Read the diff, mentally trace dependencies, check if tests exist, maybe run some tests locally.

**The harness way:**

```
/harness:code-review
```

This runs a **7-phase pipeline**:

1. **GATE** — Checks if the PR is eligible for review
2. **MECHANICAL** — Runs lint, typecheck, tests, security scan. If any fail, it reports and stops — no point reviewing code that doesn't compile.
3. **CONTEXT** — Assembles context per review domain at a 1:1 ratio (200-line diff = ~200 lines of surrounding context from imports, tests, specs, types)
4. **FAN-OUT** — Dispatches parallel review agents for compliance, bugs, security, and architecture
5. **VALIDATE** — Filters out duplicates and mechanical-only issues
6. **DEDUP+MERGE** — Groups findings, assigns severity
7. **OUTPUT** — Delivers a structured report with evidence-based findings

Every finding includes **file:line**, **severity** (critical/important/suggestion), **rationale**, and **suggested fix**. No vague "consider adding validation" — the review points to specific lines.

**Rigor levels:**

- `--fast` — Quick pass for low-risk PRs
- (default) — Standard review
- `--thorough` — Full roster with meta-judge for high-risk changes
- `--deep` — Adds security threat modeling

**Post to GitHub:**

```
/harness:code-review --comment
```

This posts inline comments directly on the PR.

---

### 2. Deciding What Tests to Run

**The old way:** Run the whole suite. Wait 20 minutes. Or guess which tests matter.

**The harness way:**

```
/harness:test-advisor
```

The test advisor:

1. **PARSES** the diff to identify changed files
2. **DISCOVERS** related tests via the knowledge graph (direct imports, transitive imports, co-change history)
3. **PRIORITIZES** tests into 3 tiers:

| Tier                    | Priority             | What It Catches                                |
| ----------------------- | -------------------- | ---------------------------------------------- |
| **Tier 1 — Must Run**   | Direct test coverage | Tests that directly import changed files       |
| **Tier 2 — Should Run** | Transitive coverage  | Tests one hop away — catches indirect breakage |
| **Tier 3 — Could Run**  | Related              | Same module, co-change history                 |

Output includes **ready-to-run commands**:

```
### Quick Run Command
npx vitest run tests/services/auth.test.ts tests/types/user.test.ts

### Full Run Command (all tiers)
npx vitest run tests/services/auth.test.ts tests/types/user.test.ts tests/routes/login.test.ts tests/integration/auth-flow.test.ts
```

It also **flags coverage gaps**: "No tests found for src/services/auth.ts — consider adding tests before merging."

> **Pro tip:** If no knowledge graph exists, the test advisor falls back to naming conventions, import parsing, and git co-change analysis (~80% coverage). Run `harness scan` to get the full graph-enhanced analysis.

---

### 3. Writing New Tests

Harness provides specialized skills for different types of tests:

#### Test-Driven Development (Unit Tests)

```
/harness:tdd
```

Guides you through the red-green-refactor cycle with mechanical enforcement. Write a failing test, implement the code, verify it passes, refactor.

#### Integration Tests

```bash
harness skill run harness-integration-test
```

Walks you through:

1. **DISCOVER** — Maps service boundaries and dependencies, identifies coverage gaps
2. **MOCK** — Configures test doubles (Testcontainers, in-memory DBs, mock services)
3. **IMPLEMENT** — Writes API tests, contract tests, repository tests
4. **VALIDATE** — Runs tests, checks contracts, verifies error scenarios

Supports supertest, Pact, Testcontainers, and consumer-driven contracts.

#### Property-Based Tests

```bash
harness skill run harness-property-test
```

For functions with large input spaces. Instead of writing specific examples, you define **properties** (e.g., "serializing then deserializing always returns the original") and the framework generates thousands of random inputs to verify.

Great for: parsers, serializers, validators, sorting algorithms, data transformations.

---

### 4. Running Security Checks

#### Quick Mechanical Scan

```
/harness:security-scan
```

Scans for 11+ pattern categories:

- **Secrets**: API keys, tokens, passwords
- **Injection**: SQL injection, command injection, eval/Function
- **XSS**: innerHTML, dangerouslySetInnerHTML, document.write
- **Cryptography**: Weak hashing, hardcoded keys
- **Path traversal**: Directory traversal in file operations
- **Network**: CORS wildcards, disabled TLS, hardcoded HTTP
- **Agent config**: Unicode detection, wildcard permissions, auto-approve risks
- **MCP server**: Hardcoded secrets, shell injection, typosquatting
- **Stack-specific**: Prototype pollution (Node.js), Express, React, Go

```bash
# CLI — scan changed files only (great for CI)
harness check-security --changed-only

# CLI — full project scan
harness check-security
```

#### Deep Security Review

```
/harness:code-review --deep
```

Adds OWASP/CWE-focused threat modeling to the standard code review pipeline using the **security-reviewer** persona.

---

### 5. Validating Coverage Quality (Mutation Testing)

Code coverage percentages lie. 80% line coverage doesn't mean your tests catch 80% of bugs. Mutation testing tells you the truth.

```bash
harness skill run harness-mutation-test
```

How it works:

1. **CONFIGURE** — Sets up Stryker (JS/TS), mutmut (Python), PIT (Java), or cargo-mutants (Rust)
2. **GENERATE** — Creates code mutations (flip conditionals, change operators, remove calls)
3. **EXECUTE** — Runs your test suite against each mutation
4. **ANALYZE** — Reports which mutations survived (your tests didn't catch them)

**Recommended thresholds:**

- 80% mutation score for business-critical modules (payment, auth, data processing)
- 60% for general application code
- No threshold for infrastructure/glue code

**When to use:**

- After reaching 60%+ line coverage (below that, write more tests first)
- On critical business logic where bugs have high impact
- Before major releases

---

### 6. Performance and Load Testing

```bash
harness skill run harness-load-testing
```

Supports **k6**, **Artillery**, **Gatling**, and **JMeter**. Walks you through:

1. **DETECT** — Finds existing load tests, maps critical endpoints
2. **DESIGN** — Creates test scenarios:
   - **Smoke**: 1-5 VUs, 1 min — validates scripts work
   - **Load**: Expected traffic, 5-15 min — validates normal operation
   - **Stress**: 2-3x traffic — finds the breaking point
   - **Spike**: 10x burst — tests auto-scaling
   - **Soak**: Expected traffic, 1-4 hours — finds memory leaks
3. **EXECUTE** — Runs tests with monitoring
4. **ANALYZE** — Compares results against thresholds (p95, p99, error rate, throughput)

For **structural performance checks** in CI:

```bash
harness check-perf              # Full check (complexity + coupling + size budgets)
harness check-perf --structural # Complexity thresholds only
harness check-perf --coupling   # Coupling metrics only
```

---

### 7. Visual Regression Testing

```bash
harness skill run harness-visual-regression
```

Catches unintended CSS regressions, layout shifts, and rendering inconsistencies:

1. **DETECT** — Finds existing visual test infrastructure (Storybook, Chromatic, Percy, Playwright screenshots)
2. **BASELINE** — Captures reference screenshots across a viewport/theme matrix (mobile, tablet, desktop; light, dark)
3. **COMPARE** — Runs pixel-level diffs against baselines
4. **CLASSIFY** — Distinguishes intentional changes, regressions, and environmental noise

Works with Storybook + Chromatic, Playwright screenshots, Jest + jest-image-snapshot, and Cypress + Percy.

---

### 8. End-to-End Testing

```bash
harness skill run harness-e2e
```

Full browser testing with Playwright, Cypress, or Selenium:

1. **DETECT** — Identifies framework, catalogs existing E2E tests, maps application entry points
2. **SCAFFOLD** — Generates page objects with stable selectors (`data-testid`, `role`, `aria-label`), shared fixtures, auth helpers
3. **IMPLEMENT** — Writes tests prioritized by business impact:
   - Smoke tests (app loads, critical pages render)
   - Auth flows (login, logout, session persistence)
   - Primary business flows (the 80% user value)
   - Error paths (validation, 404, permission denied)
4. **VALIDATE** — Runs suite, detects flakiness, and **systematically remediates** flaky tests

**Best practices enforced:**

- Arrange-Act-Assert pattern
- No arbitrary timeouts — explicit waits only
- Test isolation (no shared mutable state)
- Tags: `@smoke`, `@critical-path`, `@slow`

---

### 9. Integration and Contract Testing

```bash
harness skill run harness-integration-test
```

For testing service boundaries without full E2E infrastructure:

1. **DISCOVER** — Maps API routes, service dependencies, shared resources
2. **MOCK** — Sets up Testcontainers, in-memory DBs, or transaction rollback strategies
3. **IMPLEMENT** — API tests, consumer-driven contracts (Pact), repository tests
4. **VALIDATE** — Verifies contracts, error scenarios, timeout handling

Great for microservices, event-driven architectures, and API-first development.

---

### 10. Verifying a Feature Is Complete

When a developer says "it's done," verify mechanically:

```
/harness:verification
```

This checks at **3 tiers**:

| Tier            | What It Checks                             | Example                                                            |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| **EXISTS**      | Does the file exist with real content?     | `src/services/auth.ts — exists, 45 lines`                          |
| **SUBSTANTIVE** | Is it a real implementation, not a stub?   | `src/api/routes.ts — line 42: empty catch block (stub)`            |
| **WIRED**       | Is it connected to the rest of the system? | `DELETE /bookmarks/:id route defined but not registered in app.ts` |

The **WIRED** tier catches things tests might miss — a route that exists but isn't reachable because it's not registered in the router.

For the deepest check (verification + AI review):

```
/harness:integrity
```

---

## CI/CD Integration for QA Gates

### The All-in-One CI Check

```bash
harness ci check --json
```

Runs 9 checks in sequence:

| Check          | What It Validates                                 | Blocks Merge?          |
| -------------- | ------------------------------------------------- | ---------------------- |
| `validate`     | AGENTS.md structure, file integrity               | Yes (error)            |
| `deps`         | Layer dependency boundaries, no forbidden imports | Yes (error)            |
| `docs`         | Documentation coverage meets threshold            | Configurable (warning) |
| `entropy`      | Code drift, dead code detection                   | Configurable (warning) |
| `security`     | Secrets, injection, XSS, weak crypto              | Yes (error)            |
| `perf`         | Complexity thresholds, coupling, size budgets     | Configurable (warning) |
| `phase-gate`   | Spec-to-implementation mapping                    | Configurable           |
| `arch`         | Architecture constraints, baselines               | Yes (error)            |
| `traceability` | Requirement-to-code mapping                       | Configurable (warning) |

### GitHub Actions Setup

```bash
harness ci init --platform github
```

Generates a `.github/workflows/harness.yml` that:

- Runs checks on push to main and on pull requests
- Posts a summary comment on the PR
- Labels the PR on failure

### Customizing

```bash
# Fail on warnings too (stricter)
harness ci check --fail-on warning

# Skip checks that aren't relevant yet
harness ci check --skip entropy,phase-gate

# Scan only changed files for security (faster)
harness check-security --changed-only
```

### JSON Output for Reporting

```bash
# Get just the summary
harness ci check --json | jq '.summary'

# List all failing checks
harness ci check --json | jq '.checks[] | select(.status == "fail")'

# Get all error-level issues
harness ci check --json | jq '[.checks[].issues[] | select(.severity == "error")]'
```

---

## The Knowledge Graph: Your QA Superpower

The knowledge graph is a structural model of your codebase — 30 node types, 25 edge types — that powers many of harness's QA features.

### Build It

```bash
harness scan
```

### What It Enables for QA

| Capability                   | How to Use It                        | QA Value                                                                   |
| ---------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| **Test selection**           | `/harness:test-advisor`              | Run only the tests that matter for a change                                |
| **Impact analysis**          | `/harness:impact-analysis`           | "If I change this file, what could break?"                                 |
| **Blast radius**             | `compute_blast_radius` (MCP tool)    | Probabilistic cascading failure simulation                                 |
| **Conflict prediction**      | `predict_conflicts` (MCP tool)       | Predict merge conflicts before parallel work starts                        |
| **Anomaly detection**        | `detect_anomalies` (MCP tool)        | Find structural outliers via z-score analysis                              |
| **Coverage gaps**            | Test advisor's coverage gap flagging | Identify changed files with no test coverage                               |
| **Hotspot detection**        | `/harness:hotspot-detector`          | Find files that change frequently and have high coupling (high-risk areas) |
| **Natural language queries** | `ask_graph` (MCP tool)               | "What depends on the auth module?" "What tests cover the payment service?" |

### Example: Risk-Based Testing

```
1. Run /harness:hotspot-detector to find high-churn, high-coupling files
2. Run /harness:test-advisor on those files to see test coverage
3. Focus your testing effort on the intersection: high-risk areas with weak coverage
```

---

## Improving Your QA Processes Over Time

### Week 1: Foundation

- Install harness CLI and run `harness setup`
- Run `/harness:verify` on your project to see where you stand
- Run `harness scan` to build the knowledge graph
- Start using `/harness:test-advisor` before pushing changes
- Add `harness ci check` to your CI pipeline

### Week 2: Review Process

- Start using `/harness:code-review` for PR reviews
- Configure review rigor levels (`--fast` for low-risk, `--thorough` for high-risk)
- Use `/harness:verification` to validate feature completeness
- Run `/harness:security-scan` on the full codebase to establish a baseline

### Week 3: Test Intelligence

- Use `/harness:hotspot-detector` to identify high-risk areas
- Run `harness skill run harness-mutation-test` on critical business modules
- Analyze mutation results to find where tests are weakest
- Write targeted tests for survived mutants

### Week 4: Advanced Workflows

- Set up `harness skill run harness-e2e` for critical user flows
- Configure `harness skill run harness-visual-regression` for UI components
- Use `harness skill run harness-load-testing` to establish performance baselines
- Enable `harness check-perf` in CI with structural budgets

### Ongoing: Continuous Improvement

- Run `/harness:detect-doc-drift` weekly to keep docs accurate
- Use `/harness:cleanup-dead-code` monthly to reduce noise
- Monitor hotspots — areas that keep churning need structural fixes, not more tests
- Review mutation scores quarterly on critical modules
- Use `/harness:impact-analysis` before any large refactor

---

## Quick Reference Card

### "I need to..." → Use this

| I Need To...                       | Command / Skill                                      | Type                |
| ---------------------------------- | ---------------------------------------------------- | ------------------- |
| Review a PR                        | `/harness:code-review`                               | Slash command       |
| Know which tests to run            | `/harness:test-advisor`                              | Slash command       |
| Verify a feature is complete       | `/harness:verification`                              | Slash command       |
| Run all quality checks             | `/harness:verify` or `harness ci check`              | Slash command / CLI |
| Check for security issues          | `/harness:security-scan` or `harness check-security` | Slash command / CLI |
| Write unit tests                   | `/harness:tdd`                                       | Slash command       |
| Write E2E tests                    | `harness skill run harness-e2e`                      | Domain skill        |
| Write integration tests            | `harness skill run harness-integration-test`         | Domain skill        |
| Write property-based tests         | `harness skill run harness-property-test`            | Domain skill        |
| Run load tests                     | `harness skill run harness-load-testing`             | Domain skill        |
| Check test quality with mutations  | `harness skill run harness-mutation-test`            | Domain skill        |
| Check for visual regressions       | `harness skill run harness-visual-regression`        | Domain skill        |
| See what could break if I change X | `/harness:impact-analysis`                           | Slash command       |
| Find risky areas of the codebase   | `/harness:hotspot-detector`                          | Slash command       |
| Check if docs match code           | `/harness:detect-doc-drift`                          | Slash command       |
| Deep audit before a release        | `/harness:integrity`                                 | Slash command       |
| Build the knowledge graph          | `harness scan`                                       | CLI                 |
| Ask questions about the codebase   | `ask_graph` MCP tool                                 | MCP tool            |

### Exit Codes for CI

| Code | Meaning                   | Action      |
| ---- | ------------------------- | ----------- |
| `0`  | All checks passed         | Proceed     |
| `1`  | One or more checks failed | Block merge |
| `2`  | Harness internal error    | Investigate |

---

## FAQ

### Do I need to be a developer to use harness?

No. The slash commands work in plain English through your AI coding tool. You describe what you want ("review this PR", "which tests should I run?", "check for security issues") and the skill handles the technical execution. The CLI commands are also straightforward for CI integration.

### Does harness replace our existing test framework?

No. Harness **orchestrates** your existing tools. It wraps Vitest, Jest, Playwright, Cypress, k6, Stryker, and others — it doesn't replace them. Your tests, your frameworks, your CI — harness adds intelligence and enforcement on top.

### How does the test advisor work without a knowledge graph?

It falls back to three strategies: filename convention matching (`auth.ts` → `auth.test.ts`), import parsing (grep for imports in test files), and git co-change analysis (files that change in the same commits). This catches ~80% of what the graph catches. Run `harness scan` to get the full 100%.

### Can I use harness with any programming language?

The core validation and CLI work with any language. Testing skills have specific framework support:

- **TypeScript/JavaScript**: Full support (Vitest, Jest, Playwright, Cypress, Stryker, k6, fast-check)
- **Python**: mutmut, hypothesis, pytest, Artillery
- **Java/Kotlin**: PIT, JUnit, Gatling, Spring Cloud Contract
- **Go, Rust, C#**: Supported with language-specific tooling

### How does harness compare to SonarQube / CodeClimate?

Those tools analyze code quality statically. Harness does that **plus**:

- Graph-based test intelligence (which tests to run, impact analysis)
- AI-powered code review with parallel agents
- Mutation testing orchestration
- Architectural constraint enforcement (layer boundaries, forbidden imports)
- Spec-to-implementation traceability
- Real-time agent feedback during development

### What if the security scan produces false positives?

Configure exclusions in `harness.config.json`:

```json
{
  "security": {
    "exclude": ["tests/**", "scripts/**"],
    "severityThreshold": "warning"
  }
}
```

### How do I integrate harness checks into my existing CI?

```bash
npm install -g @harness-engineering/cli
harness ci check --json
```

That's it. The exit code (0/1/2) integrates with any CI platform. Use `harness ci init --platform github|gitlab|generic` to generate a ready-to-commit config file.

---

## Summary

Harness Engineering gives QA engineers a **force multiplier**. Instead of manually reviewing every PR, guessing which tests to run, and hoping coverage numbers mean something:

1. **Let the graph tell you what to test** — `/harness:test-advisor` eliminates guesswork
2. **Automate your review process** — `/harness:code-review` catches bugs, security issues, and architectural violations in a structured pipeline
3. **Verify, don't trust** — `/harness:verification` mechanically checks that features are actually complete (EXISTS → SUBSTANTIVE → WIRED)
4. **Validate test quality** — `harness-mutation-test` skill proves your tests catch real bugs, not just execute lines
5. **Gate your pipeline** — `harness ci check` runs 9 quality checks before any merge
6. **Focus effort where it matters** — Hotspot detection + impact analysis tells you where bugs are most likely to hide

The goal isn't to do more QA work. It's to do the **right** QA work, faster, with higher confidence.
