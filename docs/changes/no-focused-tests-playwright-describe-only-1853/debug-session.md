# Debug Session: `no-focused-tests` misses `test.describe.only()`

Status: resolved
Started: 2026-09-06
Resolved: 2026-09-06
Issue: https://github.com/Intense-Visions/harness-engineering/issues/1853
Base SHA: c1ca02ba2
Error: `test.describe.only('...', () => {})` (Playwright) produces NO lint error from
`@harness-engineering/no-focused-tests`, while the strictly-smaller focus
`test.only('...')` does report. `.only` mutes every _other_ test in the file, so the
broader mute passes lint while CI still reports green.

## Investigation Log

### Phase 1 — INVESTIGATE (read-only)

**Entropy analysis.** `harness cleanup` reports 5754 entropy issues repo-wide, all
doc-drift `RENAMED` / `NOT_FOUND` symbol findings under `docs/`. Nothing at the failure
site: no finding names `src/rules/no-focused-tests.ts` or `src/utils/ast-helpers.ts`.
Entropy is not a contributing factor here.

**What failed.** One rule under-reports.
`packages/eslint-plugin/src/rules/no-focused-tests.ts:28-34` gates focus detection on:

    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&                  // <-- the guard
    (object.name === 'describe' | 'it' | 'test') &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'only'

**Reproduced consistently** (3/3 identical runs) via a standalone `eslint`
`Linter.verify()` over:

     1 |
     2 | test.describe.only('a whole describe, focused - mutes every OTHER test in the file', () => {
     3 |   test('one', async () => {});
     4 |   test('two', async () => {});
     5 | });
     6 | test.only('a single focused test', async () => {});
     7 | test.describe.serial.only('serial chain, focused', () => {});
     8 | describe.only('jest style', () => {});
     9 | it.only('jest style single', () => {});
    10 | fdescribe('jasmine style', () => {});
    11 | fit('jasmine style single', () => {});

Observed, every run:

    --- no-focused-tests: 5 problems
      6:1  Focused test - ...
      8:1  Focused test - ...
      9:1  Focused test - ...
      10:1 Focused test - ...
      11:1 Focused test - ...

Lines **2** and **7** are silent. Line 2 focuses a whole block and therefore mutes
every other test in the file; line 6 focuses one test and IS reported. Severity is
inverted exactly as the issue describes.

**Where it diverges.** For `test.describe.only(...)` the callee is a MemberExpression
whose `.object` is itself a MemberExpression (`test.describe`), not an Identifier. The
`object.type === 'Identifier'` guard is false, the first branch short-circuits, the
`f`-prefix branch does not match, nothing is reported.

**Recent changes.** Not a regression. `git log` on the rule shows a single commit
(`938ba6f55`, "feat(eslint-plugin): add no-focused-tests rule (#868)"); the flat-member
shape has been present since the rule was introduced. The bug is original, surfaced by
Playwright's namespaced API.

**External corroboration.** The vendored Playwright-lint ESTree bundle in the repo
(`packages/cli/dist/estree-*.js`) enumerates `test.describe.only`,
`test.describe.parallel.only`, and `test.describe.serial.only` among its known test
spellings - independent confirmation that these are real, current Playwright forms and
not a speculative shape.

### Phase 2 — ANALYZE

**Working example #1 (same file).** The flat spellings `describe.only` / `it.only` /
`test.only` all satisfy the guard because their callee object is a bare Identifier. The
ONLY difference between the working and failing input is the DEPTH of the callee chain -
not the root name, not the terminal property, not the call shape. That isolates the
guard as the sole cause.

**Working example #2 (sibling rule, already fixed).** `no-skipped-tests` was repaired
for the identical defect by #1812 / PR #1851 and now delegates to
`isTestModifierCall(node, 'skip')`. Running the same standalone harness against it with
`.only` swapped for `.skip` reports **7/7** problems, including the two nested lines
that `no-focused-tests` misses. Same file structure, same node shapes, same call sites -
the detection guard is the only difference.

**The helper is already proven for this modifier.**
`packages/eslint-plugin/tests/utils/ast-helpers.test.ts:145-150` already asserts
`isTestModifierCall(firstCall("test.describe.only('s', () => {});"), 'only') === true`.
The helper was parameterised by modifier precisely so this rule could adopt it. What is
missing is only the rule's adoption.

## Hypotheses

**H1 (single, falsifiable).** The failure occurs because the detection guard requires
`callee.object` to be an `Identifier`, which admits only a single-level member
expression. Playwright namespaces its API, so the callee chain is deeper than one link.

