# Plan: CI/CD and Issue Tracker Integration

**Date:** 2026-03-17
**Spec:** docs/changes/ci-cd-issue-tracker-integration/proposal.md
**Estimated tasks:** 15
**Estimated time:** 45–75 minutes

## Goal

Adopters can run all harness checks from CI with a single command, generate CI config files for their platform, and follow documented patterns for bidirectional issue tracker integration and headless agent execution.

## Observable Truths (Acceptance Criteria)

1. When `harness ci check --json` is run in a project with `harness.config.json`, the system shall return a JSON report matching the `CICheckReport` schema with results from all enabled checks
2. When all checks pass, `harness ci check` shall exit with code `0`; when checks fail, exit code `1`; on internal error, exit code `2`
3. When `harness ci check --skip entropy,docs` is run, the system shall skip those checks and mark them as `"skip"` in the report
4. When `harness ci check --fail-on warning` is run and warnings exist, the system shall exit with code `1`
5. When `harness ci init --platform github` is run, the system shall generate `.github/workflows/harness.yml` containing a valid GitHub Actions workflow that calls `harness ci check`
6. When `harness ci init --platform gitlab` is run, the system shall generate `.gitlab-ci-harness.yml` with valid GitLab CI config
7. When `harness ci init --platform generic` is run, the system shall generate a `harness-ci.sh` shell script
8. `docs/guides/automation-overview.md` exists and links to all other guides and recipes
9. `docs/guides/ci-cd-validation.md` exists with platform-agnostic patterns and step-by-step setup
10. `docs/guides/issue-tracker-integration.md` exists covering both harness→issues and issues→harness flows
11. `docs/guides/headless-agents.md` exists documenting `CI=true`, personas, `ci check`, and timeout patterns
12. Six recipe files exist in `docs/guides/recipes/` and are syntactically valid
13. `npx vitest run packages/core/tests/ci` passes with all CI module tests
14. `npx vitest run packages/cli/tests/ci` passes with all CI command tests

## File Map

```
CREATE packages/types/src/ci.ts
MODIFY packages/types/src/index.ts (add ci export)
CREATE packages/core/src/ci/index.ts
CREATE packages/core/src/ci/check-orchestrator.ts
CREATE packages/core/tests/ci/check-orchestrator.test.ts
CREATE packages/cli/src/commands/ci/index.ts
CREATE packages/cli/src/commands/ci/check.ts
CREATE packages/cli/src/commands/ci/init.ts
CREATE packages/cli/tests/ci/check.test.ts
CREATE packages/cli/tests/ci/init.test.ts
CREATE packages/cli/src/templates/ci/github-actions.yml.hbs
CREATE packages/cli/src/templates/ci/gitlab-ci.yml.hbs
CREATE packages/cli/src/templates/ci/generic.sh.hbs
MODIFY packages/cli/src/index.ts (register ci command)
MODIFY packages/core/src/index.ts (export ci module)
CREATE docs/guides/automation-overview.md
CREATE docs/guides/ci-cd-validation.md
CREATE docs/guides/issue-tracker-integration.md
CREATE docs/guides/headless-agents.md
CREATE docs/guides/recipes/github-actions-harness.yml
CREATE docs/guides/recipes/gitlab-ci-harness.yml
CREATE docs/guides/recipes/ci-check-script.sh
CREATE docs/guides/recipes/github-issue-webhook.ts
CREATE docs/guides/recipes/jira-automation-rules.md
CREATE docs/guides/recipes/headless-agent-action.yml
```

## Tasks

### Task 1: Define CICheckReport types

**Depends on:** none
**Files:** packages/types/src/ci.ts, packages/types/src/index.ts

1. Create `packages/types/src/ci.ts` with types: `CICheckName`, `CICheckStatus`, `CICheckIssue`, `CICheckResult`, `CICheckSummary`, `CICheckReport`, `CIFailOnSeverity`, `CICheckOptions`, `CIPlatform`, `CIInitOptions`
2. Add `export * from './ci'` to `packages/types/src/index.ts`
3. Run: `npx turbo build --filter=@harness-engineering/types`
4. Commit: `feat(types): add CI check report types`

### Task 2: Core check orchestrator — tests (TDD red)

**Depends on:** Task 1
**Files:** packages/core/tests/ci/check-orchestrator.test.ts

1. Create test file with 7 tests: returns all checks, skips listed checks, exitCode 0 on pass, exitCode 1 on errors, exitCode 1 on warnings with failOn warning, includes timestamp/project, records durationMs
2. Run: `npx vitest run packages/core/tests/ci/check-orchestrator.test.ts`
3. Observe: fails — `runCIChecks` does not exist
4. Commit: `test(core): add CI check orchestrator tests`

