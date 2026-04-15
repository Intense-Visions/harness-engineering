# Harness Engineering for Developers: Quickstart Guide

**Ship code faster with mechanical enforcement, graph-powered intelligence, and structured workflows.**

This guide is written for developers joining a harness-managed project for the first time — whether junior, mid-level, or senior engineers new to the codebase. It covers how harness accelerates your onboarding, what tools are available for daily development, how to write and test code safely, and how to build confidence in an unfamiliar codebase quickly.

---

## Table of Contents

1. [Why This Guide Exists](#why-this-guide-exists)
2. [Getting Started (First 30 Minutes)](#getting-started-first-30-minutes)
3. [The Developer Toolkit at a Glance](#the-developer-toolkit-at-a-glance)
4. [Day-to-Day Workflows](#day-to-day-workflows)
   - [Exploring the Codebase](#1-exploring-the-codebase)
   - [Making Your First Change Safely](#2-making-your-first-change-safely)
   - [Writing Tests for Your Changes](#3-writing-tests-for-your-changes)
   - [Self-Reviewing Before Opening a PR](#4-self-reviewing-before-opening-a-pr)
   - [Understanding CI Failures](#5-understanding-ci-failures)
   - [Asking Questions About the Codebase](#6-asking-questions-about-the-codebase)
   - [Debugging a Failing Test](#7-debugging-a-failing-test)
   - [Contributing to Documentation](#8-contributing-to-documentation)
5. [Architecture Awareness](#architecture-awareness)
6. [Understanding CI Checks](#understanding-ci-checks)
7. [Your First Week](#your-first-week)
8. [Example Projects](#example-projects)
9. [Quick Reference Card](#quick-reference-card)
10. [FAQ](#faq)

---

## Why This Guide Exists

Starting on a new codebase is slow. You don't know the architecture, the conventions, the implicit rules, or where anything lives. You're afraid to break things. You spend days reading code before you feel confident enough to make a change.

Harness eliminates that friction. It encodes the project's architecture, conventions, constraints, and hard-won lessons as machine-checkable rules — and gives you tools to explore, understand, and safely change code from day one.

For developers, this means:

- **Automated onboarding** that walks you through the codebase in minutes, not days
- **A knowledge graph** you can query in natural language — "what depends on auth?", "what tests cover payments?"
- **Mechanical verification** after every change — typecheck, lint, test in one command
- **Architecture enforcement** that catches layer violations before you commit
- **Impact analysis** that tells you what your change might break before you push
- **Structured debugging, testing, and review workflows** that guide you through best practices

Harness operates through **slash commands** (e.g., `/harness:verify`) in your AI coding tool (Claude Code, Gemini CLI, Cursor), **CLI skills** invoked via `harness skill run <name>`, and **CLI commands** for scripts and CI pipelines.

> **Slash commands vs. skills:** Not every skill has a registered slash command. Core workflow skills (verify, tdd, code-review, etc.) are slash commands you can type directly. Domain-specific skills (e2e, integration-test, property-test, etc.) are invoked via `harness skill run <name>` or by asking your AI agent to run them. Both work the same way — the difference is just how you invoke them.

---

## Getting Started (First 30 Minutes)

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

### Run Onboarding (The First Thing You Should Do)

```
/harness:onboarding
```

This is a **4-phase automated orientation** that gets you productive fast:

| Phase         | What Happens                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **READ**      | Reads AGENTS.md (architecture, conventions, constraints), harness.config.json, .harness/learnings.md (gotchas), .harness/state.json (current work) |
| **MAP**       | Maps the technology stack, architecture, conventions, constraints, design system, and separation of concerns                                       |
| **ORIENT**    | Determines the project's adoption level (basic, intermediate, or advanced) and adjusts guidance accordingly                                        |
| **SUMMARIZE** | Produces a stack overview, layer table, component list, conventions summary, and concrete getting-started steps                                    |

After onboarding, you will have a clear mental model of the project — its layers, its rules, and where to start.

### Build the Knowledge Graph

The knowledge graph powers test intelligence, impact analysis, dependency queries, and natural language exploration:

```bash
harness scan
```

This builds a structural graph from your code, git history, and documentation. It enables the most powerful developer features like test advisor, impact analysis, and the `ask_graph` MCP tool.

### Verify Everything Works

```
/harness:verify
```

This runs all mechanical checks in one pass — configuration, dependencies, lint, typecheck, tests — and gives you a binary pass/fail. If this passes, the project is healthy and you are set up correctly.

---

## The Developer Toolkit at a Glance

### Onboarding and Exploration

| Command / Tool             | What It Does                              | When to Use                                           |
| -------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| `/harness:onboarding`      | 4-phase automated codebase orientation    | First thing on a new project                          |
| `ask_graph` (MCP tool)     | Natural language codebase queries         | "What depends on auth?", "What tests cover payments?" |
| `/harness:impact-analysis` | Graph-based "if I change X, what breaks?" | Before making changes, understanding blast radius     |
| `harness scan`             | Build/refresh the knowledge graph         | After cloning, after major changes                    |

### Daily Development

**Slash commands** (type directly in your AI agent):

| Command                         | What It Does                                                | When to Use                                    |
| ------------------------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| `/harness:verify`               | Quick mechanical check (typecheck, lint, test)              | After every change                             |
| `/harness:tdd`                  | Test-driven development with red-green-refactor enforcement | Writing new features or fixing bugs test-first |
| `/harness:test-advisor`         | Graph-based test selection — "what tests should I run?"     | Before pushing, after making changes           |
| `/harness:code-review`          | Self-review before opening a PR                             | Before every PR                                |
| `/harness:integrity`            | Comprehensive pre-PR gate (verify + AI review)              | Final check before merge                       |
| `/harness:enforce-architecture` | Validate layer boundaries and fix violations                | After adding imports, refactoring              |

### Debugging

| Command                    | What It Does                              | When to Use                             |
| -------------------------- | ----------------------------------------- | --------------------------------------- |
| `/harness:debugging`       | Systematic debugging with state tracking  | When a bug resists quick fixes          |
| `/harness:impact-analysis` | Understand what your bug fix might affect | Before pushing a fix to production code |

### Testing

| Command / Skill                              | What It Does                                        | When to Use                                   |
| -------------------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| `/harness:tdd`                               | Guided test-first development                       | Writing new tests or features                 |
| `/harness:test-advisor`                      | Find existing tests and coverage gaps               | Before pushing, deciding what to test         |
| `harness skill run harness-e2e`              | E2E browser testing (Playwright, Cypress, Selenium) | Testing critical user flows                   |
| `harness skill run harness-integration-test` | Service boundary and API contract testing           | Testing API endpoints, service communication  |
| `harness skill run harness-property-test`    | Property-based generative testing                   | Functions with large input spaces, validators |

### Code Quality and Maintenance

| Command                      | What It Does                          | When to Use                      |
| ---------------------------- | ------------------------------------- | -------------------------------- |
| `/harness:cleanup-dead-code` | Find unused imports, functions, files | Keeping the codebase clean       |
| `/harness:detect-doc-drift`  | Check if documentation matches code   | After changing behavior or APIs  |
| `/harness:security-scan`     | Quick mechanical security check       | Before pushing sensitive changes |

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

## Day-to-Day Workflows

### 1. Exploring the Codebase

**The old way:** Grep through files, read READMEs that are probably outdated, ask a teammate who's busy.

**The harness way:**

After running `/harness:onboarding`, use the `ask_graph` MCP tool to explore interactively:

```
ask_graph: "What depends on the auth module?"
ask_graph: "What tests cover the payment service?"
ask_graph: "Show me the dependency tree for src/core/engine.ts"
ask_graph: "Which files have the most incoming dependencies?"
```

The graph supports dependency mapping, test discovery, and structural queries. If you can phrase it as a question about the codebase's structure, the graph can answer it.

For understanding the blast radius of a specific area before you touch it:

```
/harness:impact-analysis
```

This shows you what files, tests, and downstream consumers are affected by changes to a given file or module.

> **Pro tip:** If `ask_graph` gives sparse results, run `harness scan` to rebuild the knowledge graph. The graph improves as it ingests more of the codebase.

---

### 2. Making Your First Change Safely

**The old way:** Make the change, run whatever tests you remember, push and pray.

**The harness way:**

1. **Before you start**, understand the blast radius:

   ```
   /harness:impact-analysis
   ```

2. **Make your change.**

3. **Verify mechanically** — typecheck, lint, test in one pass:

   ```
   /harness:verify
   ```

4. **Check architecture** — make sure you haven't violated layer boundaries:

   ```
   /harness:enforce-architecture
   ```

5. **Find out which tests you need to run** beyond the obvious ones:

   ```
   /harness:test-advisor
   ```

This workflow gives you confidence that your change is safe before it leaves your machine. The pre-commit hook also runs architecture checks automatically, so violations are caught even if you skip step 4.

---

### 3. Writing Tests for Your Changes

**The old way:** Write tests after the code, maybe, if there's time.

**The harness way:**

#### Test-Driven Development

```
/harness:tdd
```

This enforces the red-green-refactor cycle:

1. **RED** — Write a failing test that describes the behavior you want
2. **GREEN** — Write the minimum code to make the test pass
3. **REFACTOR** — Clean up while keeping tests green

The skill mechanically enforces each step — you cannot skip ahead to implementation without a failing test first.

#### Finding Coverage Gaps

```
/harness:test-advisor
```

The test advisor analyzes your diff and tells you:

- **Tier 1 (Must Run):** Tests that directly import your changed files
- **Tier 2 (Should Run):** Tests one hop away — catches indirect breakage
- **Tier 3 (Could Run):** Same module, co-change history

It also **flags coverage gaps**: files you changed that have no tests covering them.

#### Domain-Specific Testing

For specialized testing needs:

- **E2E tests:** `harness skill run harness-e2e` — browser testing with Playwright, Cypress, or Selenium
- **Integration tests:** `harness skill run harness-integration-test` — service boundary and API contract testing
- **Property-based tests:** `harness skill run harness-property-test` — generative testing for functions with large input spaces (parsers, validators, serializers)

---

### 4. Self-Reviewing Before Opening a PR

**The old way:** Open the PR, wait for feedback, iterate.

**The harness way:**

```
/harness:code-review
```

This runs a **7-phase pipeline** on your own code before anyone else sees it:

1. **GATE** — Checks eligibility for review
2. **MECHANICAL** — Runs lint, typecheck, tests, security scan
3. **CONTEXT** — Assembles surrounding context for each review domain
4. **FAN-OUT** — Dispatches parallel review agents for compliance, bugs, security, architecture
5. **VALIDATE** — Filters duplicates and mechanical-only issues
6. **DEDUP+MERGE** — Groups findings, assigns severity
7. **OUTPUT** — Structured report with file:line, severity, rationale, and suggested fix

Every finding includes specific evidence — no vague "consider refactoring this." Fix the issues before opening the PR, and the actual review goes much faster.

For the most comprehensive pre-PR gate (verification + AI review in one pass):

```
/harness:integrity
```

---

### 5. Understanding CI Failures

When CI fails on your PR, the output tells you exactly which check failed and why. Here are the checks harness runs:

| Check          | What It Validates                                 | Common Fix                                    |
| -------------- | ------------------------------------------------- | --------------------------------------------- |
| `validate`     | AGENTS.md structure, file integrity               | Fix AGENTS.md formatting                      |
| `deps`         | Layer dependency boundaries, no forbidden imports | Remove the forbidden import, use allowed path |
| `docs`         | Documentation coverage meets threshold            | Add JSDoc or update docs for new exports      |
| `entropy`      | Code drift, dead code detection                   | Remove unused code                            |
| `security`     | Secrets, injection, XSS, weak crypto              | Fix the flagged pattern                       |
| `perf`         | Complexity thresholds, coupling, size budgets     | Reduce function complexity or split file      |
| `arch`         | Architecture constraints, baselines               | Fix layer violation (see architecture rules)  |
| `phase-gate`   | Spec-to-implementation mapping                    | Ensure implementation matches spec            |
| `traceability` | Requirement-to-code mapping                       | Link code to requirements                     |

To reproduce CI locally:

```bash
harness ci check
```

To inspect a specific failure:

```bash
# Just dependency checks
harness check-deps

# Just security
harness check-security

# Just architecture
harness check-deps  # arch violations show here
```

To get structured JSON output for scripting:

```bash
harness ci check --json | jq '.checks[] | select(.status == "fail")'
```

---

### 6. Asking Questions About the Codebase

The `ask_graph` MCP tool lets you query the codebase in natural language. Some examples:

| Question                                          | What You Learn                                        |
| ------------------------------------------------- | ----------------------------------------------------- |
| "What depends on the auth module?"                | Every file that imports from auth — your blast radius |
| "What tests cover the payment service?"           | Test files that exercise payment code                 |
| "What are the entry points to the API?"           | Route definitions, controllers, handlers              |
| "Which files change most frequently?"             | Churn hotspots — areas of high risk                   |
| "What is the dependency chain from CLI to types?" | How layers connect                                    |

If the graph is not built or is stale, rebuild it:

```bash
harness scan
```

---

### 7. Debugging a Failing Test

**The old way:** Read the stack trace, add console.log statements, rinse and repeat.

**The harness way:**

```
/harness:debugging
```

This provides systematic debugging with persistent state tracking:

1. **Captures the failure** — stack trace, error message, failing assertion
2. **Identifies the scope** — which files and functions are involved
3. **Tracks hypotheses** — what you've tried and what you've ruled out
4. **Validates the fix** — runs verification after each change to confirm the fix works

For understanding what your fix might affect:

```
/harness:impact-analysis
```

This prevents the classic "fix one test, break three others" problem by showing you the downstream consequences of your change.

---

### 8. Contributing to Documentation

**The old way:** Hope the docs are right, or don't bother updating them.

**The harness way:**

First, check if existing documentation has drifted from the code:

```
/harness:detect-doc-drift
```

This mechanically compares documentation against code and flags every mismatch — function signatures that changed, config options that were added, behaviors that were modified.

When you make a code change, harness CI checks documentation coverage. If you add a new export, endpoint, or public API, the `docs` check may require you to document it before merge.

---

## Architecture Awareness

Harness-managed projects define their architecture as machine-checkable rules in `harness.config.json`. Understanding these rules prevents wasted time on changes that will be rejected.

### Layer Boundaries

Most harness projects define layers with one-way dependencies. For example:

```
types --> graph --> core --> cli
```

Each layer can only import from layers to its left. `cli` can import from `core`, `graph`, and `types`. `types` cannot import from anything. This is enforced mechanically — if you add an import that violates a boundary, the pre-commit hook and CI will reject it.

### Checking Architecture Rules

```
/harness:enforce-architecture
```

This does three things:

1. **Validates** — Checks all imports against the allowed dependency rules
2. **Reports** — Shows every violation with file, line, and the rule it breaks
3. **Auto-fixes** — Offers to rewrite imports to use the correct path

### Where Rules Are Defined

The architecture rules live in `harness.config.json`:

- **layers** — The ordered list of architectural layers
- **allowedDependencies** — Which layers can import from which
- **forbiddenImports** — Specific import patterns that are never allowed

The pre-commit hook runs architecture checks automatically, so violations are caught before they reach CI.

---

## Understanding CI Checks

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

### Reproducing CI Locally

Always run checks locally before pushing:

```bash
# Run everything
harness ci check

# Run just the checks that block merge
harness check-deps
harness check-security
harness validate
```

### Exit Codes

| Code | Meaning                   | Action      |
| ---- | ------------------------- | ----------- |
| `0`  | All checks passed         | Proceed     |
| `1`  | One or more checks failed | Block merge |
| `2`  | Harness internal error    | Investigate |

---

## Your First Week

### Day 1: Orient

- Install harness CLI and run `harness setup`
- Run `/harness:onboarding` to understand the project
- Run `harness scan` to build the knowledge graph
- Read AGENTS.md, harness.config.json, and .harness/learnings.md
- Use `ask_graph` to explore the architecture ("What are the main entry points?", "What depends on the database layer?")
- Run `/harness:verify` to confirm the project is healthy

### Day 2: Explore

- Pick a small task or bug to work on
- Run `/harness:impact-analysis` on the area you'll be changing
- Use `ask_graph` to understand the dependencies and test coverage around your target files
- Read the relevant tests to understand expected behavior
- Read .harness/state.json to understand what phase the project is in

### Day 3: Ship

- Make your change
- Run `/harness:verify` after each edit to catch issues immediately
- Run `/harness:test-advisor` to find which tests to run
- Write or update tests using `/harness:tdd`
- Run `/harness:enforce-architecture` to check for layer violations
- Self-review with `/harness:code-review` before opening a PR

### Day 4: Review

- Open your PR and watch CI results
- If CI fails, use `harness ci check` locally to reproduce and fix
- Review a teammate's PR using `/harness:code-review` to get structured analysis
- Use `/harness:impact-analysis` to understand the blast radius of their changes

### Day 5: Deepen

- Run `/harness:cleanup-dead-code` on a module you've been working in
- Run `/harness:detect-doc-drift` to see if docs match the code you've been reading
- Explore `harness skill run harness-integration-test` or `harness skill run harness-property-test` for more advanced testing
- Check docs/roadmap.md to understand what's planned and pick up your next task

---

## Example Projects

Harness includes example projects to practice with before touching production code:

| Example                      | Complexity   | Time   | What You Learn                                              |
| ---------------------------- | ------------ | ------ | ----------------------------------------------------------- |
| `examples/hello-world/`      | Basic        | 5 min  | Minimal harness setup, running verify, basic structure      |
| `examples/task-api/`         | Intermediate | 15 min | Realistic patterns, layer boundaries, test-first workflow   |
| `examples/multi-tenant-api/` | Advanced     | 30 min | Full constraints, architecture enforcement, impact analysis |

Start with `hello-world` to see harness in action, then move to `task-api` for a realistic feel. Use `multi-tenant-api` when you want to see every feature working together.

---

## Quick Reference Card

### "I need to..." -- Use this

| I Need To...                     | Command / Tool                                       | Type                |
| -------------------------------- | ---------------------------------------------------- | ------------------- |
| Onboard to a new project         | `/harness:onboarding`                                | Slash command       |
| Understand the architecture      | `ask_graph` (MCP tool)                               | MCP tool            |
| See what my change might break   | `/harness:impact-analysis`                           | Slash command       |
| Run all checks after a change    | `/harness:verify` or `harness ci check`              | Slash command / CLI |
| Know which tests to run          | `/harness:test-advisor`                              | Slash command       |
| Write tests first                | `/harness:tdd`                                       | Slash command       |
| Self-review before a PR          | `/harness:code-review`                               | Slash command       |
| Full pre-PR gate                 | `/harness:integrity`                                 | Slash command       |
| Check layer boundaries           | `/harness:enforce-architecture`                      | Slash command       |
| Debug a tricky issue             | `/harness:debugging`                                 | Slash command       |
| Check for security issues        | `/harness:security-scan` or `harness check-security` | Slash command / CLI |
| Remove dead code                 | `/harness:cleanup-dead-code`                         | Slash command       |
| Check if docs match code         | `/harness:detect-doc-drift`                          | Slash command       |
| Write E2E tests                  | `harness skill run harness-e2e`                      | Domain skill        |
| Write integration tests          | `harness skill run harness-integration-test`         | Domain skill        |
| Write property-based tests       | `harness skill run harness-property-test`            | Domain skill        |
| Build the knowledge graph        | `harness scan`                                       | CLI                 |
| Ask questions about the codebase | `ask_graph` (MCP tool)                               | MCP tool            |

### Key Files to Know

| File                    | Purpose                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `AGENTS.md`             | The project's "README for AI agents" — architecture, conventions, constraints |
| `harness.config.json`   | All rules and constraints — layers, dependencies, thresholds                  |
| `.harness/learnings.md` | Hard-won lessons from the team — gotchas, edge cases, pitfalls                |
| `.harness/state.json`   | Current phase and task context                                                |
| `docs/roadmap.md`       | What's planned and in progress                                                |

---

## FAQ

### I just joined the project. What should I do first?

Run `/harness:onboarding`. It reads the project configuration, maps the architecture, determines the adoption level, and gives you a structured summary with concrete getting-started steps. Then run `harness scan` to build the knowledge graph.

### Do I need to memorize all these commands?

No. Start with three: `/harness:onboarding` (day one), `/harness:verify` (after every change), and `/harness:code-review` (before every PR). Add more as you get comfortable. You can also just describe what you need to your AI agent — "check if my change breaks anything" — and it will suggest the right harness command.

### What if I violate an architecture rule?

The pre-commit hook catches it before you can commit. If you need to understand why an import is forbidden, check `harness.config.json` for the layer definitions and allowed dependencies. Run `/harness:enforce-architecture` to see all violations and get auto-fix suggestions.

### How does the knowledge graph work without running `harness scan`?

Many features fall back to simpler strategies: filename convention matching (`auth.ts` -> `auth.test.ts`), import parsing, and git co-change analysis. This covers roughly 80% of what the full graph provides. Run `harness scan` to get the remaining 20% — transitive dependencies, structural queries, and accurate blast radius estimation.

### Can I use harness with any programming language?

The core validation and CLI work with any language. Testing skills have specific framework support:

- **TypeScript/JavaScript**: Full support (Vitest, Jest, Playwright, Cypress, Stryker, k6, fast-check)
- **Python**: mutmut, hypothesis, pytest, Artillery
- **Java/Kotlin**: PIT, JUnit, Gatling, Spring Cloud Contract
- **Go, Rust, C#**: Supported with language-specific tooling

### What if `/harness:verify` fails?

Read the output. It tells you exactly which check failed (typecheck, lint, or test) and the specific error. Fix the issue and run `/harness:verify` again. This is the inner loop of harness development — change, verify, fix, verify.

### How is `/harness:verify` different from `/harness:integrity`?

`/harness:verify` is fast — it runs mechanical checks only (typecheck, lint, test) and gives you a binary pass/fail. Use it after every change. `/harness:integrity` is comprehensive — it chains verification with a full AI-powered code review. Use it as a final gate before opening a PR.

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

### How do I know what the team has learned the hard way?

Read `.harness/learnings.md`. This file captures gotchas, edge cases, and pitfalls that the team has encountered. It is updated as new lessons are learned. The onboarding skill reads this file automatically and includes relevant lessons in its summary.

### Where do I find what's currently being worked on?

Check `.harness/state.json` for the current phase and task context, and `docs/roadmap.md` for the broader project plan. The onboarding skill surfaces both of these during orientation.

---

## Summary

Harness Engineering gives new developers a **fast path to productivity**. Instead of spending days reading code, asking questions, and making tentative changes:

1. **Onboard in minutes** — `/harness:onboarding` gives you a structured orientation with architecture, conventions, and getting-started steps
2. **Explore with confidence** — `ask_graph` and `/harness:impact-analysis` let you understand the codebase without reading every file
3. **Change safely** — `/harness:verify` and `/harness:enforce-architecture` catch mistakes immediately after every edit
4. **Test intelligently** — `/harness:test-advisor` tells you exactly which tests to run, and `/harness:tdd` guides you through writing new ones
5. **Self-review before others see it** — `/harness:code-review` catches bugs, security issues, and architectural violations in a structured pipeline
6. **Understand failures** — `harness ci check` reproduces CI locally with clear, actionable output

The goal isn't to add process to your workflow. It's to give you the **context and confidence** to ship quality code from day one.
