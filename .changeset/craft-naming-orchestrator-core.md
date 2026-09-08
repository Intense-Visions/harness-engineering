---
'@harness-engineering/orchestrator': minor
---

craft(orchestrator): unit- and intent-carrying names for three `src/core` exports

`calculateRetryDelay` → `calculateRetryDelayMs`, `periodLengthMs` → `resolvePeriodLengthMs`, and
`reconcile` → `reconcileRunningIssues`. The first two now carry the `Ms` unit suffix this package
already uses (`maxRetryBackoffMs`, `CONTINUATION_DELAY_MS`, `WEEK_MS`, `DAY_MS`); the third takes the
name its own doc comment already used ("Reconcile running issues against their current tracker
states"), which distinguishes it from the several unrelated `reconcile` symbols elsewhere in the repo.

**Not a break.** Each old name survives as an exported `@deprecated` alias bound to the identical
function object, and all six names are exported from the package root. `tests/core/naming-aliases.test.ts`
imports both halves of every pair from the entry point and asserts reference identity, so an alias that
is declared but omitted from the barrel fails the build rather than silently breaking consumers.

Internally, `reconciliation.ts`'s local accumulator is now `sideEffects` rather than the bare `effects`.