### Task 3: Core check orchestrator — implementation (TDD green)

**Depends on:** Task 2
**Files:** packages/core/src/ci/check-orchestrator.ts, packages/core/src/ci/index.ts, packages/core/src/index.ts

1. Create `packages/core/src/ci/check-orchestrator.ts` implementing `runCIChecks()` that:
   - Runs 5 checks sequentially: validate (via `validateAgentsMap`), deps (via `checkLayerDependencies`), docs (via `checkDocCoverage`), entropy (via `detectEntropy`), phase-gate (via `checkPhaseGates`)
   - Skips checks in the `skip` array
   - Builds summary and determines exit code based on `failOn` severity
   - Returns `Result<CICheckReport, Error>`
2. Create `packages/core/src/ci/index.ts` barrel export
3. Add `export * from './ci'` to `packages/core/src/index.ts`
4. Run: `npx vitest run packages/core/tests/ci/check-orchestrator.test.ts` — all pass
5. Run: `npx turbo build --filter=@harness-engineering/core`
6. Commit: `feat(core): implement CI check orchestrator`

### Task 4: CLI ci check command — tests (TDD red)

**Depends on:** Task 3
**Files:** packages/cli/tests/ci/check.test.ts

1. Create test file with 3 tests: returns CICheckReport, respects skip option, respects failOn option
2. Run: `npx vitest run packages/cli/tests/ci/check.test.ts`
3. Observe: fails — `runCICheck` does not exist
4. Commit: `test(cli): add CI check command tests`

### Task 5: CLI ci check + ci parent command — implementation (TDD green)

**Depends on:** Task 4
**Files:** packages/cli/src/commands/ci/check.ts, packages/cli/src/commands/ci/index.ts, packages/cli/src/index.ts

1. Create `packages/cli/src/commands/ci/check.ts` with `runCICheck()` and `createCheckCommand()` following existing command patterns (Result return, OutputFormatter, global opts, exit codes)
2. Create `packages/cli/src/commands/ci/index.ts` parent command registering check subcommand
3. Register `createCICommand()` in `packages/cli/src/index.ts`
4. Run: `npx vitest run packages/cli/tests/ci/check.test.ts` — all pass
5. Run: `npx turbo build --filter=@harness-engineering/cli`
6. Commit: `feat(cli): add harness ci check command`

### Task 6: CLI ci init command — tests (TDD red)

**Depends on:** Task 5
**Files:** packages/cli/tests/ci/init.test.ts

1. Create test file with 4 tests: generates GitHub Actions, generates GitLab CI, generates generic script, includes only specified checks
2. Run: `npx vitest run packages/cli/tests/ci/init.test.ts`
3. Observe: fails — `generateCIConfig` does not exist
4. Commit: `test(cli): add CI init command tests`

### Task 7: CI templates + ci init command — implementation (TDD green)

**Depends on:** Task 6
**Files:** packages/cli/src/templates/ci/github-actions.yml.hbs, packages/cli/src/templates/ci/gitlab-ci.yml.hbs, packages/cli/src/templates/ci/generic.sh.hbs, packages/cli/src/commands/ci/init.ts

1. Create 3 Handlebars template files for GitHub Actions, GitLab CI, and generic shell script — each calls `harness ci check` with optional `--skip` flags
2. Create `packages/cli/src/commands/ci/init.ts` with `generateCIConfig()` and `createInitCommand()` — detects platform, renders template, writes file
3. Register init command in `packages/cli/src/commands/ci/index.ts`
4. Run: `npx vitest run packages/cli/tests/ci/init.test.ts` — all pass
5. Run: `npx turbo build --filter=@harness-engineering/cli`
6. Commit: `feat(cli): add harness ci init command with platform templates`

### Task 8: Documentation — automation overview

[checkpoint:human-verify]

**Depends on:** Task 5
**Files:** docs/guides/automation-overview.md

1. Create `docs/guides/automation-overview.md` with sections: Introduction, Integration Surface (CLI contract, JSON output, exit codes), Quick Start (3 steps), Guide Links, Recipe Links, Future Direction (webhook service — deferred)
2. Commit: `docs: add automation overview guide`

### Task 9: Documentation — CI/CD validation guide

**Depends on:** Task 8
**Files:** docs/guides/ci-cd-validation.md

1. Create `docs/guides/ci-cd-validation.md` with sections: Overview, The `harness ci check` Command (full reference), Platform-Agnostic Patterns, GitHub Actions Setup, GitLab CI Setup, Other Platforms, Customizing Checks, Interpreting Results
2. Commit: `docs: add CI/CD validation guide`

