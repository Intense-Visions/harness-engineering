# Automated CI/CD and Issue Tracker Integration

**Date:** 2026-03-17
**Status:** Draft
**Keywords:** CI/CD, GitHub Actions, GitLab, Jira, GitHub Issues, headless agents, automation, webhooks, validation pipeline, harness ci

## Overview

This spec defines documentation and tooling for integrating harness validation, entropy detection, and agent workflows into automated pipelines. It covers three concerns:

1. **CI/CD validation** — Running harness checks as part of build/deploy pipelines to catch constraint violations, documentation drift, and entropy before merge
2. **Issue tracker integration** — Bidirectional flows between harness and GitHub Issues / Jira: harness results create/update issues, and issue events trigger harness workflows
3. **Headless agent execution** — Running harness skills and personas in CI without a human in the loop

### Goals

- Adopters can add harness checks to any CI platform in under 10 minutes using `harness ci init`
- A single `harness ci check` command serves as the stable CI interface with structured JSON output and meaningful exit codes
- Documentation covers platform-agnostic patterns with GitHub Actions as the reference implementation
- Full-loop issue integration is documented with working recipes, even where manual wiring is required today
- Headless agent patterns are clearly distinguished from interactive workflows
- A future webhook service is outlined but explicitly deferred

### Non-Goals

- Building a GitHub App or hosted webhook service (documented as future direction only)
- Supporting specific CI platforms beyond the reference implementation — adopters adapt the patterns
- Replacing existing `harness validate` — `harness ci check` composes existing commands, not replaces them

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Modular docs + recipe book | Keeps each guide focused; recipes give copy-paste value; matches existing `docs/guides/` structure |
| 2 | Platform-agnostic patterns, GitHub Actions reference impl | Avoids maintaining configs for every CI platform; GitHub Actions matches the project's own CI |
| 3 | New `harness ci init` command | Generates CI config tailored to the project; reduces boilerplate and keeps generated configs in sync with CLI capabilities |
| 4 | New `harness ci check` command | Single stable entrypoint for CI; composes validate + check-deps + check-docs + entropy into one call with structured output and exit codes |
| 5 | Full-loop issue integration via documentation + recipes, not a service | Delivers the patterns now; avoids premature infrastructure before adoption demand exists |
| 6 | Headless and interactive agents documented separately | Different trust models and failure modes; conflating them would confuse adopters |
| 7 | Webhook service deferred as future direction | Documented as a roadmap item so the path is clear, but not built until adoption warrants it |

## Technical Design

### CLI Commands

#### `harness ci check`

```
harness ci check [--json] [--fail-on <severity>] [--skip <check>]
```

Composes existing checks into a single CI-oriented entrypoint:

| Check | Maps to | Default |
|-------|---------|---------|
| validate | `harness validate` | enabled |
| deps | `harness check-deps` | enabled |
| docs | `harness check-docs` | enabled |
| entropy | `harness detect-entropy` (via core) | enabled |
| phase-gate | `harness check-phase-gate` | enabled if configured |

**Behavior:**

- Runs all enabled checks, collects results
- `--json` outputs structured report (see JSON Output Schema below)
- `--fail-on error` (default) — exits non-zero only on errors. `--fail-on warning` — also fails on warnings
- `--skip entropy,docs` — skip specific checks
- Exit codes: `0` = pass, `1` = check failures, `2` = harness internal error

#### `harness ci init`

```
harness ci init [--platform <github|gitlab|generic>] [--checks <list>]
```

**Behavior:**

- Interactive by default, detects platform from repo (`.github/` → github, `.gitlab-ci.yml` → gitlab, else prompts)
- `--platform` skips detection for headless use
- Generates platform-specific config file:
  - GitHub Actions → `.github/workflows/harness.yml`
  - GitLab → `.gitlab-ci.yml` stage additions or standalone file
  - Generic → `harness-ci.sh` shell script
- Generated config calls `harness ci check --json` and handles output
- `--checks` overrides which checks to include

### JSON Output Schema

```typescript
interface CICheckReport {
  version: 1;
  project: string;
  timestamp: string;
  checks: Array<{
    name: string;           // "validate" | "deps" | "docs" | "entropy" | "phase-gate"
    status: "pass" | "fail" | "warn" | "skip";
    issues: Array<{
      severity: "error" | "warning";
      message: string;
      file?: string;
      line?: number;
    }>;
    durationMs: number;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
  exitCode: 0 | 1 | 2;
}
```

### Documentation Structure

```
docs/guides/
├── automation-overview.md          # Hub: integration surface, CLI contract, links
├── ci-cd-validation.md             # Wiring harness checks into CI pipelines
├── issue-tracker-integration.md    # Bidirectional issue flows (GitHub + Jira)
├── headless-agents.md              # Running skills/personas without human-in-the-loop
└── recipes/
    ├── github-actions-harness.yml  # Complete workflow file
    ├── gitlab-ci-harness.yml       # GitLab CI stage config
    ├── ci-check-script.sh          # Platform-agnostic shell script
    ├── github-issue-webhook.ts     # Node handler: harness → GitHub Issues
    ├── jira-automation-rules.md    # Jira automation config for issue → harness
    └── headless-agent-action.yml   # GitHub Action running harness agent headlessly
```

