---
'@harness-engineering/cli': minor
'@harness-engineering/core': minor
---

feat(compliance): branch naming convention and `harness verify` command (closes #319)

Adds a project-wide branch naming convention with optional `harness.config.json`
override under `compliance.branching`, and a `harness verify` command that
checks the current branch against the convention.

- **Core:** New `validateBranchName` export from `@harness-engineering/core`
  with `BranchingConfig` type. Enforces prefix list, strict kebab-case slugs
  (no leading/trailing or doubled hyphens), optional ticket-ID pattern
  (`feat/PROJ-123-desc`), slug length cap, and ignore globs for long-lived
  branches.
- **CLI:** New `harness verify` command. Works without a `harness.config.json`
  by falling back to schema defaults. Supports `--branch <name>` and reads
  `HARNESS_BRANCH` / `GITHUB_HEAD_REF` / `CI_COMMIT_REF_NAME` /
  `BUILDKITE_BRANCH` so CI runners in detached-HEAD state can still verify
  the PR source branch. `--json` emits a machine-readable result.
- **Config:** Adds `compliance.branching` to `HarnessConfigSchema` with
  fields `prefixes`, `enforceKebabCase`, `customRegex`, `ignore`, and
  `maxLength` (default 60; set to 0 to disable). Defaults declared in the
  schema are the single source of truth.

Defaults: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`; ignore
`main`, `release/**`, `dependabot/**`, `harness/**`. `customRegex` is a full
override -- when set, the prefix, kebab-case, and length checks are bypassed.
