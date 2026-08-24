# Plan — usage-flag-grammar-unify (#1455)

## Issue

`chore(cli-ergonomics): usage subcommand grammar + --days/--limit inconsistency [craft-fleet CLI-R001]`

The `usage` leaf command spells the "how many rows to show" concept two ways:
`--days <n>` on `daily` but `--limit <n>` on `sessions`. A user cannot guess the
flag from one member to the next.

## Confirmed decision — NON-BREAKING ONLY (human-approved)

`usage` is a published CLI contract. We do the non-breaking fix only:

1. `--limit <n>` becomes the canonical flag everywhere the "how many rows" concept
   appears — so `daily` now accepts `--limit`.
2. `--days <n>` stays as a **hidden, deprecated alias** on `daily`: it still
   functions identically (maps to the same underlying value) but is hidden from
   `--help` and, when used, prints a one-line deprecation notice to stderr pointing
   at `--limit`. It is **not** removed.
3. No subcommand is renamed. The subcommand-grammar inconsistency
   (`daily`/`latest` adjectives vs `sessions`/`session` nouns) is a breaking change
   and is explicitly **out of scope** for this non-breaking pass — noted as a
   follow-up only.

## Semantic equivalence check (required before implementing)

`daily` computes `aggregateByDay(records).slice(0, days)` — `--days <n>` selects the
first N **day rows**, it does **not** filter by calendar window/date. `sessions`
computes `aggregateBySession(records).slice(0, limit)`. Both are `.slice(0, n)` over
aggregated rows: the identical "how many rows to show" concept (in `daily`, one row =
one day). **Confirmed equivalent** — unifying the flag name conflates nothing.

## Tasks

1. Import `Option` from commander in `packages/cli/src/commands/usage.ts`.
2. In `registerDailyCommand`:
   - Add canonical `--limit <n>` option, default `'7'`, help "Number of days to show
     (default: 7, max: 90)".
   - Add `--days <n>` as a hidden (`.hideHelp()`) deprecated alias with no default.
   - In the action: if `--days` was provided, print a one-line deprecation notice to
     **stderr** (`console.error`, no chalk error icon) pointing at `--limit`, and use
     its value. `--limit` (when explicitly set) wins over `--days`; otherwise the
     canonical default applies. Clamp identically (1..90).
3. Tests in `packages/cli/tests/commands/usage.test.ts`:
   - `daily --limit 7` and `daily --days 7` produce the same result.
   - `daily --days <n>` still limits rows (alias works).
   - `daily --days <n>` prints the deprecation notice to stderr.
   - `--days` is absent from `daily --help` output; `--limit` is present.
4. `pnpm build` (pre-commit arch gate shells the built CLI).
5. `pnpm generate-docs` (CLI surface changed → refresh `docs/reference/*`).
6. Add a `@harness-engineering/cli` changeset.

## Out of scope / follow-up

- Renaming subcommands for grammar consistency (breaking; deferred).
