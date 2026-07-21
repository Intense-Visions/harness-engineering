---
'@harness-engineering/cli': patch
---

fix(ci): coverage ratchet grades only fresh coverage on pre-push (#939)

The `pre-push` hook runs `turbo run test:coverage --affected` then the coverage
ratchet with `--allow-missing`. `--affected` regenerates coverage only for
changed packages, so an UNAFFECTED package keeps a STALE
`coverage-summary.json` from a previous run. The ratchet graded that stale file
against baseline and reported a phantom regression (e.g. "packages/orchestrator
lines dropped from 85.52% to 83.5%"), blocking pushes on fresh clones and
headless agent sandboxes. `--allow-missing` only skips packages whose coverage
is absent, not stale-but-present ones.

Fix: add a unit-testable `pruneCoverageSummaries()` export (plus a `--clean`
CLI mode) to `scripts/coverage-ratchet.mjs` that deletes stale
`coverage-summary.json` files, and call it in `.husky/pre-push` BEFORE the
`--affected` coverage run. Afterwards only re-measured packages have a summary
(graded); unaffected packages have none (skipped under `--allow-missing`),
restoring the invariant "measured this run <=> file present". CI's flagless,
whole-repo authoritative ratchet path is unchanged.
