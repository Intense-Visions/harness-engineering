# Harness Engineering for DevOps: Quickstart Guide

**Enforce architecture, performance, and security constraints mechanically in every pipeline run.**

This guide is written for DevOps engineers, platform engineers, SREs, and CI/CD specialists who want to integrate Harness Engineering into their pipelines and infrastructure. It covers what harness enforces, how to wire it into CI, which checks map to which concerns, and how to build a repeatable, high-confidence delivery pipeline.

---

## Table of Contents

1. [What Is Harness Engineering?](#what-is-harness-engineering)
2. [Why DevOps Should Care](#why-devops-should-care)
3. [Getting Started (5 Minutes)](#getting-started-5-minutes)
4. [The DevOps Toolkit at a Glance](#the-devops-toolkit-at-a-glance)
5. [Day-to-Day DevOps Workflows](#day-to-day-devops-workflows)
   - [Setting Up CI Checks for a New Project](#1-setting-up-ci-checks-for-a-new-project)
   - [Adding Architecture Enforcement to the Pipeline](#2-adding-architecture-enforcement-to-the-pipeline)
   - [Configuring Performance Budgets](#3-configuring-performance-budgets)
   - [Setting Up Security Gates](#4-setting-up-security-gates)
   - [Monitoring Architecture Health Over Time](#5-monitoring-architecture-health-over-time)
   - [Handling Baseline Updates After Intentional Changes](#6-handling-baseline-updates-after-intentional-changes)
   - [Automating with Personas and Schedules](#7-automating-with-personas-and-schedules)
   - [Debugging CI Failures](#8-debugging-ci-failures)
6. [GitHub Actions Example](#github-actions-example)
7. [Improving Over Time](#improving-over-time)
8. [Quick Reference Card](#quick-reference-card)
9. [FAQ](#faq)

---

## What Is Harness Engineering?

Harness Engineering is a toolkit that makes AI coding agents reliable through **mechanical enforcement**. Instead of relying on prompts, conventions, and hope, harness encodes your project's architectural decisions, quality standards, and security requirements as machine-checkable constraints. Every rule is validated on every change.

For DevOps and platform engineers, this means:

- **A single CI command** that runs 9 checks in one pass — architecture, security, performance, dependencies, and more
- **Architecture baselines** that detect regressions automatically — no manual review needed
- **Performance budgets** with tiered enforcement — block commits, block merges, or inform
- **Security gates** with mechanical scanning — secrets, injection, XSS, weak crypto, supply chain risk
- **Dependency health** validation — layer boundaries, forbidden imports, circular dependency detection
- **Machine-readable output** for integration with any CI platform, dashboard, or notification system

Harness operates through **CLI commands** for pipelines and scripts, **slash commands** (e.g., `/harness:enforce-architecture`) in your AI coding tool, and **MCP tools** for programmatic automation.

---

## Why DevOps Should Care

| Traditional Pipeline Pain Point                         | How Harness Solves It                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| "Architecture rules exist in a wiki nobody reads"       | `harness check-arch` validates against machine-readable baselines on every commit — violations fail the build       |
| "Performance regressions sneak in over dozens of PRs"   | `harness check-perf` enforces complexity, coupling, and size budgets with tiered blocking                           |
| "Security scanning is a separate tool we bolt on later" | `harness check-security` is built in — secrets, injection, XSS, supply chain — one command, zero extra config       |
| "We don't know if dependencies violate layer rules"     | `harness check-deps` validates layer boundaries and forbidden imports mechanically on every change                  |
| "CI checks are all-or-nothing — we can't phase in"      | `--skip`, `--failOn`, and per-check severity let you adopt incrementally without blocking the whole team            |
| "Every project wires up CI differently"                 | `harness ci init --platform github` generates a ready-to-commit workflow file — consistent across all projects      |
| "We have no way to track architectural drift over time" | Baselines in `.harness/arch/baselines.json` and `.harness/perf/baselines.json` create a versioned historical record |
| "Alert fatigue from noisy linters and scanners"         | Tier system separates must-fix (block commit) from should-fix (block merge) from informational (log only)           |
| "Scheduled maintenance tasks fall through the cracks"   | Personas like `entropy-cleaner` and `graph-maintainer` run on cron schedules automatically                          |

---

## Getting Started (5 Minutes)

### Prerequisites

- Node.js 22+
- Git
- A CI platform (GitHub Actions, GitLab CI, or any generic runner)

### Install

```bash
npm install -g @harness-engineering/cli
harness setup
```

This installs the CLI and configures slash commands, MCP server, and agent personas for your detected AI clients.

### Initialize Your Project

If your project does not use harness yet:

```bash
harness ci init --platform github
```

This generates a CI config file tailored to your platform. For GitLab or generic runners:

```bash
harness ci init --platform gitlab
harness ci init --platform generic
```

### Run Your First Check

```bash
harness ci check
```

This runs all 9 checks in one pass. You will see a pass/fail summary for each:

| Check          | What It Validates                                 |
| -------------- | ------------------------------------------------- |
| `validate`     | AGENTS.md structure, file integrity               |
| `deps`         | Layer dependency boundaries, no forbidden imports |
| `docs`         | Documentation coverage meets threshold            |
| `entropy`      | Code drift, dead code detection                   |
| `security`     | Secrets, injection, XSS, weak crypto              |
| `perf`         | Complexity thresholds, coupling, size budgets     |
| `phase-gate`   | Spec-to-implementation mapping                    |
| `arch`         | Architecture constraints, baselines               |
| `traceability` | Requirement-to-code mapping                       |

### Exit Codes

| Code | Meaning                   | Action          |
| ---- | ------------------------- | --------------- |
| `0`  | All checks passed         | Proceed         |
| `1`  | One or more checks failed | Block the merge |
| `2`  | Harness internal error    | Investigate     |

---

## The DevOps Toolkit at a Glance

### CLI Commands

| Command                        | What It Does                                             |
| ------------------------------ | -------------------------------------------------------- |
| `harness ci check`             | Run ALL 9 checks in one pass                             |
| `harness ci check --json`      | Same, with machine-readable JSON output                  |
| `harness ci check --skip X,Y`  | Skip specific checks (e.g., `--skip entropy,phase-gate`) |
| `harness ci check --failOn X`  | Set failure threshold: `error` (default) or `warning`    |
| `harness ci init --platform X` | Generate CI config for `github`, `gitlab`, or `generic`  |
| `harness check-arch`           | Architecture baseline validation only                    |
| `harness check-perf`           | Performance budget enforcement only                      |
| `harness check-security`       | Security scanning only                                   |
| `harness check-deps`           | Dependency and layer boundary validation only            |
| `harness check-docs`           | Documentation coverage check only                        |
| `harness validate`             | Configuration and structure validation only              |
| `harness scan`                 | Build/refresh the knowledge graph                        |
| `harness perf bench`           | Run performance benchmarks                               |
| `harness perf baselines`       | Manage performance baselines                             |

### Configuration (`harness.config.json`)

The central configuration file controls all enforcement behavior:

```json
{
  "layers": [
    {
      "name": "domain",
      "pattern": "src/domain/**",
      "allowedDependencies": []
    },
    {
      "name": "services",
      "pattern": "src/services/**",
      "allowedDependencies": ["domain"]
    },
    {
      "name": "api",
      "pattern": "src/api/**",
      "allowedDependencies": ["services", "domain"]
    }
  ],
  "forbiddenImports": [
    {
      "from": "src/domain/**",
      "disallow": ["src/api/**", "src/services/**"],
      "message": "Domain layer must not depend on API or service layer"
    }
  ],
  "architecture": {
    "enabled": true,
    "baselinePath": ".harness/arch/baselines.json",
    "thresholds": {
      "circular-deps": 0,
      "complexity": 20,
      "coupling": { "fanIn": 15, "fanOut": 10 },
      "module-size": 500,
      "dependency-depth": 5,
      "layer-violations": 0,
      "forbidden-imports": 0
    }
  },
  "performance": {
    "complexity": 20,
    "coupling": { "fanIn": 15, "fanOut": 10 }
  },
  "security": {
    "enabled": true,
    "strict": false,
    "rules": ["secrets", "injection", "xss", "weak-crypto", "path-traversal"],
    "exclude": ["tests/**", "scripts/**"]
  }
}
```

### Personas for Automation

Personas are pre-configured agents that run on triggers — PR events, commits, or cron schedules:

| Persona                 | Triggers                                   | What It Does                                       |
| ----------------------- | ------------------------------------------ | -------------------------------------------------- |
| `architecture-enforcer` | `on_pr`, `on_commit`, scheduled (Mon 6 AM) | Validates architecture baselines, flags violations |
| `performance-guardian`  | `on_pr`, scheduled                         | Enforces performance budgets, detects regressions  |
| `security-reviewer`     | `on_pr`, manual                            | Runs security scans, flags vulnerabilities         |
| `entropy-cleaner`       | scheduled                                  | Detects dead code, drift, and entropy accumulation |
| `graph-maintainer`      | scheduled                                  | Rebuilds the knowledge graph, updates indexes      |

### MCP Tools for Programmatic Access

| MCP Tool                  | What It Does                                         |
| ------------------------- | ---------------------------------------------------- |
| `check_dependencies()`    | Validate layer boundaries programmatically           |
| `check_performance()`     | Run performance checks and return structured results |
| `assess_project()`        | Full project health assessment                       |
| `predict_failures()`      | Forecast which constraints are likely to break next  |
| `detect_anomalies()`      | Find structural outliers via z-score analysis        |
| `get_perf_baselines()`    | Retrieve current performance baselines               |
| `update_perf_baselines()` | Update baselines after intentional changes           |

---

## Day-to-Day DevOps Workflows

### 1. Setting Up CI Checks for a New Project

**The old way:** Manually write CI config, copy linter configs from another project, hope you remembered all the checks.

**The harness way:**

```bash
# Generate the CI workflow file
harness ci init --platform github

# Run locally to verify it works
harness ci check

# Commit the generated config
git add .github/workflows/harness.yml .harness/ harness.config.json
git commit -m "ci: add harness engineering checks"
```

The generated workflow runs checks on push to main and on pull requests. It posts a summary comment on the PR and labels it on failure.

**Start permissive, tighten over time:**

```bash
# Week 1: Only fail on errors, skip checks you haven't configured yet
harness ci check --failOn error --skip entropy,phase-gate,traceability

# Week 2: Enable more checks
harness ci check --failOn error --skip phase-gate

# Week 4: Full enforcement
harness ci check --failOn warning
```

---

### 2. Adding Architecture Enforcement to the Pipeline

Architecture rules are only useful if they are enforced mechanically. `harness check-arch` validates your codebase against baselines stored in `.harness/arch/baselines.json`.

**Step 1: Capture the current state as a baseline.**

```bash
harness check-arch --update-baseline
```

This writes the current values for all architecture metrics to `.harness/arch/baselines.json`. Commit this file — it is the starting point.

**Step 2: Configure thresholds in `harness.config.json`.**

```json
{
  "architecture": {
    "enabled": true,
    "baselinePath": ".harness/arch/baselines.json",
    "thresholds": {
      "circular-deps": 0,
      "complexity": 20,
      "coupling": { "fanIn": 15, "fanOut": 10 },
      "module-size": 500,
      "dependency-depth": 5,
      "layer-violations": 0,
      "forbidden-imports": 0
    }
  }
}
```

**Step 3: Add to CI.**

```bash
harness check-arch
```

**How regression detection works:** On every run, harness compares the current metric values against the baselines. If any new value exceeds its baseline value, the check fails. This means the codebase can only get better — never worse — unless someone explicitly updates the baseline.

**Scoped checks for monorepos:**

```bash
# Check a specific module only
harness check-arch --module src/payments

# Check a different module
harness check-arch --module src/auth
```

---

### 3. Configuring Performance Budgets

Performance budgets prevent complexity and coupling from creeping up over time. `harness check-perf` enforces structural thresholds with a 3-tier system.

**Tier system:**

| Tier   | Enforcement   | When It Fires                                  |
| ------ | ------------- | ---------------------------------------------- |
| Tier 1 | Block commit  | Critical violations — must fix before pushing  |
| Tier 2 | Block merge   | Important violations — must fix before merging |
| Tier 3 | Informational | Suggestions — logged but never blocks          |

**Run specific performance checks:**

```bash
# Full check (complexity + coupling + size budgets)
harness check-perf

# Complexity thresholds only
harness check-perf --structural

# Coupling metrics only
harness check-perf --coupling

# Size budgets only
harness check-perf --size
```

**Manage benchmarks and baselines:**

```bash
# Run benchmarks
harness perf bench

# View current baselines
harness perf baselines

# Update baselines after intentional changes
harness perf baselines --update
```

Baselines are stored in `.harness/perf/baselines.json`. Commit this file to track performance over time.

**Critical path detection:** Annotate performance-sensitive code with `@perf-critical` and harness will apply stricter thresholds to those paths:

```typescript
/** @perf-critical */
export function processPayment(order: Order): Result {
  // This function gets tighter complexity and coupling limits
}
```

---

### 4. Setting Up Security Gates

`harness check-security` performs mechanical scanning for common vulnerability patterns. It is fast, deterministic, and requires zero external services.

**Basic usage:**

```bash
# Full project scan
harness check-security

# Incremental scan — changed files only (faster, ideal for CI on PRs)
harness check-security --changed-only

# Set severity threshold
harness check-security --severity warning
```

**What it scans for:**

- Secrets: API keys, tokens, passwords in source code
- Injection: SQL injection, command injection, eval/Function
- XSS: innerHTML, dangerouslySetInnerHTML, document.write
- Cryptography: Weak hashing, hardcoded keys
- Path traversal: Directory traversal in file operations
- Network: CORS wildcards, disabled TLS, hardcoded HTTP
- Agent config: Unicode detection, wildcard permissions, auto-approve risks
- MCP server: Hardcoded secrets, shell injection, typosquatting

**Strict mode** promotes all warnings to errors — nothing slips through:

```json
{
  "security": {
    "enabled": true,
    "strict": true,
    "rules": ["secrets", "injection", "xss", "weak-crypto", "path-traversal"],
    "exclude": ["tests/**", "fixtures/**"]
  }
}
```

**Supply chain auditing** evaluates dependency risk across 6 factors:

```bash
harness skill run harness-supply-chain-audit
```

This checks for: maintainer risk, known vulnerabilities, install scripts, excessive permissions, typosquatting, and version pinning issues.

---

### 5. Monitoring Architecture Health Over Time

Architecture enforcement is not a one-time check. It is a continuous process. Harness supports this through baselines, scheduled personas, and graph-based analysis.

**Dependency health checks:**

```bash
harness check-deps
```

This validates:

- **Layer boundaries** — no imports crossing forbidden layer lines
- **Forbidden imports** — specific import paths that are disallowed (configured in `harness.config.json`)
- **Circular dependencies** — no circular import chains

**Scheduled monitoring with personas:**

The `architecture-enforcer` persona runs automatically:

- **On every PR** — catches violations before merge
- **On every commit to main** — catches violations that slipped through
- **Weekly (Monday 6 AM)** — full sweep for drift that accumulated over the week

The `graph-maintainer` persona rebuilds the knowledge graph on a schedule, keeping all graph-based analysis current.

**Graph-based health queries:**

```
/harness:dependency-health
```

Or programmatically via MCP:

```
detect_anomalies()    — find structural outliers via z-score analysis
predict_failures()    — forecast which constraints will break next
assess_project()      — full project health assessment
```

---

### 6. Handling Baseline Updates After Intentional Changes

Sometimes architecture or performance metrics change intentionally — a refactor adds a new layer, a feature increases module size, a migration adds temporary complexity. When this happens, baselines need to be updated.

**Architecture baselines:**

```bash
# Update after an intentional architectural change
harness check-arch --update-baseline

# Review the diff
git diff .harness/arch/baselines.json

# Commit with an explanation
git add .harness/arch/baselines.json
git commit -m "chore: update arch baseline for payment module extraction"
```

**Performance baselines:**

```bash
# Update after a performance-impacting change
harness perf baselines --update

# Or via MCP
# update_perf_baselines()

git add .harness/perf/baselines.json
git commit -m "chore: update perf baseline for new caching layer"
```

**Best practices for baseline updates:**

- Always commit baseline updates in a **separate commit** from the code change — this makes the history auditable
- Include a clear commit message explaining **why** the baseline changed
- Review the diff before committing — a baseline that jumped from 3 circular deps to 12 needs investigation, not acceptance
- Use PR review to gate baseline updates — require approval from a senior engineer or architect

---

### 7. Automating with Personas and Schedules

Personas are pre-configured agents that combine specific checks, triggers, and behaviors. They run automatically without human intervention.

**Available personas:**

```bash
# List all configured personas
harness list-personas
```

**Persona trigger types:**

| Trigger     | When It Runs                                  | Example                                      |
| ----------- | --------------------------------------------- | -------------------------------------------- |
| `on_pr`     | When a pull request is opened or updated      | `architecture-enforcer` validates baselines  |
| `on_commit` | When a commit is pushed to a protected branch | `architecture-enforcer` checks main          |
| `scheduled` | On a cron schedule                            | `entropy-cleaner` runs weekly                |
| `manual`    | Triggered explicitly by a human               | `security-reviewer` for deep security audits |

**Example automation setup:**

- **architecture-enforcer** on every PR + weekly Monday 6 AM sweep
- **performance-guardian** on every PR + weekly trending report
- **security-reviewer** on every PR + manual deep audit before releases
- **entropy-cleaner** weekly — flags dead code and drift
- **graph-maintainer** nightly — keeps the knowledge graph fresh

**Running a persona manually:**

```
/harness:enforce-architecture
```

Or via CLI:

```bash
harness skill run harness-enforce-architecture
```

---

### 8. Debugging CI Failures

When `harness ci check` fails in CI, here is how to diagnose and fix.

**Step 1: Get structured output.**

```bash
harness ci check --json
```

**Step 2: Identify the failing check.**

```bash
# List all failing checks
harness ci check --json | jq '.checks[] | select(.status == "fail")'

# Get all error-level issues
harness ci check --json | jq '[.checks[].issues[] | select(.severity == "error")]'

# Get just the summary
harness ci check --json | jq '.summary'
```

**Step 3: Run the failing check independently.**

```bash
# If arch failed
harness check-arch

# If security failed
harness check-security

# If deps failed
harness check-deps

# If perf failed
harness check-perf
```

Each standalone check provides more detailed output than the combined `ci check` summary.

**Step 4: Fix or update baselines.**

- If the violation is a real regression, fix the code.
- If the change was intentional, update the baseline (see [Handling Baseline Updates](#6-handling-baseline-updates-after-intentional-changes)).
- If the check is too strict for your current stage, adjust thresholds in `harness.config.json` or use `--skip` temporarily.

**Common failure patterns:**

| Failure                        | Likely Cause                                          | Fix                                                      |
| ------------------------------ | ----------------------------------------------------- | -------------------------------------------------------- |
| `arch: circular-deps exceeded` | New circular import chain introduced                  | Refactor to break the cycle or update baseline           |
| `security: secrets detected`   | API key or token committed to source                  | Remove the secret, use environment variables             |
| `deps: layer violation`        | Import crosses a forbidden boundary                   | Move the import or update layer config                   |
| `perf: complexity exceeded`    | Function or module grew past threshold                | Extract logic into smaller functions or update threshold |
| `validate: structure invalid`  | Missing or malformed AGENTS.md or config              | Run `harness validate` for details, fix the structure    |
| `perf: coupling exceeded`      | Too many inbound or outbound dependencies on a module | Introduce an interface or facade to reduce coupling      |

---

## GitHub Actions Example

### Generated Workflow

`harness ci init --platform github` generates a workflow like this:

```yaml
name: Harness Engineering Checks

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  harness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install Harness CLI
        run: npm install -g @harness-engineering/cli

      - name: Run all checks
        run: harness ci check --json > harness-results.json

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: harness-results
          path: harness-results.json
```

### Advanced: Separate Jobs per Check

For faster feedback and parallel execution, split checks into separate jobs:

```yaml
name: Harness Engineering Checks

on:
  pull_request:
    branches: [main]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm install -g @harness-engineering/cli
      - run: harness check-security --changed-only

  architecture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm install -g @harness-engineering/cli
      - run: harness check-arch

  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm install -g @harness-engineering/cli
      - run: harness check-perf

  dependencies:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm install -g @harness-engineering/cli
      - run: harness check-deps
```

### Posting Results as PR Comments

```yaml
- name: Run checks and comment
  run: |
    harness ci check --json > results.json
    EXIT_CODE=$?
    # Post summary as PR comment using gh CLI
    SUMMARY=$(cat results.json | jq -r '.summary')
    gh pr comment ${{ github.event.pull_request.number }} --body "$SUMMARY"
    exit $EXIT_CODE
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Improving Over Time

### Week 1: Foundation

- Install harness CLI and run `harness setup`
- Run `harness ci init --platform github` to generate CI config
- Run `harness ci check` locally to see the current state
- Capture initial baselines: `harness check-arch --update-baseline`
- Start with permissive settings: `--failOn error --skip entropy,phase-gate,traceability`
- Commit `.harness/` directory and `harness.config.json`

### Week 2: Architecture and Dependencies

- Configure layers and forbidden imports in `harness.config.json`
- Enable `harness check-deps` in CI (remove from `--skip` list)
- Enable `harness check-arch` with baselines
- Set up the `architecture-enforcer` persona to run on PRs
- Run `harness scan` to build the knowledge graph

### Week 3: Performance and Security

- Configure performance thresholds in `harness.config.json`
- Enable `harness check-perf` in CI
- Enable `harness check-security` — use `--changed-only` for PR checks
- Run a full security scan to establish a baseline: `harness check-security`
- Set up the `performance-guardian` and `security-reviewer` personas
- Annotate critical paths with `@perf-critical`

### Week 4: Full Enforcement and Automation

- Remove all `--skip` flags — enable all 9 checks
- Consider switching to `--failOn warning` for stricter enforcement
- Enable `entropy-cleaner` on a weekly schedule
- Enable `graph-maintainer` on a nightly schedule
- Run `harness skill run harness-supply-chain-audit` for dependency risk
- Review and adjust thresholds based on the first month of data

### Ongoing: Continuous Improvement

- Review baseline diffs in PRs — treat them as architectural decisions
- Monitor `predict_failures()` output to fix constraints before they break
- Use `detect_anomalies()` to find structural outliers early
- Tighten thresholds quarterly as the codebase improves
- Run `/harness:dependency-health` monthly for a full structural report
- Use `/harness:hotspot-detector` to focus effort on high-risk areas

---

## Quick Reference Card

### "I need to..." -- Use this

| I Need To...                            | Command / Tool                                 | Type      |
| --------------------------------------- | ---------------------------------------------- | --------- |
| Run all CI checks in one pass           | `harness ci check`                             | CLI       |
| Get machine-readable CI output          | `harness ci check --json`                      | CLI       |
| Generate a CI workflow file             | `harness ci init --platform github`            | CLI       |
| Validate architecture against baselines | `harness check-arch`                           | CLI       |
| Update architecture baselines           | `harness check-arch --update-baseline`         | CLI       |
| Check a specific module's architecture  | `harness check-arch --module src/payments`     | CLI       |
| Enforce performance budgets             | `harness check-perf`                           | CLI       |
| Check structural complexity only        | `harness check-perf --structural`              | CLI       |
| Check coupling only                     | `harness check-perf --coupling`                | CLI       |
| Run performance benchmarks              | `harness perf bench`                           | CLI       |
| Manage performance baselines            | `harness perf baselines`                       | CLI       |
| Scan for security vulnerabilities       | `harness check-security`                       | CLI       |
| Scan only changed files                 | `harness check-security --changed-only`        | CLI       |
| Validate dependency boundaries          | `harness check-deps`                           | CLI       |
| Audit supply chain risk                 | `harness skill run harness-supply-chain-audit` | Skill     |
| Build the knowledge graph               | `harness scan`                                 | CLI       |
| Enforce architecture interactively      | `/harness:enforce-architecture`                | Slash cmd |
| Analyze structural health               | `/harness:dependency-health`                   | Slash cmd |
| Find high-risk areas                    | `/harness:hotspot-detector`                    | Slash cmd |
| Predict which constraints will break    | `predict_failures()` MCP tool                  | MCP       |
| Find structural outliers                | `detect_anomalies()` MCP tool                  | MCP       |
| Get a full project health assessment    | `assess_project()` MCP tool                    | MCP       |

### Exit Codes for CI

| Code | Meaning                   | Action      |
| ---- | ------------------------- | ----------- |
| `0`  | All checks passed         | Proceed     |
| `1`  | One or more checks failed | Block merge |
| `2`  | Harness internal error    | Investigate |

### CLI Flags Quick Reference

| Flag                 | Applies To       | What It Does                                |
| -------------------- | ---------------- | ------------------------------------------- |
| `--json`             | `ci check`       | Machine-readable JSON output                |
| `--skip X,Y`         | `ci check`       | Skip named checks                           |
| `--failOn error`     | `ci check`       | Only fail on errors (default)               |
| `--failOn warning`   | `ci check`       | Fail on warnings too (stricter)             |
| `--update-baseline`  | `check-arch`     | Capture current state as the new baseline   |
| `--module <path>`    | `check-arch`     | Scope check to a specific module            |
| `--structural`       | `check-perf`     | Complexity thresholds only                  |
| `--coupling`         | `check-perf`     | Coupling metrics only                       |
| `--size`             | `check-perf`     | Size budget checks only                     |
| `--changed-only`     | `check-security` | Scan only files changed in the current diff |
| `--severity <level>` | `check-security` | Set severity threshold for reporting        |

---

## FAQ

### Do I need an AI coding agent to use harness in CI?

No. The CLI commands (`harness ci check`, `harness check-arch`, etc.) run standalone without any AI agent. They are deterministic, fast, and designed for pipeline use. The AI agent integration (slash commands, personas) is for interactive development, not CI.

### How long does `harness ci check` take?

It depends on project size, but the checks are structural analysis — not compilation or test execution. For a typical project (50-200 files), expect 5-15 seconds for the full suite. Use `--skip` to drop checks you do not need, or split into parallel jobs for faster feedback.

### Can I use harness with GitLab CI, Jenkins, or other platforms?

Yes. `harness ci init --platform gitlab` generates GitLab CI config. `harness ci init --platform generic` generates a platform-agnostic script. For Jenkins, CircleCI, or any other runner, use the generic output or call `harness ci check` directly — the exit codes (0/1/2) work with any CI system.

### What if `check-arch` fails on code that was already there?

Capture the current state as a baseline first: `harness check-arch --update-baseline`. This records the current metric values. From that point forward, the check only fails on **regressions** — new violations beyond the baseline. Existing debt is grandfathered in.

### How do baselines prevent architectural drift?

Baselines create a ratchet. The current state is recorded in `.harness/arch/baselines.json`. On every check, harness compares the current value to the baseline. If the current value is worse (higher complexity, more circular deps, more layer violations), the check fails. The codebase can only improve or stay the same. To accept a regression, someone must explicitly update the baseline and commit it — making the decision visible and auditable.

### What is strict mode in security scanning?

Strict mode promotes all warnings to errors. Normally, some findings are reported as warnings (informational, low severity) and do not fail the build. With `"strict": true` in `harness.config.json`, every finding — regardless of severity — causes a failure. Use this for security-critical projects or before releases.

### How do I handle false positives from security scanning?

Configure exclusions in `harness.config.json`:

```json
{
  "security": {
    "exclude": ["tests/**", "fixtures/**", "scripts/**"],
    "rules": ["secrets", "injection", "xss"]
  }
}
```

The `exclude` array accepts glob patterns. You can also narrow the `rules` array to only the categories relevant to your project.

### What is the difference between `harness ci check` and running individual checks?

`harness ci check` runs all 9 checks in sequence and returns a unified summary. Individual checks (`harness check-arch`, `harness check-security`, etc.) run one check at a time and provide more detailed output. Use `ci check` in your pipeline for the gate; use individual checks locally for debugging.

### How do I integrate harness results into Slack, PagerDuty, or a dashboard?

Use `harness ci check --json` to get structured output. Pipe it to `jq` for extraction, or forward it to your observability stack:

```bash
# Extract summary for a Slack message
harness ci check --json | jq -r '.summary'

# Count failures by check
harness ci check --json | jq '[.checks[] | select(.status == "fail")] | length'

# Get all issues above a severity threshold
harness ci check --json | jq '[.checks[].issues[] | select(.severity == "error")]'
```

### Can I enforce different thresholds for different modules?

Use `harness check-arch --module <path>` to run scoped checks. Combined with separate CI jobs or workflow steps, you can enforce stricter thresholds on critical modules (payment, auth) and looser thresholds on less critical areas.

---

## Summary

Harness Engineering gives DevOps and platform engineers **mechanical enforcement for the constraints that matter most**. Instead of relying on manual review, tribal knowledge, and hope:

1. **One command for everything** -- `harness ci check` runs 9 checks in one pass with machine-readable output and clear exit codes
2. **Architecture as code** -- Baselines in `.harness/arch/baselines.json` create a ratchet that prevents regression without blocking adoption
3. **Performance budgets that scale** -- Tiered enforcement (block commit / block merge / info) lets you tighten standards as the codebase matures
4. **Security by default** -- Mechanical scanning on every change, strict mode for critical projects, supply chain auditing for dependencies
5. **Incremental adoption** -- `--skip`, `--failOn`, and per-check configuration let you start permissive and tighten over time
6. **Automation without maintenance** -- Personas run on triggers and schedules, keeping the codebase healthy without manual intervention

The goal is not to add more gates. It is to make the gates **mechanical, consistent, and fast** — so your pipeline enforces the standards your team already agreed on, every single time.
