# Plan — pre-commit misdiagnoses an unbuilt CLI as an arch-baseline regression (#1421)

## Problem

`.husky/pre-commit` shells out to `packages/cli/dist/bin/harness.js` (line 84). In a
fresh worktree/clone `packages/cli/dist/` is gitignored and is **never** produced by
`pnpm install` alone, so `node .../harness.js` dies with `MODULE_NOT_FOUND`. The hook's
failure branch attributes _every_ non-zero exit to a check regression and advises
`harness check-arch --update-baseline`. A contributor who trusts that output commits a
bogus baseline change in response to a missing build. A run that executed **zero**
checks is an abstention, not a failing gate, and must not be offered a
baseline-accepting remedy.

## Approach (issue Option 1 — smallest change that resolves the dangerous advice)

Assert the CLI entrypoint exists **before** invoking it. If it is missing, fail with a
distinct, actionable message — "the harness CLI is not built … run `pnpm build`" — that
never mentions the baseline remedy. Only a real non-zero exit from `harness ci check`
(the check ran and regressed) can reach the existing baseline-advice branch.

Why Option 1 over Options 2/3 (dedicated infra exit code / executed-check count):
smallest surface, purely additive, resolves the dangerous-advice problem on its own,
and mirrors the reproduction exactly (entrypoint absent). The deeper exit-code plumbing
is a larger, separable change and not required to close the reported bug.

## Files touched

- `.husky/pre-commit` — add a fail-fast guard immediately above the `harness ci check`
  gate: `if [ ! -f packages/cli/dist/bin/harness.js ]; then … exit 1; fi`. The guard
  message deliberately avoids the literal `--update-baseline` token and the
  "architecture baseline change" phrasing, so (a) the accurate message and the dangerous
  advice are textually disjoint and (b) it adds no new match for the STRENGTH-002
  auto-baseline auditor's failure-branch regex.
- `packages/cli/tests/hooks/pre-commit-cicheck-gate.e2e.test.ts` — the existing #726
  fail-closed e2e runs the extracted gate in a temp repo that has no built CLI; the new
  guard would fire first and mask the stubbed producer. Provision a stub
  `packages/cli/dist/bin/harness.js` in that temp repo so the guard passes and the
  producer-structure assertions still exercise what they intend.
- `packages/cli/tests/hooks/pre-commit-unbuilt-cli-gate.e2e.test.ts` — **new** regression
  test.

## Test strategy

New e2e (`pre-commit-unbuilt-cli-gate.e2e.test.ts`), mirroring the existing #726 e2e:
extract the real gate block from `.husky/pre-commit`, install it as a hook in a temp git
repo that has **no** `packages/cli/dist/bin/harness.js`, stage a change, and `git commit`.
Assert:

1. the commit is blocked (non-zero) and no commit is created;
2. the output contains the accurate "harness CLI is not built" / `pnpm build` message;
3. the output does **not** contain `--update-baseline` nor the "intentional architecture
   baseline change" advice (proving the misdiagnosis is gone).

A positive control also provisions the stub entrypoint and confirms the guard passes
through to the (stubbed) gate — so the guard cannot be trivially always-on.

`skipIf(win32)` like the sibling e2e: the hook runs under POSIX `sh`.

## Verification

- `pnpm --filter @harness-engineering/cli test` for the two hook e2e files.
- Build the CLI first (`pnpm build`) so the local pre-commit gate itself can run.
- Changeset + docs regen as the pre-push gauntlet requires.
