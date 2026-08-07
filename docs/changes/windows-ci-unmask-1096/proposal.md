# Windows CI: unmask per-package test failures via turbo `--continue` (#1096)

**Status:** Draft · **Tier:** Small · **Domain:** ci (workflow)
**Keywords:** turbo-continue, windows-ci, test-masking, fail-fast, build-and-test

## Overview

Issue #1096 reports that `build-and-test (windows-latest, 22)` was red on `main`
and that its red state **masked** two additional Windows-only `cli#test` failures:
the job died in `@harness-engineering/core#test`, and because `turbo run test`
bails at the first failed task, `@harness-engineering/cli#test` never ran on that
leg. Any Windows-only regression in a package that sorts after `core` was therefore
invisible.

The two masked CLI failures cited in the issue are **already fixed on `main`**:

1. `tests/commands/outcome-eval-ci.test.ts` (POSIX-separator assertion) — fixed in
   commit `75413243e7` (#1083): `resolveSpecPath` now normalizes the joined path to
   forward slashes (`path.join(...).replaceAll('\\', '/')`) for a deterministic,
   cross-platform spec identity, and the test asserts the forward-slash literal.
2. `src/commands/roadmap/install-hook.test.ts` (`expected +0 not to be +0`) — fixed
   in commit `840288aa7e` (#1082): the executable-bit assertion
   (`fs.statSync(hookPath).mode & 0o111).not.toBe(0`) is 0 on Windows because git
   for Windows does not carry POSIX mode bits; the installer already guards `chmod`
   behind a `process.platform` check, so the test now guards the assertion behind
   `if (process.platform !== 'win32')`. The real invariant (the hook is created and
   git honors it) is unaffected on Windows.

Both fixes are platform-agnostic and the two files pass locally (33/33). Windows CI
is now consistently green on `main`, so `core#test`'s prior Windows failure is also
resolved. What remains unshipped is the **structural** recommendation from the
issue: prevent one broken package from ever hiding the rest again.

## Change

`.github/workflows/ci.yml`, `build-and-test` → test step: run the non-ubuntu
(windows/macos) legs with `pnpm test -- --continue` (→ `turbo run test --continue`).
Ubuntu keeps its fail-fast coverage suite (`pnpm test:ci`).

## Acceptance criteria

- On the windows/macos legs, a failure in one package's `test` task does **not**
  stop the other packages' `test` tasks from running (turbo `--continue`).
- The leg still reports **red** on any failure: turbo exits non-zero if any task
  fails, so failure reporting is not weakened.
- Ubuntu leg behavior is unchanged (coverage + fail-fast via `test:ci`).
- The two previously-masked CLI test files pass under Node 22.

## Non-goals

- Changing production code (the two source-level fixes already landed upstream).
- Adding `--continue` to the ubuntu leg (it runs the full gate + coverage and
  benefits from fail-fast).
- Chasing non-deterministic Windows teardown-timing ENOENT flakes (per #1168, some
  are races, not deterministic bugs).
