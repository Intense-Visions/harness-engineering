---
schemaVersion: 1
module: 'docs/guides/recipes'
sourceHash: 'c0a44bc96143c5c733c97db22e3151031a8ef8678d39ad7f7e2eb9a66c4ebf55'
compiledAt: '2026-08-28T01:22:08.583Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['ci-check-script.mjs', 'github-issue-webhook.ts']
---

## Summary

**`docs/guides/recipes`** is a collection of production-ready integration templates for wiring harness CI checks into developer workflows across three layers:

**Execution Layer** — Cross-platform CI scripts (`ci-check-script.mjs`, `ci-check-script.sh`) that invoke `harness ci check`, capture JSON reports, and handle non-zero exits. Both use argv arrays (not shell strings) for safe adoption by external repos.

**Notification Layer** — GitHub Actions (`github-actions-harness.yml`) and GitLab CI (`gitlab-ci-harness.yml`) workflows that run harness checks, parse reports, label PRs on failure, and post comments. The `github-issue-webhook.ts` module auto-creates GitHub issues for failed/warning checks with severity, file:line hints, and labels extracted from the report.

**Automation Layer** — `headless-agent-action.yml` triggers harness personas on GitHub labels or PR comments (`/harness check`), posting results as comments. Jira bidirectional flows (`jira-automation-rules.md`) sync Jira status transitions ↔ GitHub branches/PRs via Automation webhooks.

All recipes are portable templates designed for copying into adopter repos. They assume Node.js 22+, global harness CLI install, and standard CI platform env vars (GITHUB_TOKEN/GITHUB_REPOSITORY for GitHub; JIRA_URL/JIRA_TOKEN for Jira).

## Invariants

- Command-array safety: all harness invocations use execFileSync(harness, ['ci', 'check', ...]) argv array, never shell string interpolation, to prevent arbitrary code execution in adopted repos
- Non-zero exit handling: report is written before throwing; catch blocks capture stdout even on CLI exit non-zero, ensuring the report always exists for parsing
- Report JSON contract: must include version:1, exitCode, checks[] with {name, status, issues[], durationMs}, and summary with counts; status must be pass|fail|warn|skip
- GitHub issue labels: must include ['automated', 'harness', check.name] plus conditional 'entropy' for warn status to keep issues discoverable and tied to check type
- Env var routing: HARNESS_FAIL_ON (error|warning), HARNESS_SKIP (comma-list), HARNESS_REPORT (path) all have defaults and must be respected in order (not overridden in CI)
- Jira-GitHub bidirectional contract: branch name must encode Jira key (PROJ-123) so reverse transition can extract it via regex; GitHub for Jira app or smart commits provide the link
- Headless agent timeout: must be set (e.g., 60000ms) to prevent hung personas from blocking CI indefinitely; timeout implies agent may exit early or incomplete
- GitHub token scope: issue creation requires issues:write, PR comments require pull-requests:write, branch creation requires contents:write; follow minimal permission principle
- Node.js version pinned: all workflows explicitly target Node 22, since harness CLI has ABI dependencies (better-sqlite3) that break across LTS boundaries
- Report parse is best-effort: JSON parse failures are logged but non-fatal; exit code defaults to 2 if report unreadable, so CI still fails without crashing

## Interface Contract

```ts
export processReport
```

## Dependency Slice

```
import { execFileSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import * as fs from 'node:fs'
```
