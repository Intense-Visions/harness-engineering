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

| Decision                 | Rationale                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| Standard Prefixes        | `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `perf/` cover 99% of use cases. |
| Forward Slash Separator  | Standard convention for grouping branches in git clients.                                 |
| `kebab-case` Slugs       | Improves readability and matches URL-safe patterns.                                       |
| Optional Ticket IDs      | Support for `prefix/PROJ-123-short-desc` allows integration with issue trackers.          |
| `harness verify` Command | Provides immediate feedback to developers without requiring a full validation pass.       |

## Technical Design

### Core Validation Logic

A new `validateBranchName` function is added to `@harness-engineering/core`. It checks:

1.  **Ignore List:** Matches against glob patterns like `main`, `release/**`, `dependabot/**`.
2.  **Custom Regex:** Optional project-specific naming rule.
3.  **Prefixes:** Must start with an allowed prefix followed by a slash.
4.  **Slug Format:** Enforces `kebab-case` while allowing uppercase ticket IDs at the start of segments.

### Configuration Schema

The `HarnessConfigSchema` is extended with a `compliance.branching` section:

```typescript
branching: {
  prefixes: string[]; // default: ['feat', 'fix', 'chore', ...]
  enforceKebabCase: boolean; // default: true
  customRegex?: string;
  ignore: string[]; // default: ['main', 'release/**', ...]
}
```

### CLI Command

A new `harness verify` command is implemented in `packages/cli`. It:

1.  Determines the current branch name using `git rev-parse --abbrev-ref HEAD`.
2.  Resolves configuration (using defaults if none provided).
3.  Runs validation and outputs success or error messages with suggestions.

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
