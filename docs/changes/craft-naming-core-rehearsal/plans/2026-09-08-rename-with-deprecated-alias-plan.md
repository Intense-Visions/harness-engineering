# Plan: `rehearsalTierFor` → `rehearsalTierForScore` (rename with deprecated alias)

**Date:** 2026-09-08
**Spec:** `docs/changes/craft-naming-core-rehearsal/proposal.md`
**Issue:** [#2009](https://github.com/Intense-Visions/harness-engineering/issues/2009)
**Base SHA:** `b501db7d8e1ec613644e5d745453a273aa39c3b2`
**Tasks:** 7 | **Checkpoints:** 1 | **Time:** ~22 min | **Integration Tier:** medium
**Rigor:** standard (skeleton pass not required — 7 tasks < 8 threshold)

## Goal

Rename `rehearsalTierFor` to `rehearsalTierForScore` in `packages/core/src/rehearsal`, keeping
`rehearsalTierFor` reachable from the published `@harness-engineering/core` public entry as a
deprecated `const` alias, so the change ships semver-MINOR rather than MAJOR.

Decisions D1–D7 were settled at a human gate in the spec and are **not** re-litigated here.

## Ground truth (verified at base SHA `b501db7`)

Every location below was re-read at this SHA, not carried forward from the brief.

| Location                                                           | Verified content                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `packages/core/src/rehearsal/scoring.ts:24`                        | `export function rehearsalTierFor(score: number): RehearsalTier {`                  |
| `packages/core/src/rehearsal/scoring.ts:120`                       | `    tier: rehearsalTierFor(score),`                                                |
| `packages/core/src/rehearsal/index.ts:10`                          | `export { REHEARSAL_WEIGHTS, rehearsalTierFor, scoreRecovery } from './scoring';`   |
| `packages/core/src/index.ts:380`                                   | `export * from './rehearsal';`                                                      |
| `packages/core/src/rehearsal/scoring.test.ts:2`                    | `import { scoreRecovery, rehearsalTierFor, REHEARSAL_WEIGHTS } from './scoring';`   |
| `packages/core/src/rehearsal/scoring.test.ts:41,43,44,45,46,47,48` | `describe('rehearsalTierFor', ...)` + 6 assertions                                  |
| `scripts/generate-core-barrel.mjs`                                 | zero matches for `rehearsal` — confirms **D7** (no allowlist edit needed)           |
| `packages/core/package.json`                                       | `@harness-engineering/core@0.48.0`, `private` unset, `exports["."] -> dist/index.*` |

**Complete reference inventory.** A repo-wide grep for `rehearsalTierFor` (excluding
`node_modules`, `dist`, `.git`) returns exactly **11 code references across 3 source files**
(`scoring.ts` ×2, `index.ts` ×1, `scoring.test.ts` ×8), plus the spec document and the generated
comprehension shard. **There are no other importers anywhere in the monorepo** — in particular,
zero references in `packages/orchestrator`, which the scope limit puts off-limits. The file map
below is therefore provably complete.

**`.harness/comprehension/packages/core/src/rehearsal/_module.md`** contains two stale references
(`:36`, `:45`). It is a **generated artifact** — do NOT hand-edit it. The pre-commit comprehension
driver refreshes it; the execution agent stages whatever the hook rewrites.

## Baseline measurements (captured at base SHA, Node 22.23.2)

Measured with `cmd > /tmp/out 2>&1; echo $?` — never through a pipe.

| Command                                                                 | Exit | Signature                                                                                                                       | Gate quality    |
| ----------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `pnpm run generate:barrels:check`                                       | `0`  | "Command registry is up to date. Core barrel is up to date."                                                                    | **clean gate**  |
| `pnpm --filter @harness-engineering/core exec vitest run src/rehearsal` | `0`  | 2 files, 20 tests passed, 118ms                                                                                                 | **clean gate**  |
| `pnpm --filter @harness-engineering/core run typecheck`                 | `0`  | `tsc --noEmit` silent                                                                                                           | **clean gate**  |
| `npx eslint src/rehearsal` (in `packages/core`)                         | `0`  | no output                                                                                                                       | **clean gate**  |
| `harness validate`                                                      | `1`  | `x Validation failed (450 issues)`; 450 `^  \* ` bullets                                                                        | **AMBIENT RED** |
| `harness check-deps`                                                    | `1`  | exactly **1** `Circular dependency` line, in `packages/core/src/solutions/scan-candidates/`; **0** lines mentioning `rehearsal` | **AMBIENT RED** |

The first four gates are **green at baseline**, so any non-zero exit from them after this change is
a genuine regression — no differential reasoning needed. The last two are ambiently red for reasons
disjoint from `src/rehearsal`, so they are verified **differentially** against the signatures above,
not by exit code.

**Feasibility probe (resolves the spec's Risk 3).** Importing the full core public entry from source
under Node 22 was measured directly: `import('packages/core/src/index.ts')` exits `0` in **799 ms**
and resolves both `rehearsalTierFor` and `scoreRecovery` as functions. The public-entry reachability
test required by SC-3 is therefore cheap and safe; Risk 3 is retired with evidence, not assumed away.

## Observable truths (acceptance criteria, EARS-framed)

| ID       | Truth                                                                                                                                                                                                                               | Delivered by  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **SC-1** | The system shall export `rehearsalTierForScore` from `packages/core/src/rehearsal/scoring.ts` as the sole implementation, and `scoring.ts:120` shall call it.                                                                       | Task 2        |
| **SC-2** | When a consumer imports `rehearsalTierFor` from `@harness-engineering/core`, the system shall resolve it to a callable — i.e. it is present in `rehearsal/index.ts`'s named list.                                                   | Task 3        |
| **SC-3** | While both names are imported from the package public entry, the system shall resolve them to the identical function reference; and if the alias is dropped from the `rehearsal/index.ts` named list, then the test shall **fail**. | Tasks 1, 3, 6 |
| **SC-4** | The system shall carry both `@deprecated` and `@public` in `rehearsalTierFor`'s JSDoc.                                                                                                                                              | Task 2        |
| **SC-5** | The system shall include a MINOR changeset for `@harness-engineering/core`.                                                                                                                                                         | Task 5        |
| **SC-6** | `pnpm run generate:barrels:check` shall exit `0` with no barrel regeneration required.                                                                                                                                              | Task 7        |
| **SC-7** | `packages/core` typecheck and the `rehearsal` test suite shall pass, and the system shall introduce no new findings relative to the ambiently-red baseline.                                                                         | Task 7        |

Note the **second clause of SC-3** ("it fails if the alias is dropped"). A test that merely passes
does not prove this. Task 6 is a negative control that empirically demonstrates the failure mode; it
is the only step that actually satisfies SC-3 in full.

## NFR targets

None elicited. This lane runs unattended (fleet-dispatched), so every NFR dimension takes its
documented default:

- **Performance** — no new hot path; the change is a compile-time rename. Existing `check-perf`
  budgets stand.
- **Security** — no untrusted input, no secrets. `check-security` runs at its configured floor.
- **Scalability** — no load characteristics change.
- **Resilience** — no new failure mode; the alias is a same-reference binding (D3), so it cannot
  diverge behaviourally from the implementation.

The one perf-adjacent question (cost of importing the full core barrel in a unit test) was measured
above at 799 ms and is recorded as a concern, not an NFR task.

## Knowledge baseline

Skipped deliberately. The spec declares **Knowledge Impact: None** and **Documentation Updates:
none**; no PRD or business-domain document is in scope for a single-symbol rename. This is a
conscious skip, not an omission.

## Uncertainties

- **[RESOLVED]** Whether importing `../index` in a `packages/core` unit test is feasible and
  affordable. Measured: exit `0`, 799 ms, both symbols resolve. Was the only candidate blocker.
- **[ASSUMPTION]** The pre-commit comprehension driver refreshes
  `.harness/comprehension/packages/core/src/rehearsal/_module.md` automatically. If it does not fire,
  the shard keeps stale `rehearsalTierFor` lines — cosmetic, non-blocking, and must still **not** be
  hand-edited. Regenerate via the normal comprehension tooling if needed.
- **[ASSUMPTION]** `harness` on `PATH` resolves to the global install
  (`/Users/cwarner/.nvm/versions/node/v24.15.0/bin/harness`), not this worktree's `dist`. All
  baseline signatures above were captured with that binary. Task 7 must use **the same** binary or
  the differential is invalid.
- **[DEFERRABLE]** Exact `@deprecated` message wording. A concrete draft is supplied in Task 2;
  minor rewording is fine as long as `@deprecated` and `@public` both survive (SC-4).
- **[DEFERRABLE]** New test filename. Plan uses `public-entry.test.ts`.

No blocking uncertainties.

## File map

Exactly 5 files. Complete — proved by the repo-wide grep above.

```
MODIFY packages/core/src/rehearsal/scoring.ts        (rename decl :24, call site :120, add alias)
MODIFY packages/core/src/rehearsal/index.ts          (:10 named-export list — LOAD-BEARING, D4)
MODIFY packages/core/src/rehearsal/scoring.test.ts   (:2 import, :41-48 describe block)
CREATE packages/core/src/rehearsal/public-entry.test.ts   (SC-3 reachability test)
CREATE .changeset/rehearsal-tier-for-score.md        (MINOR, @harness-engineering/core)
```

**Explicitly NOT touched** (hard scope limit):

- `packages/orchestrator/src/core/**` — owned by a concurrent sibling lane. Zero references anyway.
- `scripts/generate-core-barrel.mjs` — D7; `rehearsal` is not a `SELECTIVE_EXPORTS` key. Proved
  mechanically by SC-6 rather than by editing.
- `docs/roadmap.md` / roadmap shards — no roadmap mutation in this lane.
- `.harness/comprehension/**` — generated; hook-refreshed, never hand-edited.

## Commit strategy

Tasks 1–3 form **one atomic commit**. This is a deliberate, documented deviation from
one-commit-per-task: the whole point of D4/D5 is that the intermediate states are _supposed_ to be
red (Task 1 red because the new name does not exist; Task 2 **still** red because the barrel has not
been extended — that red is the D4 silent-MAJOR trap made visible). Committing those states would
put a red tree in history. The tasks stay separate so the execution agent records each red
observation; the commit lands at the end of Task 3, when the tree is green. Tasks 4 and 5 commit
independently. Tasks 6 and 7 are verification-only and leave the tree unchanged.

## Tasks

---

### Task 1: Add the public-entry reachability test (RED)

**Depends on:** none | **Files:** `packages/core/src/rehearsal/public-entry.test.ts` | **Owns:** `packages/core/src/rehearsal/**`
**Delivers:** SC-3 (first clause)

1. Create `packages/core/src/rehearsal/public-entry.test.ts` with exactly:

```ts
import { describe, it, expect } from 'vitest';
import { rehearsalTierFor, rehearsalTierForScore } from '../index';

/**
 * Guards D4/D5: `packages/core/src/rehearsal/index.ts` is a *named* export list,
 * not `export *`. A symbol declared in `scoring.ts` but omitted from that list
 * compiles, passes every direct-import test, and is still absent from the
 * published package surface. Only an import through the public entry
 * (`scoring.ts` -> `rehearsal/index.ts` -> `core/index.ts`) exercises that chain.
 */
describe('rehearsal public entry surface', () => {
  it('exports rehearsalTierForScore from the package public entry', () => {
    expect(typeof rehearsalTierForScore).toBe('function');
    expect(rehearsalTierForScore(80)).toBe('pass');
    expect(rehearsalTierForScore(50)).toBe('partial');
    expect(rehearsalTierForScore(49)).toBe('fail');
  });

  it('keeps the deprecated rehearsalTierFor alias reachable from the public entry', () => {
    expect(typeof rehearsalTierFor).toBe('function');
  });

  it('resolves both names to the identical function reference', () => {
    expect(rehearsalTierFor).toBe(rehearsalTierForScore);
  });
});
```

2. Run and **observe failure** (`rehearsalTierForScore` does not exist yet):

```
export PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH
cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2009
pnpm --filter @harness-engineering/core exec vitest run src/rehearsal/public-entry.test.ts > /tmp/t1.out 2>&1; echo $?
```

Expect a **non-zero** exit. Record the failure message. **Do not commit.**

---

### Task 2: Rename in `scoring.ts` and add the deprecated `@public` alias

**Depends on:** Task 1 | **Files:** `packages/core/src/rehearsal/scoring.ts` | **Owns:** `packages/core/src/rehearsal/**`
**Delivers:** SC-1, SC-4

1. In `packages/core/src/rehearsal/scoring.ts`, replace line 24's declaration and append the alias
   immediately below the closing brace of the function (before the next JSDoc block):

```ts
/** Pass at >= 80, partial at >= 50, fail below. Exported so the boundary is testable. */
export function rehearsalTierForScore(score: number): RehearsalTier {
  if (score >= 80) return 'pass';
  if (score >= 50) return 'partial';
  return 'fail';
}

/**
 * Map a recovery score to its tier.
 *
 * @deprecated Use `rehearsalTierForScore` instead. The old name left its input
 * unnamed — `For` what? — so a reader at a call site could not tell whether the
 * argument was a score, a run, an attempt record, or a config. This alias is the
 * same function reference and is retained for API compatibility; it will be
 * removed in a future MAJOR release.
 * @public
 */
export const rehearsalTierFor = rehearsalTierForScore;
```

The `@public` tag is load-bearing (D6): `packages/core/src/entropy/detectors/dead-code.ts:405`
matches `/@public(Api)?\b/i` in the nearest preceding JSDoc to exempt an intentionally-public export
from `PUBLIC_API_UNUSED`. The alias has zero internal callers by construction.

2. Change the internal call site at `scoring.ts:120`:

```ts
    tier: rehearsalTierForScore(score),
```

3. Confirm no `rehearsalTierFor(` **call** remains in `scoring.ts` (the alias _declaration_ is the
   only surviving occurrence of the bare name):

```
grep -n "rehearsalTierFor" /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2009/packages/core/src/rehearsal/scoring.ts
```

Expect exactly two lines: the alias JSDoc's `rehearsalTierForScore` mention and
`export const rehearsalTierFor = rehearsalTierForScore;`.

4. Run the existing suite — it must stay **green** (it imports the alias, which still resolves):

```
export PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH
cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2009
pnpm --filter @harness-engineering/core exec vitest run src/rehearsal/scoring.test.ts > /tmp/t2a.out 2>&1; echo $?
```

Expect `0`.

5. Re-run the reachability test — it must **still fail**:

```
pnpm --filter @harness-engineering/core exec vitest run src/rehearsal/public-entry.test.ts > /tmp/t2b.out 2>&1; echo $?
```

Expect **non-zero**. This is the D4 trap made visible: the alias and the new name both exist in
`scoring.ts`, everything compiles, the direct-import tests pass — and the new name is _still_ absent
from the public surface. **Do not commit.**

---

### Task 3: Extend the `rehearsal/index.ts` named-export list (GREEN + commit)

**Depends on:** Task 2 | **Files:** `packages/core/src/rehearsal/index.ts` | **Owns:** `packages/core/src/rehearsal/**`
**Delivers:** SC-2, SC-3 (first clause)

1. Replace `packages/core/src/rehearsal/index.ts:10` with:

```ts
export {
  REHEARSAL_WEIGHTS,
  rehearsalTierForScore,
  rehearsalTierFor,
  scoreRecovery,
} from './scoring';
```

Multi-line is correct: the single-line form is 102 characters and `.prettierrc.json` sets
`printWidth: 100`, so prettier will not collapse it.

2. Reachability test must now pass:

```
export PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH
cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2009
pnpm --filter @harness-engineering/core exec vitest run src/rehearsal > /tmp/t3.out 2>&1; echo $?
```

Expect `0`, and **3 test files / 23 tests** (baseline 2 files / 20 tests, plus the 3 new ones).

3. Commit Tasks 1–3 together (see Commit strategy):

```
git add packages/core/src/rehearsal/scoring.ts \
        packages/core/src/rehearsal/index.ts \
        packages/core/src/rehearsal/public-entry.test.ts
git commit -m "feat(core): rename rehearsalTierFor to rehearsalTierForScore with deprecated alias"
```

If the pre-commit comprehension driver rewrites
`.harness/comprehension/packages/core/src/rehearsal/_module.md`, stage the **regenerated** file and
re-commit. Do not hand-edit it. If a pre-commit hook reformats any file, re-add and re-commit.

---

### Task 4: Retarget `scoring.test.ts` to the new name

**Depends on:** Task 3 | **Files:** `packages/core/src/rehearsal/scoring.test.ts` | **Owns:** `packages/core/src/rehearsal/**`
**Delivers:** SC-1 (unit tests exercise the implementation, not the alias)

1. Line 2 becomes:

```ts
import { scoreRecovery, rehearsalTierForScore, REHEARSAL_WEIGHTS } from './scoring';
```

2. Lines 41–48: rename the `describe` label and all 6 assertions:

```ts
describe('rehearsalTierForScore', () => {
  it('maps scores to tiers at the documented boundaries', () => {
    expect(rehearsalTierForScore(100)).toBe('pass');
    expect(rehearsalTierForScore(80)).toBe('pass');
    expect(rehearsalTierForScore(79)).toBe('partial');
    expect(rehearsalTierForScore(50)).toBe('partial');
    expect(rehearsalTierForScore(49)).toBe('fail');
    expect(rehearsalTierForScore(0)).toBe('fail');
  });
```

Keep the existing `it(...)` title if it differs — only the symbol references and the `describe`
label change. Alias coverage now lives in `public-entry.test.ts`, which is where it belongs.

3. Verify no `rehearsalTierFor` reference survives outside the alias declaration and the reachability
   test:

```
cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2009
grep -rn "rehearsalTierFor\b" packages/core/src --include="*.ts"
```

Expect exactly 2 hits: `scoring.ts` (alias declaration), `public-entry.test.ts` (import + assertions).

4. Run and commit:

```
export PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm --filter @harness-engineering/core exec vitest run src/rehearsal > /tmp/t4.out 2>&1; echo $?
git add packages/core/src/rehearsal/scoring.test.ts
git commit -m "test(core): retarget rehearsal scoring tests to rehearsalTierForScore"
```

Expect exit `0`, 3 files / 23 tests.

---

### Task 5: Add the MINOR changeset

**Depends on:** none (independent of Tasks 1–4; may run in parallel) | **Files:** `.changeset/rehearsal-tier-for-score.md` | **Owns:** `.changeset/**`
**Delivers:** SC-5

1. Create `.changeset/rehearsal-tier-for-score.md`:

```md
---
'@harness-engineering/core': minor
---

`rehearsalTierFor` is now `rehearsalTierForScore`; the old name stays as a deprecated alias

The old name predicted its return type but left its input unnamed — `For` what? At a
call site like `rehearsalTierFor(value)` a reader could not tell whether the argument was
a score, a run, an attempt record, or a config without opening the signature.
`rehearsalTierForScore(score)` names the artifact being mapped from.

`@harness-engineering/core` is published, so a bare rename would be a breaking change.
`rehearsalTierFor` is retained as a `@deprecated` alias — a `const` binding to the same
function, so `rehearsalTierFor === rehearsalTierForScore` holds and existing imports keep
working unchanged. That makes this release MINOR, not MAJOR. The alias will be removed in
a future MAJOR release.
```

2. Verify format (single quotes and `minor` match `.changeset/config.json`, which sets
   `"linked": []`, `"fixed": []`, `"ignore": []` — no special handling for core):

```
head -3 /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2009/.changeset/rehearsal-tier-for-score.md
```

3. Commit:

```
cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2009
git add .changeset/rehearsal-tier-for-score.md
git commit -m "docs(core): add MINOR changeset for rehearsalTierForScore rename"
```

---

### Task 6: Negative control — prove SC-3's failure clause

**Depends on:** Task 4 | **Files:** `packages/core/src/rehearsal/index.ts` (temporary, reverted) | **Category:** verification
**Delivers:** SC-3 (second clause — "it fails if the alias is dropped")

A passing test does not prove it would fail. This step demonstrates the failure mode empirically and
leaves the tree byte-identical.

1. Temporarily delete the `rehearsalTierFor,` line from the named-export list in
   `packages/core/src/rehearsal/index.ts`.

2. Run the reachability test and **observe failure**:

```
export PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH
cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2009
pnpm --filter @harness-engineering/core exec vitest run src/rehearsal/public-entry.test.ts > /tmp/t6-red.out 2>&1; echo $?
```

Expect **non-zero** — importing a name the module does not export is a link-time error, so the test
file fails to load. Record the message.

3. Restore and confirm the tree is clean:

```
git checkout -- packages/core/src/rehearsal/index.ts
git status --porcelain packages/core/src/rehearsal/index.ts
```

Expect **empty** output.

4. Re-run green:

```
pnpm --filter @harness-engineering/core exec vitest run src/rehearsal/public-entry.test.ts > /tmp/t6-green.out 2>&1; echo $?
```

Expect `0`. **No commit** — the working tree is unchanged.

---

### Task 7: Verification sweep against the recorded baseline `[checkpoint:human-verify]`

**Depends on:** Tasks 5, 6 | **Files:** none (read-only) | **Category:** verification
**Delivers:** SC-6, SC-7, and final SC-1..SC-7 traceability

Run each command with `cmd > /tmp/out 2>&1; echo $?` — never through a pipe, which would report the
pipe's exit status.

**Clean gates — assert exit `0` directly (all four were green at baseline):**

```
export PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH
cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2009

pnpm run generate:barrels:check > /tmp/v-barrels.out 2>&1; echo "BARRELS=$?"
# SC-6: expect 0 + "Core barrel is up to date." -> proves D7 (no allowlist edit needed)

pnpm --filter @harness-engineering/core run typecheck > /tmp/v-tsc.out 2>&1; echo "TSC=$?"
# SC-7: expect 0

pnpm --filter @harness-engineering/core exec vitest run src/rehearsal > /tmp/v-test.out 2>&1; echo "TEST=$?"
# SC-7: expect 0, "Test Files 3 passed (3)", "Tests 23 passed (23)"

cd packages/core && npx eslint src/rehearsal > /tmp/v-lint.out 2>&1; echo "LINT=$?"
# expect 0 (baseline was clean)
```

**Ambiently-red gates — assert the signature is UNCHANGED, not exit 0.** Use the same `harness`
binary that produced the baseline (`which harness` -> the global install, not this worktree's dist):

```
cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2009

harness check-deps > /tmp/v-deps.out 2>&1; echo "DEPS=$?"          # expect 1 (baseline)
grep -c "Circular dependency" /tmp/v-deps.out                       # expect exactly 1
grep -c "rehearsal" /tmp/v-deps.out                                 # expect exactly 0

harness validate > /tmp/v-validate.out 2>&1; echo "VALIDATE=$?"     # expect 1 (baseline)
grep -c "^  \* " /tmp/v-validate.out                                # expect exactly 450
grep -c "rehearsal" /tmp/v-validate.out                             # expect exactly 2 (roadmap rows only)
```

A count above 450, or any `rehearsal` line in `check-deps`, is a **real regression**. The two
`rehearsal` mentions in `validate` are roadmap rows ("...is 'planned' with no spec and no plan"),
not code findings — one of them is issue #2009 itself. They persist because roadmap mutation is out
of this lane's scope (the conductor owns it), so **450 remains the correct expected count**.

**Public-surface spot check** (independent of the test runner — SC-1/SC-2/SC-3 end to end):

```
node --import tsx -e "import('/Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2009/packages/core/src/index.ts').then(m => console.log('new=', typeof m.rehearsalTierForScore, 'old=', typeof m.rehearsalTierFor, 'identical=', m.rehearsalTierFor === m.rehearsalTierForScore))" > /tmp/v-surface.out 2>&1; echo $?
```

Expect exit `0` and `new= function old= function identical= true`.

**SC-4 spot check:**

```
grep -B8 "export const rehearsalTierFor = rehearsalTierForScore" packages/core/src/rehearsal/scoring.ts | grep -cE "@deprecated|@public"
```

Expect `2`.

**Traceability table — fill in and present to the human:**

| SC   | Verified by                                           | Result |
| ---- | ----------------------------------------------------- | ------ |
| SC-1 | `grep` + `TEST=0` (Task 4 step 3)                     |        |
| SC-2 | `/tmp/v-surface.out` `old= function`                  |        |
| SC-3 | `TEST=0` + Task 6 negative control non-zero           |        |
| SC-4 | JSDoc grep returns `2`                                |        |
| SC-5 | `.changeset/rehearsal-tier-for-score.md` exists       |        |
| SC-6 | `BARRELS=0`                                           |        |
| SC-7 | `TSC=0`, `TEST=0`, deps/validate signatures unchanged |        |

**[checkpoint:human-verify]** — present the filled table and the git log (3 commits), then stop and
wait for sign-off before opening a PR.

---

## Sequencing and parallelism

| Wave | Tasks | Notes                                                       |
| ---- | ----- | ----------------------------------------------------------- |
| 1    | 1, 5  | Task 5 (changeset) shares no files with the code path       |
| 2    | 2     | depends on Task 1's red observation                         |
| 3    | 3     | the load-bearing barrel edit; commit boundary for Tasks 1–3 |
| 4    | 4     |                                                             |
| 5    | 6     |                                                             |
| 6    | 7     | depends on 5 and 6                                          |

Tasks 1, 2, 3, 4, 6 all own `packages/core/src/rehearsal/**` and overlap on files, so they are
strictly serial. Only Task 5 is genuinely parallelizable.

## Integration tier: medium

Per the harness-planning heuristics: new feature within an existing package, **one new public
export**, 5 files. Not `small` (small requires no new exports).

| Integration point       | Status                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Entry points            | `packages/core/src/index.ts:380` via `rehearsal/index.ts:10` — Task 3                                  |
| Registrations required  | `rehearsal/index.ts` named list (D4) — Task 3. No `generate-core-barrel.mjs` edit (D7), proved by SC-6 |
| Documentation updates   | None. No `docs/` page names this symbol (verified by repo-wide grep)                                   |
| Changelog               | Changeset — Task 5                                                                                     |
| Graph / comprehension   | `_module.md` shard refreshed by the pre-commit driver, never hand-edited                               |
| Architectural decisions | None. D2 applies an existing semver convention                                                         |
| Knowledge impact        | None                                                                                                   |
| Roadmap                 | **Out of lane scope** — deferred to the conductor                                                      |

## Concerns

1. **The barrel edit is the only thing standing between MINOR and MAJOR.** If Task 3 is skipped or
   partially applied, everything compiles, `scoring.test.ts` passes, and the package silently ships a
   breaking change labelled MINOR. Tasks 1, 2 and 6 exist solely to make this failure mode
   observable. Do not let an executing agent "optimize" them away.
2. **`.harness/comprehension/.../rehearsal/_module.md` is generated.** It holds two stale references
   (`:36`, `:45`). Hand-editing it will churn against the driver. The driver is local-only, so if it
   does not fire the shard stays stale — cosmetic and non-blocking.
3. **Ambient baseline is red and must not be "fixed."** `harness validate` exits 1 with 450 findings
   (hardcoded colors in test fixtures) and `harness check-deps` exits 1 with 1 circular dep in
   `packages/core/src/solutions/scan-candidates/`. Both are disjoint from `src/rehearsal`. Task 7
   verifies signatures, not exit codes. An agent that tries to green these has left the lane.
4. **`harness` on PATH is the global install**, not this worktree's `dist`. Baselines were captured
   with it; Task 7 must use the same binary or the differential is meaningless.
5. **Node 22 is required.** Node 24 (the shell default) produces roughly 14 phantom sqlite failures
   in `packages/core`. Every command in this plan prepends
   `/Users/cwarner/.nvm/versions/node/v22.23.2/bin` to `PATH`.
6. **Concurrent sibling lane owns `packages/orchestrator/src/core`.** This plan touches zero files
   there (and needs none — grep confirms no orchestrator reference to the symbol). Do not expand scope.
7. **The alias will have zero internal callers by design**, so the dead-code detector would flag
   `PUBLIC_API_UNUSED` without D6's `@public` tag. That finding is advisory-only
   (`persona-entropy-cleaner.yml:33` is non-blocking), but dropping `@public` reintroduces recurring
   noise on every future sweep.
8. **Tasks 1–3 share one commit.** Deliberate: the intermediate states are supposed to be red.
   Documented in Commit strategy above so it is not mistaken for sloppiness.
9. **The reachability test imports the whole core barrel** (~799 ms measured). Acceptable for one
   narrow test; do not propagate this import pattern into other test files.