_Prediction:_ if detection instead walks the callee chain to its root Identifier and
tests the terminal property (i.e. delegates to `isTestModifierCall(node, 'only')`), then
`test.describe.only` and `test.describe.serial.only` are reported, and every
currently-reported spelling stays reported.

_Test:_ add the missing spellings as `invalid` RuleTester cases (must FAIL first), then
replace the guard with the chain walk and re-run (must PASS), then revert the walk and
confirm the new cases FAIL again.

## Resolution

**H1 CONFIRMED.**

**Root cause.** `no-focused-tests.ts` gated focus detection on
`node.callee.object.type === 'Identifier'`. That guard admits only a single-level member
expression. Playwright namespaces its API, so `test.describe.only()` has a
`MemberExpression` (`test.describe`) as its callee object and never matched. Not a
regression - present since the rule was introduced in `938ba6f55`.

**Fix.** The rule now delegates to the existing
`isTestModifierCall(node, 'only')` from `src/utils/ast-helpers.ts` (added by PR #1851,
already parameterised by modifier for exactly this adoption), mirroring
`no-skipped-tests.ts` and `no-disabled-tests.ts` line for line. Chain depth is no longer
assumed. The `f`-prefix branch (`fdescribe` / `fit`) is untouched - `isTestModifierCall`
does not cover bare identifiers and the branch is still required.

**Regression test.** `packages/eslint-plugin/tests/rules/no-focused-tests.test.ts` -
three new `invalid` cases (`test.describe.only`, `test.describe.serial.only`,
`test.describe.parallel.only`) plus nine new `valid` cases pinning the false-positive
boundary: `test.describe(...)`, `test.describe.serial(...)`, `test.describe.parallel(...)`,
`test.describe.skip(...)`, `test.skip(...)`, `describe.skip(...)`,
`rateLimiter.only(...)`, `queue.batch.only()`, and bare `only(...)`. The `.skip` valid
cases pin the rule-ownership boundary: `no-focused-tests` owns `.only` alone and must
not start double-reporting skips that `no-skipped-tests` / `no-disabled-tests` already
report.

Command:
`pnpm --filter @harness-engineering/eslint-plugin exec vitest run tests/rules/no-focused-tests.test.ts`

**Revert-and-fail protocol (mandatory) - executed:**

    --- BEFORE FIX (test written first, rule untouched) ---
     Test Files  1 failed (1)
          Tests  3 failed | 20 passed (23)
     AssertionError: Should have 1 error but had 0: []

    --- AFTER FIX ---
     Test Files  1 passed (1)
          Tests  23 passed (23)

    --- FIX REVERTED (tests unchanged) ---
     Test Files  1 failed (1)
          Tests  3 failed | 20 passed (23)

    --- FIX RESTORED ---
     Test Files  1 passed (1)
          Tests  23 passed (23)

**Original issue scenario, re-run end to end** (standalone `Linter.verify()` over the
snippet above): **5 problems before -> 7 after**. Lines 2 (`test.describe.only`) and 7
(`test.describe.serial.only`) are now reported; lines 6, 8, 9, 10 and 11 still are.

**Full verification.** Package suite **341/341 pass** (27 files); `typecheck` clean;
`lint` clean. Repo-wide grep confirms no source file uses `test.describe.only` /
`.serial.only` / `.parallel.only`, so the broadened matcher introduces no new lint
failures anywhere in this repo. `harness check-deps` reports one pre-existing circular
dependency in `packages/core/src/solutions/scan-candidates/` - untouched by this change
and present at base SHA `c1ca02ba2`.

**Learnings.**

1. Matching a call by `callee.object.type === 'Identifier'` silently assumes the API is
   flat. Any namespaced test API (Playwright is the common one) defeats it. When a rule
   targets a _modifier_ on a test global, walk the callee chain and check the terminal
   link - do not assume depth.
2. `.only` inverts severity harder than `.skip` did. `test.describe.skip` mutes the
   block it is attached to; `test.describe.only` mutes every OTHER test in the file
   while CI still reports green. The rule that exists precisely to prevent that was
   silent on the single most dangerous spelling.
3. Fixing one instance of a shape is not fixing the shape. #1812 repaired two of the
   three rules carrying the identical flat-member guard and explicitly logged the third
   as a follow-up; without that logged note this defect would have stayed latent. When a
   fix leaves a known sibling unrepaired, file it - the note is the only thing that
   closes the loop.