### Task 10: Recipes — CI platform configs

**Depends on:** Task 9
**Files:** docs/guides/recipes/github-actions-harness.yml, docs/guides/recipes/gitlab-ci-harness.yml, docs/guides/recipes/ci-check-script.sh

1. Create `docs/guides/recipes/` directory
2. Create GitHub Actions workflow recipe (triggers, setup, run, PR comment, label on failure)
3. Create GitLab CI job recipe (stage, image, install, run, artifacts)
4. Create generic shell script recipe (bash with set -euo pipefail, install check, run, jq summary)
5. Commit: `docs: add CI platform recipe files`

### Task 11: Documentation — issue tracker integration guide

**Depends on:** Task 10
**Files:** docs/guides/issue-tracker-integration.md

1. Create `docs/guides/issue-tracker-integration.md` with sections: Overview, Harness → Issues (3 outbound patterns with setup steps), Issues → Harness (4 inbound patterns with setup steps), GitHub Issues Setup, Jira Setup, Combining Patterns
2. Commit: `docs: add issue tracker integration guide`

### Task 12: Recipes — issue tracker configs

**Depends on:** Task 11
**Files:** docs/guides/recipes/github-issue-webhook.ts, docs/guides/recipes/jira-automation-rules.md

1. Create webhook handler recipe (Express handler, GitHub signature verification, issue creation via Octokit)
2. Create Jira automation rules recipe (3 rules with step-by-step configuration instructions)
3. Commit: `docs: add issue tracker recipe files`

### Task 13: Documentation — headless agents guide

**Depends on:** Task 5 (parallelizable with Tasks 8–12)
**Files:** docs/guides/headless-agents.md

1. Create `docs/guides/headless-agents.md` with sections: Overview, Environment Setup, Running Skills Headlessly, Timeout and Failure Handling, Trust Boundary, Security Considerations, Examples
2. Commit: `docs: add headless agents guide`

### Task 14: Recipe — headless agent action

**Depends on:** Task 13
**Files:** docs/guides/recipes/headless-agent-action.yml

1. Create GitHub Action recipe (triggers on issues.labeled + issue_comment.created, setup, read context, run headless agent, post results, handle failures)
2. Commit: `docs: add headless agent action recipe`

### Task 15: Finalize automation overview links

**Depends on:** Tasks 8–14
**Files:** docs/guides/automation-overview.md

1. Verify all links in automation-overview.md point to correct files
2. Add any missing recipe links
3. Ensure future direction section is complete
4. Commit: `docs: finalize automation overview links`

## Sequence

| Task | Name                    | Depends | Parallel Group         |
| ---- | ----------------------- | ------- | ---------------------- |
| 1    | CI types                | —       | A                      |
| 2    | Core orchestrator test  | 1       | B                      |
| 3    | Core orchestrator impl  | 2       | B                      |
| 4    | CLI ci check test       | 3       | C                      |
| 5    | CLI ci check command    | 4       | C                      |
| 6    | CLI ci init test        | 5       | D                      |
| 7    | CI templates + ci init  | 6       | D                      |
| 8    | Automation overview doc | 5       | E                      |
| 9    | CI/CD validation doc    | 8       | E                      |
| 10   | CI platform recipes     | 9       | E                      |
| 11   | Issue tracker doc       | 10      | F                      |
| 12   | Issue tracker recipes   | 11      | F                      |
| 13   | Headless agents doc     | 5       | E (parallel with 8–10) |
| 14   | Headless agent recipe   | 13      | E                      |
| 15   | Final link check        | 8–14    | G                      |

**Parallel opportunities:** Tasks 8–10 and Tasks 13–14 touch different guides with no shared state and can be executed simultaneously.

## Traceability

| Observable Truth                         | Tasks      |
| ---------------------------------------- | ---------- |
| 1. ci check --json returns CICheckReport | 1–5        |
| 2. Exit codes 0/1/2                      | 2–5        |
| 3. --skip marks checks as skip           | 2–5        |
| 4. --fail-on warning exits 1             | 2–5        |
| 5. ci init --platform github             | 6–7        |
| 6. ci init --platform gitlab             | 6–7        |
| 7. ci init --platform generic            | 6–7        |
| 8. automation-overview.md with links     | 8, 15      |
| 9. ci-cd-validation.md                   | 9          |
| 10. issue-tracker-integration.md         | 11         |
| 11. headless-agents.md                   | 13         |
| 12. Six recipe files                     | 10, 12, 14 |
| 13. Core CI tests pass                   | 2–3        |
| 14. CLI CI tests pass                    | 4–7        |