### Issue Tracker Integration Patterns

#### Harness → Issues (outbound)

| Trigger | Action | Recipe |
|---------|--------|--------|
| `harness ci check` fails in CI | Post summary comment on PR | GitHub Actions workflow + `gh` CLI |
| Entropy detected above threshold | Create issue with drift details | Webhook handler script (`github-issue-webhook.ts`) |
| Phase gate violation | Label PR with `needs-spec` / `needs-plan` | GitHub Actions workflow conditional |

#### Issues → Harness (inbound)

| Trigger | Action | Recipe |
|---------|--------|--------|
| Issue labeled `needs-spec` | Agent runs brainstorming skill, posts spec draft as comment | `headless-agent-action.yml` |
| Issue labeled `needs-plan` | Agent runs planning skill against linked spec | `headless-agent-action.yml` |
| PR comment `/harness check` | Runs `harness ci check`, replies with results | GitHub Actions `issue_comment` trigger |
| Jira issue transitions to "In Development" | Creates linked GitHub branch + harness state init | Jira automation rule + webhook |

### Headless Agent Execution

Patterns for running agents without interactive input:

- **Environment:** `CI=true` environment variable signals headless mode
- **Agent runtime:** `harness agent run --headless --skill <name> --context <file>` — reads context from file/stdin instead of conversation
- **Timeout and failure:** `--timeout 300` (seconds), non-zero exit on failure, results written to `--output <path>`
- **Secrets:** Document required env vars (API keys) and recommend CI secret management
- **Trust boundary:** Headless agents should only run read-only or pre-approved write operations; document a `--dry-run` flag for validation-only mode

### Implementation Location

```
packages/cli/src/commands/ci.ts        # harness ci check + harness ci init
packages/core/src/ci/                   # CI report builder, check orchestrator
packages/cli/src/templates/ci/          # Platform-specific config templates
```

Follows existing patterns:

- `Result<T, E>` for error handling
- `--json` flag convention already used by other commands
- Templates follow same pattern as `harness init` project scaffolding

## Success Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | `harness ci check` runs all enabled checks and returns structured JSON | Run with `--json`, verify schema matches `CICheckReport` |
| 2 | `harness ci check` exit codes are correct | Exit 0 on pass, 1 on failure, 2 on internal error |
| 3 | `harness ci init --platform github` generates a working Actions workflow | Generated file passes `actionlint`; runs successfully in a test repo |
| 4 | `harness ci init --platform gitlab` generates valid GitLab CI config | Valid YAML; stages reference `harness ci check` correctly |
| 5 | `harness ci init --platform generic` generates a runnable shell script | Script runs on bash/zsh, calls `harness ci check`, handles exit codes |
| 6 | All 6 documentation files exist in `docs/guides/` | Files present with all required sections |
| 7 | All 6 recipe files exist in `docs/guides/recipes/` | Files present and syntactically valid (YAML parses, TS compiles, shell passes `shellcheck`) |
| 8 | Automation overview links to all guides and recipes | No dead links |
| 9 | Issue tracker docs cover both directions (harness → issues, issues → harness) | Both tables documented with step-by-step setup |
| 10 | Headless agent patterns documented separately from interactive | Distinct guide with `CI=true`, `--headless`, timeout, dry-run covered |
| 11 | Future webhook service documented as roadmap item, not built | Section exists in automation overview; no webhook service code shipped |

## Implementation Order

| Phase | What | Depends on |
|-------|------|------------|
| 1 | `harness ci check` command — core orchestrator + JSON output + exit codes | Existing validate/check-deps/check-docs commands |
| 2 | Documentation — `automation-overview.md`, `ci-cd-validation.md` | Phase 1 |
| 3 | `harness ci init` command — platform detection + template generation | Phase 1 |
| 4 | Recipes — GitHub Actions YAML, GitLab CI YAML, shell script | Phases 1–3 |
| 5 | Documentation — `issue-tracker-integration.md` + issue recipes | Phase 4 |
| 6 | Documentation — `headless-agents.md` + headless agent recipe | Phase 1 |
| 7 | Future direction section in automation overview — webhook service roadmap | All prior phases |

## Future Direction: Webhook Service

Deferred until adoption warrants it. When built, this would be:

- A lightweight Node.js webhook handler, deployable as a serverless function (Vercel, AWS Lambda, CloudFlare Workers)
- Listens for GitHub/Jira webhook events
- Triggers harness workflows and posts results back
- Published as a separate `@harness-engineering/webhook` package or as a deployable template
- Could evolve into a GitHub App on the marketplace
