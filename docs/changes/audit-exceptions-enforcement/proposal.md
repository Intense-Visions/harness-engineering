# Enforce `auditExceptions` with expiry + reconcile gate

**Keywords:** audit-exceptions, dependency-audit, GHSA, expiry, CI-gate, reconcile, supply-chain

**Issue:** #1324

## Overview and goals

`auditExceptions` in the root `package.json` is a register of dependency
advisories the project has consciously deferred (each keyed by GHSA ID with a
free-text justification). The register is read by **nothing**: no source
consumes it, and no workflow in `.github/workflows/` runs `pnpm audit`. So a
time-boxed deferral silently becomes a permanent exemption — advisories are
neither enforced (a new, unlisted advisory never fails CI) nor expired (a
listed advisory is exempt forever).

Goal: make the register load-bearing.

1. A **reconcile script** runs the dependency audit and fails when either
   (a) an active advisory has no register entry, or (b) a covering entry has
   lapsed (past its expiry, or missing an expiry).
2. Every register entry gains a required **`expires`** (ISO date). A missing
   expiry is treated as **already lapsed → fail**, so silence cannot re-enter
   through an entry that never expires.
3. A **CI workflow** runs the reconcile script on PRs so the gate is enforced.

## Decisions made

- **Entry shape migrates from `string` to `{ reason, expires }`.** The current
  value is the justification string; the new shape keeps that as `reason` and
  adds a required ISO-date `expires`. Rationale: expiry must be first-class and
  machine-checkable, and keeping `reason` preserves the existing justifications.
- **Missing/invalid/lapsed expiry all fail.** Treating a missing `expires` as
  lapsed (rather than "no expiry = forever") is the whole point of the issue —
  it makes the safe default _fail closed_.
- **Match on `github_advisory_id` (GHSA).** `pnpm audit --json` keys advisories
  by an internal numeric id but carries `github_advisory_id`; the register is
  GHSA-keyed, so reconcile matches on GHSA.
- **Unused entries warn, don't fail.** An entry that no longer matches any
  active advisory is stale hygiene, not a security regression — report it as a
  warning so the gate stays focused on real exposure and isn't brittle when a
  dependency upgrade drops an advisory.
- **Expiry is inclusive of its whole day.** An entry `expires` on date D stays
  valid through the end of D (UTC); it lapses at the first instant of D+1. Avoids
  a same-day off-by-one where an entry dated today reads as already expired.
- **Reconcile logic is a pure, exported function** (`reconcile`) so it is unit
  testable without the network; the script's `main()` does the `pnpm audit` IO.
- **Pipeline: standalone root script, not the harness CLI.** This is a
  repo-governance gate (like `check-changesets.mjs`), so it lives in
  `scripts/*.mjs` with a `node --test` unit test — matching the existing
  convention — rather than a new CLI command.

## Technical design

### `scripts/audit-exceptions.mjs`

Exports (pure, no side effects on import):

- `extractAdvisories(auditJson)` → `Array<{ id, severity, module }>` — pulls
  `github_advisory_id` from each entry of `pnpm audit --json`'s `advisories`
  map.
- `lapseReason(entry, now)` → `string | null` — returns a human reason when an
  entry is lapsed (missing/invalid/past `expires`), else `null`. Expiry is
  inclusive of its whole UTC day.
- `reconcile({ activeAdvisoryIds, register, now })` →
  `{ ok, failures, warnings, covered }` — for each active advisory requires a
  non-lapsed covering entry; entries with no active advisory become warnings.

`main()` runs `pnpm audit --json` (tolerating its non-zero exit when vulns are
found), parses it, reads `auditExceptions` from `package.json`, reconciles
against `new Date()`, prints a report, and exits `1` on any failure or if the
audit output cannot be parsed (fail closed — never silently pass).

### `package.json`

- Migrate each `auditExceptions` entry to `{ "reason": <old string>,
"expires": "<ISO date>" }`.
- Add script `"check:audit-exceptions": "node scripts/audit-exceptions.mjs"`.

### `.github/workflows/audit-exceptions.yml`

PR-triggered job: checkout → pnpm/setup-node (22) → `pnpm install
--frozen-lockfile` → `node scripts/audit-exceptions.mjs`. **Blocking** (no
`continue-on-error`) — an uncovered or lapsed advisory fails the PR.

### `tests/scripts/audit-exceptions.test.mjs`

`node:test` unit tests over the pure functions: uncovered advisory → fail;
expired entry → fail; missing-expiry entry → fail; covered + unexpired → pass;
stale entry (no active advisory) → warning, still ok.

## Integration Points

- **Entry Points:** new root script `scripts/audit-exceptions.mjs`; new
  `check:audit-exceptions` package script; new `audit-exceptions.yml` workflow.
- **Registrations Required:** the workflow is auto-discovered by GitHub Actions;
  the `node --test 'tests/scripts/*.test.mjs'` CI step already globs the new
  test. None else.
- **Documentation Updates:** None (self-documenting script + workflow; the
  `auditExceptions` block remains self-describing via `reason`).
- **Architectural Decisions:** None rise to a standalone ADR (small governance
  change).
- **Knowledge Impact:** None.

## Success criteria

1. `node scripts/audit-exceptions.mjs` exits `0` against the current tree
   (all 5 active advisories covered and unexpired).
2. Introducing an uncovered advisory (or removing/expiring an entry) makes it
   exit `1`.
3. The new workflow runs the script on PRs as a blocking check.
4. Unit tests cover uncovered / expired / missing-expiry / covered-pass / stale.

## Implementation order

1. Migrate `auditExceptions` entries to `{ reason, expires }` in `package.json`.
2. Write `scripts/audit-exceptions.mjs`.
3. Add the `check:audit-exceptions` package script.
4. Write the unit test.
5. Add the CI workflow.
6. Validate: run the script (green), typecheck/lint, run the test.

## Assumptions (autonomous lane — recommended defaults taken)

- Entry shape `{ reason, expires }` (not a parallel `auditExpiries` map).
- Expiry date assigned to all 5 existing entries: **2026-11-15** (~3 months from
  the 2026-08-15 authoring date) — a reasonable near-future re-evaluation box.
- Unused entries warn rather than fail.
- Gate is blocking on PRs (the issue's intent: advisories must be _enforced_).
