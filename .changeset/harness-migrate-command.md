---
'@harness-engineering/cli': minor
---

feat(cli): add `harness migrate` command for legacy artifact layout.

Migrates pre-co-location project artifacts (`.harness/architecture/`, `docs/plans/`, etc.) into the canonical layout. Supports `--dry-run` to preview the migration plan, interactive orphan bucketing, and a `--non-interactive` mode for CI use.

Subsequent refactor pass hardened the implementation:

- Replaced shell-string `git mv` with `execFileSync` (no shell metacharacter interpolation surface).
- Tightened filename-prefix matching to require a word boundary (so plan `authhelper-plan` no longer falsely maps to topic `auth`).
- Switched `runMigrate` return type to `Promise<Result<MigrationResult, CLIError>>` matching the convention used by `runCleanupSessions` and the rest of the CLI commands.
- Resolves `harness.config.json` relative to the migrate cwd; warns explicitly on parse failure rather than silently falling back.
- Skips the interactive orphan prompt during `--dry-run`.
