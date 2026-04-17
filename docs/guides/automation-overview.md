# Automation Overview

Harness Engineering provides a stable CLI interface for integrating validation, entropy detection, and agent workflows into automated pipelines. This guide covers three integration surfaces:

1. **CI/CD Validation** — Run harness checks before merge
2. **Issue Tracker Integration** — Bidirectional flows between harness and GitHub Issues / Jira
3. **Headless Agent Execution** — Run skills and personas in CI without a human in the loop

## Integration Surface

### CLI Contract

All CI automation flows through three commands:

| Command             | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `harness ci check`  | Run all harness checks, return structured results |
| `harness ci init`   | Generate CI config for your platform              |
| `harness ci notify` | Post CI results to GitHub (PR comment or issue)   |

### `harness ci check`

```bash
harness ci check [--json] [--fail-on <severity>] [--skip <check>]
```

**Checks run:**

| Check        | What it validates                      |
| ------------ | -------------------------------------- |
| `validate`   | AGENTS.md structure and link integrity |
| `deps`       | Layer dependency boundaries            |
| `docs`       | Documentation coverage gaps            |
| `entropy`    | Code drift and dead code               |
| `phase-gate` | Spec-to-implementation mapping         |

**Exit codes:**

| Code | Meaning                   |
| ---- | ------------------------- |
| `0`  | All checks passed         |
| `1`  | One or more checks failed |
| `2`  | Harness internal error    |

**JSON output:** When `--json` is passed, the command outputs a `CICheckReport` object:

```json
{
  "version": 1,
  "project": "my-project",
  "timestamp": "2026-03-17T10:00:00.000Z",
  "checks": [
    {
      "name": "validate",
      "status": "pass",
      "issues": [],
      "durationMs": 42
    }
  ],
  "summary": {
    "total": 5,
    "passed": 5,
    "failed": 0,
    "warnings": 0,
    "skipped": 0
  },
  "exitCode": 0
}
```

### `harness ci init`

```bash
harness ci init [--platform <github|gitlab|generic>] [--checks <list>]
```

Auto-detects your CI platform from the repo (`.github/` → GitHub Actions, `.gitlab-ci.yml` → GitLab) and generates a ready-to-commit config file.

## Quick Start

```bash
# 1. Install
npm install -g @harness-engineering/cli

# 2. Generate CI config
harness ci init

# 3. Commit the generated workflow file
git add .github/workflows/harness.yml
git commit -m "ci: add harness checks"
```

## Guides

- [CI/CD Validation](./ci-cd-validation.md) — Wiring harness checks into CI pipelines
- [Issue Tracker Integration](./issue-tracker-integration.md) — Bidirectional flows with GitHub Issues and Jira
- [Headless Agents](./headless-agents.md) — Running skills and personas without a human in the loop

## Recipes

Copy-paste-ready configuration files:

| Recipe                                                             | Description                                         |
| ------------------------------------------------------------------ | --------------------------------------------------- |
| [github-actions-harness.yml](./recipes/github-actions-harness.yml) | GitHub Actions workflow with PR comments and labels |
| [gitlab-ci-harness.yml](./recipes/gitlab-ci-harness.yml)           | GitLab CI job configuration                         |
| [ci-check-script.sh](./recipes/ci-check-script.sh)                 | Platform-agnostic shell script                      |
| [github-issue-webhook.ts](./recipes/github-issue-webhook.ts)       | Node.js handler: harness results → GitHub Issues    |
| [jira-automation-rules.md](./recipes/jira-automation-rules.md)     | Jira automation rules for issue ↔ harness flows     |
| [headless-agent-action.yml](./recipes/headless-agent-action.yml)   | GitHub Action for running harness agents headlessly |

## Future Direction: Webhook Service

A lightweight webhook service is planned but not yet built. When implemented, it would:

- Deploy as a serverless function (Vercel, AWS Lambda, CloudFlare Workers)
- Listen for GitHub/Jira webhook events and trigger harness workflows automatically
- Post results back as PR comments and status checks
- Ship as `@harness-engineering/webhook` or a deployable template

This is deferred until adoption demand warrants the infrastructure. The patterns documented in the [Issue Tracker Integration](./issue-tracker-integration.md) guide achieve the same flows today using CI triggers and scripts.
