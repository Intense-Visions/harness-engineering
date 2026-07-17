---
number: 0075
title: Affected-scoped pre-push; CI is the authoritative full net
date: 2026-07-17
status: accepted
tier: integration
source: docs/changes/faster-gates/proposal.md
---

## Context

`.husky/pre-push` ran an effectively-complete local CI pass on every push:
whole-tree `format:check`, all-package `typecheck`, and the full coverage suite
(1,254 test files across 10 packages, capped at `--concurrency=2`). This made the
common-case push slow (minutes) even for a one-line change to a leaf package.

The heavy suite was deliberately local because slow CI made push→fail→fix
round-trips expensive. We want the common case fast without moving any gate to
CI-only.

## Decision

`pre-push` scopes format/typecheck/test to the **affected package set**:

- format-check runs prettier over only changed `{ts,tsx,md,json}` files (union of
  the `origin/main...HEAD` branch diff and working-tree changes);
- typecheck and test run via `turbo run … --affected` (base `origin/main`,
  dependents included);
- `coverage-ratchet` runs with `--allow-missing`, tolerating packages that
  `--affected` skipped.

**CI remains the authoritative full net:** the 3-OS matrix runs the whole suite
and the flagless (full) coverage ratchet on every PR. No gate moved to CI-only.

**Fail-safe:** when `origin/main` is unresolvable (fresh clone, detached HEAD),
`pre-push` falls back to the full unscoped gate. The fallback errs toward _more_
coverage, never a silently narrower one.

## Consequences

- Common-case pushes drop from minutes to seconds; the trust boundary shifts:
  a scoped `pre-push` pass no longer implies a whole-repo pass — CI is the net.
- A stale `origin/main` only ever runs a _superset_ of the true affected set
  (slower, never less safe).
- `core` edits still fan out to dependents (`cli`, `dashboard`, `orchestrator`);
  Phase 2 makes that fan-out fast via test isolation + a raised concurrency cap.
