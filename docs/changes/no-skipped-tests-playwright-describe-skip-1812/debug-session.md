# Debug Session: no-skipped-tests/no-disabled-tests miss `test.describe.skip()`

Status: resolved
Started: 2026-09-05
Issue: https://github.com/Intense-Visions/harness-engineering/issues/1812
Error: `test.describe.skip('...', () => {})` (Playwright) produces NO lint error from
`@harness-engineering/no-skipped-tests` or `@harness-engineering/no-disabled-tests`,
while the strictly-smaller mute `test.skip('...')` produces two errors.

## Investigation Log

### Phase 1 — INVESTIGATE (read-only)

**What failed.** Two rules under-report. `packages/eslint-plugin/src/rules/no-skipped-tests.ts`
and `.../no-disabled-tests.ts` contain byte-identical detection logic:

    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&                  // <-- the guard
    (object.name === 'describe' | 'it' | 'test') &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'skip'

**Reproduced consistently** (3/3 runs) via a standalone `eslint` `Linter.verify()` over:

    1 |
    2 | test.describe.skip('a whole describe, statically muted', () => {
    3 |   test('one', async () => {});
    4 |   test('two', async () => {});
    5 | });
    6 | test.skip('a single statically muted test', async () => {});
    7 | test.describe.serial.skip('serial chain', () => {});
    8 | describe.skip('jest style', () => {});

Observed, both rules, every run:

    --- no-skipped-tests: 2 problems
      6:1  Skipped test - ...
      8:1  Skipped test - ...
    --- no-disabled-tests: 2 problems
      6:1  Disabled test - ...
      8:1  Disabled test - ...

Lines **2** and **7** are silent. Line 2 mutes two tests; line 6 mutes one and IS
reported. Severity is inverted exactly as the issue reports.

**Where it diverges.** For `test.describe.skip(...)` the callee is a MemberExpression
whose `.object` is itself a MemberExpression (`test.describe`), not an Identifier.
The `object.type === 'Identifier'` guard is false, the first branch short-circuits,
the `x`-prefix branch does not match, `isSkipCall` returns `false`, nothing is reported.

**Recent changes.** Not a regression. `git log` on both files shows the flat-member
shape present since the rules were introduced (`b7d55eee7`, `83fbd5336`). The bug is
original, surfaced by Playwright's namespaced API.

**Deferrable (noted, NOT in scope).** `src/rules/no-focused-tests.ts` carries the same
flat-member guard for `.only`, so `test.describe.only()` is likely missed too. That is
a different rule and a different keyword; issue #1812 names only the two skip rules.
Not touched here - see Assumptions.

## Hypotheses

**H1 (single, falsifiable).** The failure occurs because the detection guard requires
`callee.object` to be an `Identifier`, which admits only a single-level member
expression. Playwright namespaces its API, so the callee chain is deeper than one link.

_Prediction:_ if detection instead walks the callee chain to its root Identifier and
tests the terminal property, `test.describe.skip` and `test.describe.serial.skip` are
reported, and every currently-reported spelling stays reported.

_Test:_ add the missing spellings as `invalid` RuleTester cases (must FAIL first),
then replace the guard with a chain walk and re-run (must PASS), then revert the walk
and confirm the new cases FAIL again.

**Phase 2 — ANALYZE.** Working example is the flat spelling in the same function:
`describe.skip` / `it.skip` / `test.skip` all satisfy the guard because their callee
object is a bare Identifier. The ONLY difference between the working and failing input
is the depth of the callee chain - not the root name, not the terminal property, not
the call shape. That isolates the guard as the sole cause.

## Resolution

Resolved: 2026-09-05

**H1 CONFIRMED.**

**Root cause.** `no-skipped-tests.ts` and `no-disabled-tests.ts` both gated skip
detection on `node.callee.object.type === 'Identifier'`. That guard admits only a
single-level member expression. Playwright namespaces its API, so `test.describe.skip()`
has a `MemberExpression` (`test.describe`) as its callee object and never matched.
Not a regression - present since each rule was introduced.

**Fix.** Added `isTestModifierCall(node, modifier)` to `src/utils/ast-helpers.ts`. It
resolves the callee to its dotted chain (`test.describe.serial.skip` ->
`['test','describe','serial','skip']`) and matches when the root is one of
describe/it/test and the FINAL link is the requested modifier. Both rules now delegate
to it with `'skip'`. Chain depth is no longer assumed; nothing else about either rule
changed. The `x`-prefix branch (`xdescribe`/`xit`/`xtest`) is untouched.

**Regression test.** `packages/eslint-plugin/tests/rules/no-skipped-tests.test.ts` and
`.../no-disabled-tests.test.ts` - three new `invalid` cases each (`test.describe.skip`,
`test.describe.serial.skip`, `test.describe.parallel.skip`) plus five new `valid` cases
per file pinning the false-positive boundary (`test.describe(...)`,
`test.describe.serial(...)`, `test.describe.parallel(...)`, `rateLimiter.skip(...)`,
`queue.batch.skip()`).

Command:
`pnpm --filter @harness-engineering/eslint-plugin exec vitest run tests/rules/no-skipped-tests.test.ts tests/rules/no-disabled-tests.test.ts`

**Revert-and-fail protocol (mandatory) - executed:**

    --- FIX REVERTED (tests unchanged) ---
     Test Files  2 failed (2)
          Tests  6 failed | 37 passed (43)
    --- FIX RESTORED ---
     Test Files  2 passed (2)
          Tests  43 passed (43)

Failure mode while reverted: `AssertionError: Should have 1 error but had 0: []`.

**Original issue scenario, re-run end to end** (standalone `Linter.verify()` over the
issue's snippet): 2 problems per rule before -> 4 after. Lines 2
(`test.describe.skip`) and 7 (`test.describe.serial.skip`) are now reported; lines 6
and 8 still are.

**Full verification.** Package suite 314/314 pass (27 files); `typecheck` clean;
`lint` clean.

**Learnings.**

1. Matching a call by `callee.object.type === 'Identifier'` silently assumes the API is
   flat. Any namespaced test API (Playwright is the common one) defeats it. When a rule
   targets a _modifier_ on a test global, walk the callee chain and check the terminal
   link - do not assume depth.
2. The failure is worse than a plain miss: it _inverts_ severity. The broad mute
   (`test.describe.skip`, a whole block) passes lint while the narrow one
   (`test.skip`, one test) errors. A team splitting a quarantine into per-test skips -
   strictly less muting - makes their lint result worse. When auditing a "disallow X"
   rule, always check that the BIGGEST form of X is caught, not just the common one.
3. Same flat-member shape still lives in `src/rules/no-focused-tests.ts` for `.only`
   (`test.describe.only()` is very likely missed). Left out of scope for #1812.
