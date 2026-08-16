# Implementation Plan — Enforce `auditExceptions` with expiry + reconcile gate

Spec: `docs/changes/audit-exceptions-enforcement/proposal.md`
Issue: #1324

## Task graph

### T1 — Migrate `auditExceptions` entry shape (package.json)

- Convert each of the 5 GHSA entries from `"<GHSA>": "<reason>"` to
  `"<GHSA>": { "reason": "<reason>", "expires": "2026-11-15" }`.
- Preserve the existing justification text verbatim as `reason`.
- Depends on: none.
- Verify: `node -e` parse of `package.json` shows every `auditExceptions` value
  is an object with `reason` + `expires`.

### T2 — Reconcile script (`scripts/audit-exceptions.mjs`)

- Pure exports: `extractAdvisories`, `lapseReason`, `reconcile`.
- `main()`: spawn `pnpm audit --json` (capture stdout even on non-zero exit),
  parse, read register from `package.json`, reconcile vs `new Date()`, print,
  exit 1 on failure / unparseable output.
- `isMain` guard so importing the module has no side effects (mirrors
  `check-changesets.mjs`).
- Depends on: T1 (shape it reads).
- Verify: run against current tree → exit 0, report "5 covered".

### T3 — Package script

- Add `"check:audit-exceptions": "node scripts/audit-exceptions.mjs"` to root
  `package.json` scripts.
- Depends on: T2.

### T4 — Unit test (`tests/scripts/audit-exceptions.test.mjs`)

- `node:test` cases: uncovered → fail; expired → fail; missing-expiry → fail;
  covered+unexpired → pass; stale (no active advisory) → warn+ok.
- Depends on: T2.
- Verify: `node --test tests/scripts/audit-exceptions.test.mjs` all pass.

### T5 — CI workflow (`.github/workflows/audit-exceptions.yml`)

- `pull_request` on `main`; checkout → pnpm/action-setup → setup-node 22 (pnpm
  cache) → `pnpm install --frozen-lockfile` → `node
scripts/audit-exceptions.mjs` (blocking).
- Depends on: T2.
- Verify: `actionlint` clean (or manual YAML review).

### T6 — Local validation + gauntlet

- Run script (green), `pnpm prettier --write` changed files, add changeset if
  the gate asks (root-only change → empty changeset if needed), commit, push.
- Depends on: T1–T5.

## Checkpoints

- After T2: script green against current tree (the critical "don't leave PR red"
  gate).
- After T4: unit tests green.
- After T6: pre-push gauntlet green.
