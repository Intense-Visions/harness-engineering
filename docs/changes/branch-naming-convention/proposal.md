# Branch Naming Convention and Compliance Verification

**Status:** Proposed
**Keywords:** branching, convention, compliance, verification, git

## Overview

Implement a project-wide branch naming convention and a verification mechanism to ensure consistency and facilitate automation. This includes standardizing on `feat/`, `fix/`, etc., prefixes, enforcing `kebab-case` for branch slugs, and providing a `harness verify` command to check compliance.

## Goals

- Standardize branch names to eliminate drift (e.g., `feature/` vs `feat/`).
- Enable automation for PR titling, changelogs, and release notes.
- Reduce contributor friction with clear guidelines and automated feedback.
- Support project-level overrides for prefixes and ignore lists via `harness.config.json`.

## Decisions

| Decision                     | Rationale                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standard Prefixes            | `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `perf/` cover 99% of use cases.                                                                  |
| Forward Slash Separator      | Standard convention for grouping branches in git clients.                                                                                                  |
| Strict `kebab-case` Slugs    | Lowercase alphanumerics joined by single hyphens. No leading/trailing hyphens, no `--` runs. URL-safe and unambiguous.                                     |
| Slug Length Cap              | Default `maxLength: 60` characters (after the prefix). Set to `0` in config to disable. Keeps names under FS / CI label caps.                              |
| Optional Ticket IDs          | Support for `prefix/PROJ-123-short-desc` allows integration with issue trackers.                                                                           |
| `customRegex` Is an Override | When set, fully replaces prefix/kebab/length checks. Only the ignore list and this regex run. For orgs whose convention doesn't fit the prefix/slug model. |
| `harness verify` Command     | Provides immediate feedback without requiring a full validation pass. Works with or without a `harness.config.json`.                                       |
| CI-aware Branch Resolution   | Reads `--branch`, then `HARNESS_BRANCH` / `GITHUB_HEAD_REF` / `CI_COMMIT_REF_NAME` / `BUILDKITE_BRANCH`, then `git rev-parse`.                             |

## Technical Design

### Core Validation Logic

A new `validateBranchName` function is added to `@harness-engineering/core`. It checks:

1.  **Ignore List:** Matches against glob patterns like `main`, `release/**`, `dependabot/**`.
2.  **Custom Regex:** Optional project-specific naming rule.
3.  **Prefixes:** Must start with an allowed prefix followed by a slash.
4.  **Slug Format:** Enforces `kebab-case` while allowing uppercase ticket IDs at the start of segments.

### Configuration Schema

The `HarnessConfigSchema` is extended with a `compliance.branching` section.
Defaults declared in `BranchingConfigSchema` are the single source of truth --
the CLI does not re-declare fallback values.

```typescript
branching: {
  prefixes: string[];          // default: ['feat','fix','chore','docs','refactor','test','perf']
  enforceKebabCase: boolean;   // default: true
  customRegex?: string;        // when set, fully replaces prefix/kebab/length checks
  ignore: string[];            // default: ['main','release/**','dependabot/**','harness/**']
  maxLength: number;           // default: 60 (0 disables)
}
```

### CLI Command

A new `harness verify` command is implemented in `packages/cli`. It:

1.  Resolves the branch name from (in order) `--branch`, `HARNESS_BRANCH`,
    `GITHUB_HEAD_REF`, `CI_COMMIT_REF_NAME`, `BUILDKITE_BRANCH`, then
    `git rev-parse --abbrev-ref HEAD`. The env-var fallbacks handle CI runners
    that build PRs in detached-HEAD state where `git rev-parse` returns `HEAD`.
2.  Resolves configuration if `harness.config.json` exists; otherwise uses
    schema defaults so the command works on un-onboarded repos.
3.  Runs validation. Prints a human-readable message + suggestion, or a
    machine-readable JSON payload when `--json` is passed.

## Integration Points

### Entry Points

- `harness verify` command.
- `validateBranchName` exported from `@harness-engineering/core`.

### Documentation Updates

- `CONTRIBUTING.md` updated with branch creation guidelines.
- `harness-compliance` skill updated to include branch convention checks.

## Success Criteria

1.  `harness verify` correctly identifies compliant and non-compliant branches.
2.  Branch names like `feat/new-feature` and `fix/PROJ-123-bug` pass validation.
3.  Branch names like `feature/wrong-prefix` or `feat/Invalid_Case` fail validation.
4.  Ignored branches like `main` and `release/v1.0.0` pass validation.
5.  All unit tests for the validation logic pass.

## Implementation Order

1.  **Implement `validateBranchName`** in `@harness-engineering/core`. (COMPLETED)
2.  **Update Config Schema** in `packages/cli`. (COMPLETED)
3.  **Implement `harness verify`** in `packages/cli`. (COMPLETED)
4.  **Update Documentation** (`CONTRIBUTING.md`, `SKILL.md`). (COMPLETED)
5.  **Add Unit Tests** for validation logic. (COMPLETED)
