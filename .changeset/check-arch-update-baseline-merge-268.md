---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(core, cli): preserve tracked categories on `check-arch --update-baseline` (#268)

`harness check-arch --update-baseline` rewrote `.harness/arch/baselines.json` from scratch using only the categories present in the current `runAll()` output. Any tracked category that the run did not emit — for example because a collector silently returned `[]` after a transient failure or a filtered run — was permanently dropped from the baseline. Combined with the `.husky/pre-commit` hook that auto-stages the regenerated file, this could erase tracked `complexity`, `layer-violations`, and `circular-deps` allowlists in a normal commit without surfacing as a diff worth reviewing.

**`@harness-engineering/core`:**

- `packages/core/src/architecture/baseline-manager.ts` — adds `ArchBaselineManager.update(results, commitHash)`. It captures fresh metrics, merges them onto the on-disk baseline (categories present in `results` overwrite, categories absent are preserved), and saves atomically. This mirrors the merge-on-write pattern already used by `packages/core/src/performance/baseline-manager.ts :: BaselineManager.save`.
- `capture()` and `save()` keep their existing pure / overwrite-only contracts.

**`@harness-engineering/cli`:**

- `packages/cli/src/commands/check-arch.ts` — the `--update-baseline` branch now calls `manager.update(results, commitHash)` instead of `manager.capture(results, commitHash)` followed by `manager.save(baseline)`. No CLI surface changes.

**Tests:**

- `packages/core/tests/architecture/baseline-manager.test.ts` — three new cases under `describe('update()')`: preserves existing categories when results omit them (the literal #268 reproduction), overwrites categories present in both, writes a fresh baseline when none exists. Each was verified to fail when `update()` is reverted to plain `capture()`+`save()`.
- `packages/cli/tests/commands/check-arch.test.ts` — adds an integration smoke test that pre-seeds all seven categories and asserts every category is still present after `--update-baseline`, guarding against future regressions in the wiring.
