# Plan: Craft naming in `packages/orchestrator/src/core`

**Date:** 2026-09-08 | **Spec:** `docs/changes/craft-naming-orchestrator-core/proposal.md` | **Issue:** [#2001](https://github.com/Intense-Visions/harness-engineering/issues/2001) | **Tasks:** 9 | **Checkpoints:** 2 | **Time:** ~33 min | **Integration Tier:** small

**Worktree:** `/Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001`
**Branch:** `fc2/craft-naming-orch-core-2001`
**Base (scope-audit ref):** `fef03ac5ea510de1b109a76536c68c92a17f6771` (`git merge-base HEAD origin/main`)

---

## Environment constraints (apply to EVERY command in this plan)

### N1 — Node 22 only

`better-sqlite3` in this worktree is built for the Node 22 ABI. Node 24 produces ~14 phantom
sqlite failures that are **not** real regressions. Every command below is prefixed with:

```
PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH
```

Verified present: `/Users/cwarner/.nvm/versions/node/v22.23.2/bin/node` → `v22.23.2`.

The global `harness` shim lives at `/Users/cwarner/.nvm/versions/node/v24.15.0/bin/harness` but its
shebang is `#!/usr/bin/env node`, so prefixing `PATH` with the v22 bin makes it run under Node 22.
Confirm once before Task 8 with:

```bash
cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
  PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH node -v > /tmp/nodever.out 2>&1; echo "EXIT=$?"; cat /tmp/nodever.out
```

Expected: `EXIT=0`, `v22.23.2`.

### N2 — Exit codes are measured directly, never through a pipe

A pipe to `tail`/`head` reports the exit code of `tail`, not the command. Every verification step
uses the form:

```bash
<command> > /tmp/<name>.out 2>&1; echo "EXIT=$?"; tail -40 /tmp/<name>.out
```

The `echo "EXIT=$?"` runs **before** any pipe. Do not rewrite these as `<command> | tail`.

### N3 — NEVER a repo-wide find/replace on `reconcile`

`reconcile` is a common English word. A repo-wide grep matches ~460 prose/doc/CHANGELOG/skill
locations plus **four unrelated real symbols that must not change**:

| Not the target                      | Location                                                   |
| ----------------------------------- | ---------------------------------------------------------- |
| `export function reconcile`         | `scripts/audit-exceptions.mjs:115`                         |
| `KnowledgePipelineRunner.reconcile` | `packages/graph/src/ingest/KnowledgePipelineRunner.ts:491` |
| `PoolManager.reconcile`             | `packages/local-models/src/pool/manager.ts:541`            |
| `harness roadmap reconcile` (CLI)   | `packages/cli/src/commands/roadmap/reconcile.ts`           |

Every edit in this plan is a **named, line-anchored** edit to a file in the edit-set table. No
`sed -i` across a directory. No `grep -rl … | xargs sed`.

Additional in-file traps inside `state-machine.ts` — these three identifiers contain the substring
`reconcile` and **must remain unchanged**:

- `reconcileCompletedAndClaimed` (declared line 304, called line 480)
- `applyReconcileEffects` (called line 477)
- the local `const reconcileEffects` (line 468, used lines 474 and 477)

### N4 — Do NOT touch `packages/core/src/rehearsal`

A concurrent sibling lane owns that directory (`catalog.ts`, `scoring.ts`, and their tests). No task
in this plan reads or writes it; the Task 9 scope audit fails the lane if it appears in the diff.

---

## Goal

Rename three exported `packages/orchestrator/src/core` identifiers to unit- and intent-carrying names,
keep every old name callable as a `@deprecated` alias that is **provably reachable from the published
package entry point**, and ship it as a minor changeset — without touching one file outside the spec's
closed edit set.

---

## Observable Truths (Acceptance Criteria)

Traceability to the spec's success criteria (SC1–SC8) is noted per row.

| #   | Observable truth (EARS)                                                                                                                                                                                                                                                         | Spec SC | Delivered by              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------- |
| OT1 | **When** a consumer imports `calculateRetryDelayMs`, `resolvePeriodLengthMs`, or `reconcileRunningIssues` from the package root (`src/index`), **the system shall** resolve each to a `function`.                                                                               | SC1     | T1, T2, T3, T5            |
| OT2 | **When** a consumer imports `calculateRetryDelay`, `periodLengthMs`, or `reconcile` from the package root, **the system shall** resolve it to the identical function object as its new name (`===`).                                                                            | SC2     | T1, T2, T3, T5            |
| OT3 | **If** any deprecated alias is declared in its module but omitted from `src/core/index.ts`, **then** `PATH=…v22…:$PATH pnpm --filter @harness-engineering/orchestrator exec vitest run tests/core/naming-aliases.test.ts` shall exit non-zero.                                  | SC3     | T4 (proved RED before T5) |
| OT4 | Each of the three old names carries a `@deprecated` JSDoc tag naming its replacement — `grep -c '@deprecated'` returns `1` in each of `retry.ts`, `budget-governor.ts`, `reconciliation.ts`.                                                                                    | SC4     | T1, T2, T3                |
| OT5 | `grep -nE '(^\|[^A-Za-z])effects\b' packages/orchestrator/src/core/reconciliation.ts` returns no lines (exit 1); the accumulator is `sideEffects`.                                                                                                                              | SC5     | T3, audited T9            |
| OT6 | `pnpm --filter @harness-engineering/orchestrator typecheck` and `… test` both exit `0` under Node 22.                                                                                                                                                                           | SC6     | T8                        |
| OT7 | `git diff --name-only fef03ac5e..HEAD` lists exactly the edit-set files and nothing else — in particular none of `scripts/audit-exceptions.mjs`, `packages/graph/`, `packages/local-models/`, `packages/cli/src/commands/roadmap/reconcile.ts`, `packages/core/src/rehearsal/`. | SC7     | T9                        |
| OT8 | A changeset file exists declaring `'@harness-engineering/orchestrator': minor`.                                                                                                                                                                                                 | SC8     | T7                        |

## Skill recommendations

`docs/changes/craft-naming-orchestrator-core/SKILLS.md` (Pipeline Skill Advisor) lists **no Apply-tier
skills** — 10 Reference-tier entries, all generic TypeScript/GoF matches at relevance 0.39–0.54 driven
by the `typescript` stack marker rather than by this change. Only `ts-module-patterns` (keyword
`barrel-exports`, 0.44) maps to actual work here; it is annotated on Task 5. The rest
(`gof-*`, `ts-zod-integration`, `ts-template-literal-types`, `ts-mapped-types`, …) concern
architecture decisions this rename does not make, and are not annotated onto any task.

## NFR Targets

None elicited. This is a behaviour-preserving rename: no new hot path (no benchmark target), no new
untrusted-input or secret-handling surface (`check-security` runs at its existing floor), no change to
input size or concurrency (existing complexity/coupling budgets stand), and no new failure mode
(existing suite covers the failure paths). No `category: nfr` tasks are emitted; the plan is identical
to one produced without NFR elicitation.

---

## File Map (closed — this is the complete set)

```
MODIFY packages/orchestrator/src/core/retry.ts                           (rename fn, add alias)
MODIFY packages/orchestrator/src/core/budget-governor.ts                 (rename fn, 2 call sites, add alias)
MODIFY packages/orchestrator/src/core/reconciliation.ts                  (rename fn, effects→sideEffects, add alias)
MODIFY packages/orchestrator/src/core/index.ts                           (barrel: both names × 3 symbols)
MODIFY packages/orchestrator/src/core/state-machine.ts                   (imports L27-28, call sites L198, L468)
MODIFY packages/orchestrator/tests/core/retry.test.ts                    (exercise calculateRetryDelayMs)
MODIFY packages/orchestrator/tests/core/reconciliation.test.ts           (exercise reconcileRunningIssues)
MODIFY packages/orchestrator/tests/core/budget-governor.behavior.test.ts (exercise resolvePeriodLengthMs)
CREATE packages/orchestrator/tests/core/naming-aliases.test.ts           (D2 reachability proof)
MODIFY packages/orchestrator/README.md                                   (symbol table rows L134, L135)
CREATE .changeset/craft-naming-orchestrator-core.md                      (minor bump)
CREATE docs/changes/craft-naming-orchestrator-core/plans/2026-09-08-craft-naming-orchestrator-core-plan.md  (this file)
```

Already present on the branch from the spec commit `9e5913b58` (not written by any task here, but
in-scope lane artifacts that the Task 9 audit must allow):

```
(present) docs/changes/craft-naming-orchestrator-core/proposal.md   the spec
(present) docs/changes/craft-naming-orchestrator-core/SKILLS.md     Pipeline Skill Advisor output
(tolerated) .harness/comprehension/**/_module.md                    pre-commit comprehension driver, machine-written
```

**No other file may appear in the diff.** In particular the barrel of `@harness-engineering/core` is
irrelevant here: `packages/orchestrator/src/core/index.ts` is **hand-maintained** and is _not_ produced
by `scripts/generate-core-barrel.mjs` (that script serves `@harness-engineering/core`), so no allowlist
edit is required. `packages/orchestrator/src/index.ts` already contains `export * from './core/index'`
(line 12) and needs **no** edit.

### Evidence for the file map (verified in-worktree)

- `packages/orchestrator/src/core/retry.ts:11` — `export function calculateRetryDelay(`
- `packages/orchestrator/src/core/budget-governor.ts:36` — `export function periodLengthMs(`; internal call sites at `:73` and `:239`
- `packages/orchestrator/src/core/reconciliation.ts:16` — `export function reconcile(`; local accumulator `:22` `const effects: SideEffect[] = []`
- `packages/orchestrator/src/core/index.ts:1,15,22` — the three barrel lines
- `packages/orchestrator/src/core/state-machine.ts:27,28` — imports; `:198`, `:468` — call sites
- `packages/orchestrator/README.md:134` (`reconcile`), `:135` (`calculateRetryDelay`) — the symbol table rows. `periodLengthMs` is **not** in the README.
- Exhaustive grep confirms **zero** cross-package importers of `calculateRetryDelay` / `periodLengthMs` outside `packages/orchestrator/`, and `state-machine.ts` is the only real importer of `reconcile`.
- Precedent for the D2 root import: `packages/orchestrator/tests/maintenance/barrel-exports.test.ts:2` already does `import * as orch from '../../src/index'` and passes in this suite — so the root-barrel import is a proven-working shape here, not a novel risk.

---

## Skeleton

1. Module renames + aliases, each red-green against its own test file (~3 tasks, ~12 min)
2. Alias reachability proof RED, then barrel wiring GREEN (~2 tasks, ~7 min)
3. Importer update (~1 task, ~4 min)
4. Docs + changeset (~1 task, ~3 min)
5. Full verification + closed scope audit (~2 tasks, ~7 min)

**Estimated total:** 9 tasks, ~33 minutes.

_Skeleton approved: yes — it is a 1:1 restatement of the spec's own human-approved "Implementation
order" section (steps 1–6), with step 4's alias proof pulled **before** step 2's barrel wiring so the
load-bearing test has a genuine RED state. No new direction was introduced, so no fresh approval gate
was opened._

---

## TDD posture (read before Task 1)

Because D1 keeps a working alias for every renamed symbol, the _existing_ tests keep passing after a
rename — a rename alone has no natural RED. Each of Tasks 1–3 therefore gets its RED honestly, by
switching its test file to the **new** name first (the new name does not exist yet ⇒ failure), then
performing the rename (⇒ pass). Task 4 is the one genuine behavioural RED in the plan: the alias
reachability proof fails because the barrel has not been wired, and Task 5 turns it green.

---

## Tasks

### Task 1: Rename `calculateRetryDelay` → `calculateRetryDelayMs` with a deprecated alias

**Depends on:** none | **Files:** `packages/orchestrator/tests/core/retry.test.ts`, `packages/orchestrator/src/core/retry.ts` | **Owns:** `packages/orchestrator/src/core/retry.ts`

1. **RED — switch the test to the new name.** In `packages/orchestrator/tests/core/retry.test.ts`,
   replace the import on line 2 and every call. Exactly two textual substitutions, both scoped to this
   one file (no `-r`, no directory glob):

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     sed -i '' 's/\bcalculateRetryDelay\b/calculateRetryDelayMs/g' packages/orchestrator/tests/core/retry.test.ts
   ```

   This file contains no other identifier matching `\bcalculateRetryDelay\b` (verified: 16 occurrences,
   all the target). Confirm the import line now reads:

   ```ts
   import { calculateRetryDelayMs } from '../../src/core/retry';
   ```

2. **Observe the failure.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH \
     pnpm --filter @harness-engineering/orchestrator exec vitest run tests/core/retry.test.ts \
     > /tmp/t1-red.out 2>&1; echo "EXIT=$?"; tail -40 /tmp/t1-red.out
   ```

   Expected: `EXIT` is non-zero (`calculateRetryDelayMs is not a function` / not exported).

3. **GREEN — rename the function and add the alias.** In `packages/orchestrator/src/core/retry.ts`,
   change line 11's declaration and append the alias after the closing brace (line 21). The final file
   tail must read:

   ```ts
   /**
    * Calculate the retry delay in milliseconds, based on attempt number and retry type.
    *
    * Continuation retries: fixed 1000ms delay.
    * Failure retries: exponential backoff 10000 * 2^(attempt-1), capped at maxRetryBackoffMs.
    */
   export function calculateRetryDelayMs(
     attempt: number,
     type: 'continuation' | 'failure',
     maxRetryBackoffMs: number = DEFAULT_MAX_RETRY_BACKOFF_MS
   ): number {
     if (type === 'continuation') {
       return CONTINUATION_DELAY_MS;
     }
     const delay = BASE_FAILURE_DELAY_MS * Math.pow(2, attempt - 1);
     return Math.min(delay, maxRetryBackoffMs);
   }

   /** @deprecated Use `calculateRetryDelayMs` instead. */
   export const calculateRetryDelay = calculateRetryDelayMs;
   ```

   The body is unchanged. The alias is a `const` (not `export { x as y }`) so the `@deprecated` JSDoc
   attaches to a declaration the TypeScript language service surfaces with strikethrough at consumer
   call sites (spec "Alias shape").

4. **Observe the pass.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH \
     pnpm --filter @harness-engineering/orchestrator exec vitest run tests/core/retry.test.ts \
     > /tmp/t1-green.out 2>&1; echo "EXIT=$?"; tail -20 /tmp/t1-green.out
   ```

   Expected: `EXIT=0`.

5. **Assert the deprecation tag (OT4).**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     grep -c '@deprecated' packages/orchestrator/src/core/retry.ts > /tmp/t1-dep.out 2>&1; echo "EXIT=$?"; cat /tmp/t1-dep.out
   ```

   Expected: `EXIT=0`, output `1`.

6. **Commit.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     git add packages/orchestrator/src/core/retry.ts packages/orchestrator/tests/core/retry.test.ts && \
     git commit -m "craft(orchestrator): rename calculateRetryDelay to calculateRetryDelayMs with deprecated alias"
   ```

---

### Task 2: Rename `periodLengthMs` → `resolvePeriodLengthMs` with a deprecated alias

**Depends on:** none | **Files:** `packages/orchestrator/tests/core/budget-governor.behavior.test.ts`, `packages/orchestrator/src/core/budget-governor.ts` | **Owns:** `packages/orchestrator/src/core/budget-governor.ts`

Runs in parallel with Tasks 1 and 3 (disjoint files, no shared state).

1. **RED — switch the test to the new name.** In
   `packages/orchestrator/tests/core/budget-governor.behavior.test.ts`, replace the import name (line 9)
   and the 4 call sites (lines 79, 94 ×2, 162, 177). Scoped to this one file:

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     sed -i '' 's/\bperiodLengthMs\b/resolvePeriodLengthMs/g' packages/orchestrator/tests/core/budget-governor.behavior.test.ts
   ```

   **Guard:** `\b` word boundaries matter — this file also contains `state.periodStartMs`,
   `status.periodEndMs`, and `status.periodStartMs`, none of which match `\bperiodLengthMs\b`. Verify
   none were disturbed:

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     grep -nE 'periodStartMs|periodEndMs|PeriodLengthMs' packages/orchestrator/tests/core/budget-governor.behavior.test.ts \
     > /tmp/t2-guard.out 2>&1; echo "EXIT=$?"; cat /tmp/t2-guard.out
   ```

   Expected: `periodStartMs` / `periodEndMs` occurrences intact; every length reference now
   `resolvePeriodLengthMs`.

2. **Observe the failure.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH \
     pnpm --filter @harness-engineering/orchestrator exec vitest run tests/core/budget-governor.behavior.test.ts \
     > /tmp/t2-red.out 2>&1; echo "EXIT=$?"; tail -40 /tmp/t2-red.out
   ```

   Expected: `EXIT` non-zero.

3. **GREEN — rename the declaration.** In `packages/orchestrator/src/core/budget-governor.ts` line 36:

   ```ts
   /** Length of one accounting window, in ms. */
   export function resolvePeriodLengthMs(period: AgentBudgetConfig['period']): number {
     return period === 'week' ? WEEK_MS : DAY_MS;
   }

   /** @deprecated Use `resolvePeriodLengthMs` instead. */
   export const periodLengthMs = resolvePeriodLengthMs;
   ```

   The alias `const` goes immediately after the function (i.e. after old line 38), so it is in module
   scope and initialised at module evaluation.

4. **GREEN — update the two internal call sites.** Both must move to the new name, otherwise they read
   the alias `const` and (for any site evaluated during module init) would hit a TDZ error.
   - line 73, inside `windowElapsed`:

     ```ts
     return nowMs - state.periodStartMs >= resolvePeriodLengthMs(period);
     ```

   - line 239, inside the status builder:

     ```ts
     periodEndMs: periodStartMs + resolvePeriodLengthMs(config.period),
     ```

5. **Assert no stale internal call site remains.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     grep -nE '(^|[^A-Za-z])periodLengthMs\b' packages/orchestrator/src/core/budget-governor.ts \
     > /tmp/t2-stale.out 2>&1; echo "EXIT=$?"; cat /tmp/t2-stale.out
   ```

   Expected: exactly **one** line — the `export const periodLengthMs = resolvePeriodLengthMs;` alias.
   Any other hit is a missed call site.

6. **Observe the pass.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH \
     pnpm --filter @harness-engineering/orchestrator exec vitest run tests/core/budget-governor.behavior.test.ts tests/core/budget-governor.wired.test.ts \
     > /tmp/t2-green.out 2>&1; echo "EXIT=$?"; tail -20 /tmp/t2-green.out
   ```

   Expected: `EXIT=0`. (`budget-governor.wired.test.ts` is included as a regression guard; it is **not**
   edited and must stay green through the alias.)

7. **Commit.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     git add packages/orchestrator/src/core/budget-governor.ts packages/orchestrator/tests/core/budget-governor.behavior.test.ts && \
     git commit -m "craft(orchestrator): rename periodLengthMs to resolvePeriodLengthMs with deprecated alias"
   ```

---

### Task 3: Rename `reconcile` → `reconcileRunningIssues`, `effects` → `sideEffects`, add deprecated alias

**Depends on:** none | **Files:** `packages/orchestrator/tests/core/reconciliation.test.ts`, `packages/orchestrator/src/core/reconciliation.ts` | **Owns:** `packages/orchestrator/src/core/reconciliation.ts`

Runs in parallel with Tasks 1 and 2. **Re-read constraint N3 before starting.** Both edits below are
single-file and line-anchored.

1. **RED — switch the test to the new name.** In `packages/orchestrator/tests/core/reconciliation.test.ts`,
   replace the import (line 2), the `describe` label (line 68), and the 5 call sites (lines 78, 91, 114,
   139, 157). Scoped to this one file:

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     sed -i '' 's/\breconcile\b/reconcileRunningIssues/g' packages/orchestrator/tests/core/reconciliation.test.ts
   ```

   The test file's own local `const effects = …` variables are **left alone** — SC5 constrains
   `src/core/reconciliation.ts` only, and renaming test locals is scope-widening churn.

2. **Observe the failure.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH \
     pnpm --filter @harness-engineering/orchestrator exec vitest run tests/core/reconciliation.test.ts \
     > /tmp/t3-red.out 2>&1; echo "EXIT=$?"; tail -40 /tmp/t3-red.out
   ```

   Expected: `EXIT` non-zero.

3. **GREEN — rewrite `packages/orchestrator/src/core/reconciliation.ts` to exactly this content:**

   ```ts
   import type { Issue } from '@harness-engineering/types';
   import type { OrchestratorState } from '../types/internal';
   import type { SideEffect } from '../types/events';

   /**
    * Reconcile running issues against their current tracker states.
    *
    * For each running issue found in runningStates:
    * - Terminal state -> stop + cleanWorkspace + releaseClaim
    * - Neither active nor terminal -> stop + releaseClaim (no workspace cleanup)
    * - Still active -> no side effects (keep running)
    *
    * Issues not found in runningStates are left running (state refresh may have
    * partially failed; retry next tick per spec).
    */
   export function reconcileRunningIssues(
     state: OrchestratorState,
     runningStates: ReadonlyMap<string, Issue>,
     activeStates: string[],
     terminalStates: string[]
   ): SideEffect[] {
     const sideEffects: SideEffect[] = [];
     const normalizedActive = activeStates.map((s) => s.toLowerCase());
     const normalizedTerminal = terminalStates.map((s) => s.toLowerCase());

     for (const [issueId, entry] of state.running) {
       const currentIssue = runningStates.get(issueId);
       if (!currentIssue) {
         // Not in refresh results -- keep running, retry next tick
         continue;
       }

       const normalizedState = currentIssue.state.toLowerCase();

       if (normalizedTerminal.includes(normalizedState)) {
         // Terminal: stop, clean workspace, release claim
         sideEffects.push({ type: 'stop', issueId, reason: `terminal_state: ${normalizedState}` });
         sideEffects.push({ type: 'cleanWorkspace', issueId, identifier: entry.identifier });
         sideEffects.push({ type: 'releaseClaim', issueId });
       } else if (!normalizedActive.includes(normalizedState)) {
         // Neither active nor terminal: stop, release claim, but keep workspace
         sideEffects.push({
           type: 'stop',
           issueId,
           reason: `non_active_state: ${normalizedState}`,
         });
         sideEffects.push({ type: 'releaseClaim', issueId });
       }
       // Still active: no side effects, keep running
     }

     return sideEffects;
   }

   /** @deprecated Use `reconcileRunningIssues` instead. */
   export const reconcile = reconcileRunningIssues;
   ```

   Note the doc-comment (line 11) and trailing comment (line 45) also move from "effects" to
   "side effects", so the SC5 audit in step 4 is a clean zero rather than a comment-only exception.
   The function name matches the doc comment this module already carried ("Reconcile running issues
   against their current tracker states"), which is why the fleet gate settled on it.

4. **Assert SC5 / OT5 — no bare `effects` identifier remains.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     grep -nE '(^|[^A-Za-z])effects\b' packages/orchestrator/src/core/reconciliation.ts \
     > /tmp/t3-sc5.out 2>&1; echo "EXIT=$?"; cat /tmp/t3-sc5.out
   ```

   Expected: `EXIT=1` and empty output (grep exits 1 on no match). The character-class guard
   `[^A-Za-z]` deliberately does not match the `Effects` inside `sideEffects`.

5. **Observe the pass.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH \
     pnpm --filter @harness-engineering/orchestrator exec vitest run tests/core/reconciliation.test.ts \
     > /tmp/t3-green.out 2>&1; echo "EXIT=$?"; tail -20 /tmp/t3-green.out
   ```

   Expected: `EXIT=0`.

6. **Commit.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     git add packages/orchestrator/src/core/reconciliation.ts packages/orchestrator/tests/core/reconciliation.test.ts && \
     git commit -m "craft(orchestrator): rename reconcile to reconcileRunningIssues, effects to sideEffects"
   ```

---

### Task 4: Add the alias reachability proof — and observe it FAIL

**Depends on:** Tasks 1, 2, 3 | **Files:** `packages/orchestrator/tests/core/naming-aliases.test.ts` (new) | **Owns:** `packages/orchestrator/tests/core/naming-aliases.test.ts`
**[checkpoint:human-verify]**

> **This is the load-bearing task of the plan.** The repo has a recurring defect class where an alias
> exists in its module but is never added to the barrel, silently converting "rename + alias" into a
> bare breaking rename. A test importing from the _module file_ would pass even with the barrel line
> missing. This test must import from the **package root entry** (`../../src/index`) so the barrel
> chain is genuinely exercised: `package.json exports["."] → dist/index.d.ts` ← built from
> `src/index.ts` → line 12 `export * from './core/index'` → `src/core/index.ts`.
>
> Precedent: `packages/orchestrator/tests/maintenance/barrel-exports.test.ts:2` already imports
> `../../src/index` and passes in this suite, so the root import is a proven shape here.

1. **Create `packages/orchestrator/tests/core/naming-aliases.test.ts` with exactly this content:**

   ```ts
   import { describe, it, expect } from 'vitest';
   // D2 — import from the PACKAGE ROOT entry, NOT from the module files.
   //
   //   package.json exports["."] -> dist/index.d.ts  (built from src/index.ts)
   //   src/index.ts:12            -> export * from './core/index'
   //   src/core/index.ts          -> the three symbol lines
   //
   // A name reaches consumers of @harness-engineering/orchestrator iff it appears in
   // src/core/index.ts. Importing '../../src/core/retry' here would pass even with the
   // barrel line missing -- that is the exact defect this test exists to catch. Do not
   // "simplify" these imports to the module files.
   //
   // A namespace import is used deliberately: a missing name surfaces as `undefined`
   // and fails the assertion below with a readable message, rather than crashing the
   // module linker before any assertion runs.
   import * as orch from '../../src/index';

   describe('deprecated aliases are reachable from the package entry point', () => {
     it('calculateRetryDelay is the same object as calculateRetryDelayMs', () => {
       expect(typeof orch.calculateRetryDelayMs).toBe('function');
       expect(typeof orch.calculateRetryDelay).toBe('function');
       expect(orch.calculateRetryDelay).toBe(orch.calculateRetryDelayMs);
     });

     it('periodLengthMs is the same object as resolvePeriodLengthMs', () => {
       expect(typeof orch.resolvePeriodLengthMs).toBe('function');
       expect(typeof orch.periodLengthMs).toBe('function');
       expect(orch.periodLengthMs).toBe(orch.resolvePeriodLengthMs);
     });

     it('reconcile is the same object as reconcileRunningIssues', () => {
       expect(typeof orch.reconcileRunningIssues).toBe('function');
       expect(typeof orch.reconcile).toBe('function');
       expect(orch.reconcile).toBe(orch.reconcileRunningIssues);
     });

     it('the renamed symbols still behave', () => {
       expect(orch.calculateRetryDelayMs(1, 'continuation')).toBe(1000);
       expect(orch.calculateRetryDelayMs(2, 'failure', 300000)).toBe(20000);
       expect(orch.resolvePeriodLengthMs('week')).toBe(7 * orch.resolvePeriodLengthMs('day'));
     });
   });
   ```

2. **Observe the failure — this is the proof that the test is real.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH \
     pnpm --filter @harness-engineering/orchestrator exec vitest run tests/core/naming-aliases.test.ts \
     > /tmp/t4-red.out 2>&1; echo "EXIT=$?"; tail -60 /tmp/t4-red.out
   ```

   **Expected: `EXIT` non-zero**, with the three new names reported as `undefined` (the barrel is not
   wired yet — `src/core/index.ts` still exports only the old names).

   **STOP if `EXIT=0`.** A green result here means the test is _not_ proving reachability (e.g. an
   import got rewritten to a module file, or the barrel was wired early). Fix the test before
   continuing — a proof that cannot fail is not a proof.

3. **[checkpoint:human-verify]** Show `/tmp/t4-red.out` and confirm: the failure names
   `calculateRetryDelayMs`, `resolvePeriodLengthMs`, and `reconcileRunningIssues` as undefined, and the
   import on the last import line is `'../../src/index'`. Wait for confirmation before Task 5.

4. **Commit (red test, intentionally).**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     git add packages/orchestrator/tests/core/naming-aliases.test.ts && \
     git commit --no-verify -m "test(orchestrator): prove deprecated aliases reach the package entry point (red)"
   ```

   `--no-verify` is used **only here**, because a deliberately-red test is being committed as the
   red half of a red-green pair; Task 5 restores green in the very next commit. Every other commit in
   this plan runs the hooks normally.

---

### Task 5: Wire the barrel — export both names for all three symbols

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/core/index.ts` | **Owns:** `packages/orchestrator/src/core/index.ts`
**Skills:** `ts-module-patterns` (reference — barrel-exports; the only entry in `SKILLS.md` that maps to a task here, relevance 0.44)

1. **Edit three lines of `packages/orchestrator/src/core/index.ts`.** No other line changes.
   - Line 1:

     ```ts
     export { calculateRetryDelayMs, calculateRetryDelay } from './retry';
     ```

   - Line 15 (inside the existing `export { … } from './budget-governor';` block, replacing the single
     `periodLengthMs,` entry):

     ```ts
       resolvePeriodLengthMs,
       periodLengthMs,
     ```

   - Line 22:

     ```ts
     export { reconcileRunningIssues, reconcile } from './reconciliation';
     ```

   `src/index.ts` needs **no** edit: line 12 is already `export * from './core/index'`, so the wildcard
   carries all six names to the public surface.

2. **Observe the pass — the proof turns green.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH \
     pnpm --filter @harness-engineering/orchestrator exec vitest run tests/core/naming-aliases.test.ts \
     > /tmp/t5-green.out 2>&1; echo "EXIT=$?"; tail -30 /tmp/t5-green.out
   ```

   Expected: `EXIT=0`, 4 tests passing. This is OT1 + OT2 + OT3 satisfied.

3. **Assert all six names are on the barrel.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     grep -nE 'calculateRetryDelayMs|calculateRetryDelay\b|resolvePeriodLengthMs|periodLengthMs\b|reconcileRunningIssues|reconcile\b' packages/orchestrator/src/core/index.ts \
     > /tmp/t5-barrel.out 2>&1; echo "EXIT=$?"; cat /tmp/t5-barrel.out
   ```

   Expected: 4 lines (line 1 with both retry names, the two budget-governor entries, line 22 with both
   reconciliation names).

4. **Commit.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     git add packages/orchestrator/src/core/index.ts && \
     git commit -m "feat(orchestrator): export renamed core symbols and their deprecated aliases (green)"
   ```

---

### Task 6: Update the one real importer — `state-machine.ts`

**Depends on:** Tasks 1, 3, 5 | **Files:** `packages/orchestrator/src/core/state-machine.ts` | **Owns:** `packages/orchestrator/src/core/state-machine.ts`

**Re-read constraint N3.** This file contains three identifiers that merely _contain_ `reconcile` and
must NOT change: `reconcileCompletedAndClaimed`, `applyReconcileEffects`, and the local
`const reconcileEffects`. Make four line-anchored edits by hand — **do not** run `sed` on this file.

1. **Line 27** — import:

   ```ts
   import { reconcileRunningIssues } from './reconciliation';
   ```

2. **Line 28** — import:

   ```ts
   import { calculateRetryDelayMs } from './retry';
   ```

3. **Line 198** — call site inside the retry-scheduling helper:

   ```ts
   const delayMs = calculateRetryDelayMs(attempt, 'failure', maxRetryBackoffMs);
   ```

4. **Line 468** — call site. Only the callee changes; the local `reconcileEffects` binding keeps its
   name:

   ```ts
   const reconcileEffects = reconcileRunningIssues(
     next,
     runningStates,
     config.tracker.activeStates,
     config.tracker.terminalStates
   );
   ```

   Lines 474 (`effects.push(...reconcileEffects)`), 477 (`applyReconcileEffects(next, reconcileEffects)`)
   and 480 (`reconcileCompletedAndClaimed(...)`) are **unchanged**. The `const effects: SideEffect[]` at
   line 465 is a _state-machine_ local, outside SC5's scope — leave it.

5. **Assert the traps survived.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     grep -nE 'reconcileCompletedAndClaimed|applyReconcileEffects|reconcileEffects|calculateRetryDelay|\breconcile\(' packages/orchestrator/src/core/state-machine.ts \
     > /tmp/t6-traps.out 2>&1; echo "EXIT=$?"; cat /tmp/t6-traps.out
   ```

   Expected: `reconcileCompletedAndClaimed`, `applyReconcileEffects`, and `reconcileEffects` still
   present; **zero** hits for a bare `reconcile(` call and zero for `calculateRetryDelay` without the
   `Ms` suffix.

6. **Run the state-machine suites (not edited — pure regression guard).**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH \
     pnpm --filter @harness-engineering/orchestrator exec vitest run tests/core/state-machine.test.ts tests/core/state-machine.prune-completed.test.ts tests/core/state-machine.diagnostic-stall-budget.test.ts tests/core/startup-reconciliation.test.ts \
     > /tmp/t6.out 2>&1; echo "EXIT=$?"; tail -40 /tmp/t6.out
   ```

   Expected: `EXIT=0`.

7. **Commit.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     git add packages/orchestrator/src/core/state-machine.ts && \
     git commit -m "refactor(orchestrator): point state-machine at the renamed core symbols"
   ```

---

### Task 7: Update the README symbol table and add the minor changeset

**Depends on:** Task 5 | **Files:** `packages/orchestrator/README.md`, `.changeset/craft-naming-orchestrator-core.md` (new) | **Category:** integration | **Owns:** `.changeset/craft-naming-orchestrator-core.md`

The spec's edit set cites README line 135 (`calculateRetryDelay`); the same table also names
`reconcile` at line 134. Both rows are inside the edit-set file and both are updated.
`periodLengthMs` does **not** appear in the README (verified) — no third row.

1. **Edit `packages/orchestrator/README.md` lines 134-135.** Replace:

   ```markdown
   | `reconcile` | Reconcile expected state against actual state |
   | `calculateRetryDelay` | Compute exponential backoff delay |
   ```

   with:

   ```markdown
   | `reconcileRunningIssues` | Reconcile running issues against their tracker state |
   | `calculateRetryDelayMs` | Compute exponential backoff delay, in milliseconds |
   ```

   Markdown table column alignment need not be hand-padded; the repo's prettier normalises it. If the
   pre-commit hook reformats the file, `git add` it again and re-commit.

2. **Create `.changeset/craft-naming-orchestrator-core.md`:**

   ```markdown
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
   ```

   **Do not** run prettier on this file with an empty-marker pattern; it is a normal changeset with a body.

3. **Verify the changeset parses (OT8).**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH \
     head -4 .changeset/craft-naming-orchestrator-core.md > /tmp/t7-cs.out 2>&1; echo "EXIT=$?"; cat /tmp/t7-cs.out
   ```

   Expected: `EXIT=0`, and the frontmatter reads `'@harness-engineering/orchestrator': minor`.

4. **Commit.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     git add packages/orchestrator/README.md .changeset/craft-naming-orchestrator-core.md && \
     git commit -m "docs(orchestrator): update symbol table for the renamed core exports"
   ```

---

### Task 8: Full verification — typecheck, whole orchestrator suite, harness validate

**Depends on:** Tasks 6, 7 | **Files:** none (verification only)

Every command runs under Node 22 (N1) with the exit code captured before any pipe (N2).

1. **Typecheck (OT6).**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH \
     pnpm --filter @harness-engineering/orchestrator typecheck \
     > /tmp/t8-tsc.out 2>&1; echo "EXIT=$?"; tail -40 /tmp/t8-tsc.out
   ```

   Expected: `EXIT=0`.

2. **Full orchestrator suite (OT6).**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH \
     pnpm --filter @harness-engineering/orchestrator test \
     > /tmp/t8-test.out 2>&1; echo "EXIT=$?"; tail -60 /tmp/t8-test.out
   ```

   Expected: `EXIT=0`.

   **If sqlite-related failures appear (roughly a dozen, all touching `better-sqlite3`), the run used
   the wrong Node.** Re-verify with `PATH=…v22…:$PATH node -v` (must print `v22.23.2`) and re-run
   before treating any of it as a real regression. Do not "fix" a phantom sqlite failure.

3. **Lint.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH \
     pnpm --filter @harness-engineering/orchestrator lint \
     > /tmp/t8-lint.out 2>&1; echo "EXIT=$?"; tail -40 /tmp/t8-lint.out
   ```

   Expected: `EXIT=0`. A `@typescript-eslint/no-deprecated`-family rule may flag the aliases' own
   definition sites; if so, that is the intended shape (D1) — annotate with a scoped
   `// eslint-disable-next-line` on the alias line only, never a file-level disable.

4. **Harness validate.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     PATH=/Users/cwarner/.nvm/versions/node/v22.23.2/bin:$PATH \
     harness validate --changed \
     > /tmp/t8-validate.out 2>&1; echo "EXIT=$?"; tail -40 /tmp/t8-validate.out
   ```

   Expected: `EXIT=0`. `harness` resolves from the v24 bin dir but its `#!/usr/bin/env node` shebang
   picks up the PATH-prefixed Node 22. If it misbehaves, fall back to the locally-built CLI:
   `node packages/cli/dist/bin/harness.js validate --changed` (requires a prior `pnpm turbo build --filter @harness-engineering/cli`).

5. **No commit.** This task produces no file changes. If any step fails, fix in the owning task's file
   and re-run from step 1.

---

### Task 9: Closed scope audit — the diff touches nothing outside the edit set

**Depends on:** Task 8 | **Files:** none (audit only)
**[checkpoint:human-verify]**

This is SC7 / OT7, and it is the task that makes constraints N3 and N4 checkable rather than
aspirational.

1. **Print the full changed-file set against the base ref.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     git diff --name-only fef03ac5ea510de1b109a76536c68c92a17f6771..HEAD \
     > /tmp/t9-files.out 2>&1; echo "EXIT=$?"; cat /tmp/t9-files.out
   ```

   The output must be **exactly** these 14 authored paths (order irrelevant), plus any number of
   tool-generated `.harness/comprehension/**/_module.md` shards, and nothing else:

   ```
   .changeset/craft-naming-orchestrator-core.md
   docs/changes/craft-naming-orchestrator-core/SKILLS.md
   docs/changes/craft-naming-orchestrator-core/plans/2026-09-08-craft-naming-orchestrator-core-plan.md
   docs/changes/craft-naming-orchestrator-core/proposal.md
   packages/orchestrator/README.md
   packages/orchestrator/src/core/budget-governor.ts
   packages/orchestrator/src/core/index.ts
   packages/orchestrator/src/core/reconciliation.ts
   packages/orchestrator/src/core/retry.ts
   packages/orchestrator/src/core/state-machine.ts
   packages/orchestrator/tests/core/budget-governor.behavior.test.ts
   packages/orchestrator/tests/core/naming-aliases.test.ts
   packages/orchestrator/tests/core/reconciliation.test.ts
   packages/orchestrator/tests/core/retry.test.ts
   ```

   **Three of these are already on the branch before Task 1 runs** (they arrived with the spec commit
   `9e5913b58`, not with any task in this plan):
   - `docs/changes/craft-naming-orchestrator-core/proposal.md` — the spec
   - `docs/changes/craft-naming-orchestrator-core/SKILLS.md` — auto-generated by the Pipeline Skill Advisor
   - `docs/changes/craft-naming-orchestrator-core/plans/…-plan.md` — this file

   **`.harness/comprehension/**/\_module.md` shards are tolerated, not enumerated.** The pre-commit
comprehension driver rewrites these on every commit; the branch already carries three
(`packages/cli/src/commands/`, `packages/cli/tests/commands/`, `packages/cli/tests/commands/roadmap/`)
   and more will appear as tasks commit. They are machine-written, are not authored edits, and are
   deliberately filtered out in step 3 rather than listed. Do **not** try to revert them — they are a
   commit-hook side effect, and reverting them re-DIRTYs on the next commit.

   Baseline the pre-existing set once, before Task 1, so the audit compares like with like:

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     git diff --name-only fef03ac5ea510de1b109a76536c68c92a17f6771..HEAD \
     > /tmp/t0-baseline.out 2>&1; echo "EXIT=$?"; cat /tmp/t0-baseline.out
   ```

2. **Assert the forbidden paths are absent — the N3/N4 guard.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     git diff --name-only fef03ac5ea510de1b109a76536c68c92a17f6771..HEAD \
     | grep -E '^scripts/audit-exceptions\.mjs$|^packages/graph/|^packages/local-models/|^packages/cli/|^packages/core/src/rehearsal/' \
     > /tmp/t9-forbidden.out 2>&1; echo "EXIT=$?"; cat /tmp/t9-forbidden.out
   ```

   **Expected: `EXIT=1` and empty output** (grep exits 1 when it matches nothing — that is the pass
   condition here). `EXIT=0` with any path printed is a hard failure: revert that file and re-run.

3. **Assert the diff is outside the edit set nowhere — mechanical set difference.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     cat > /tmp/t9-allow.txt <<'EOF'
   .changeset/craft-naming-orchestrator-core.md
   docs/changes/craft-naming-orchestrator-core/SKILLS.md
   docs/changes/craft-naming-orchestrator-core/plans/2026-09-08-craft-naming-orchestrator-core-plan.md
   docs/changes/craft-naming-orchestrator-core/proposal.md
   packages/orchestrator/README.md
   packages/orchestrator/src/core/budget-governor.ts
   packages/orchestrator/src/core/index.ts
   packages/orchestrator/src/core/reconciliation.ts
   packages/orchestrator/src/core/retry.ts
   packages/orchestrator/src/core/state-machine.ts
   packages/orchestrator/tests/core/budget-governor.behavior.test.ts
   packages/orchestrator/tests/core/naming-aliases.test.ts
   packages/orchestrator/tests/core/reconciliation.test.ts
   packages/orchestrator/tests/core/retry.test.ts
   EOF
     git diff --name-only fef03ac5ea510de1b109a76536c68c92a17f6771..HEAD \
       | grep -v '^\.harness/comprehension/' | sort > /tmp/t9-actual.txt; \
     sort /tmp/t9-allow.txt > /tmp/t9-allow-sorted.txt; \
     comm -23 /tmp/t9-actual.txt /tmp/t9-allow-sorted.txt > /tmp/t9-extra.out 2>&1; echo "EXIT=$?"; \
     echo "--- files in diff but NOT in edit set (must be empty) ---"; cat /tmp/t9-extra.out
   ```

   Expected: `/tmp/t9-extra.out` is empty. Any line is an out-of-scope file.

   The `grep -v '^\.harness/comprehension/'` filter is the _only_ tolerated exclusion, for the
   commit-hook reason given in step 1. Note the `EXIT=$?` here reports `comm`'s status, which is not the
   pass signal — **the pass signal is `/tmp/t9-extra.out` being empty**, which is why it is printed
   rather than inferred. (This is the one place a pipe is unavoidable, and deliberately so: no exit code
   is being relied on.)

   Also confirm nothing _authored_ was dropped, i.e. every non-comprehension path is accounted for:

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     comm -13 /tmp/t9-actual.txt /tmp/t9-allow-sorted.txt > /tmp/t9-missing.out 2>&1; \
     echo "--- edit-set files NOT in the diff (should be empty if all 9 tasks ran) ---"; cat /tmp/t9-missing.out
   ```

4. **Re-assert SC5 / OT5 and OT4 at the end state.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-lanes/fc2-rm-2001 && \
     grep -nE '(^|[^A-Za-z])effects\b' packages/orchestrator/src/core/reconciliation.ts \
     > /tmp/t9-sc5.out 2>&1; echo "SC5_EXIT=$? (1 = pass)"; cat /tmp/t9-sc5.out; \
     grep -c '@deprecated' packages/orchestrator/src/core/retry.ts packages/orchestrator/src/core/budget-governor.ts packages/orchestrator/src/core/reconciliation.ts \
     > /tmp/t9-sc4.out 2>&1; echo "SC4_EXIT=$?"; cat /tmp/t9-sc4.out
   ```

   Expected: `SC5_EXIT=1` with empty output; `SC4_EXIT=0` with each of the three files reporting `1`.

5. **[checkpoint:human-verify]** Present `/tmp/t9-files.out`, `/tmp/t9-extra.out`,
   `/tmp/t9-forbidden.out`, and the Task 8 exit codes. Confirm the diff is closed to the edit set before
   the branch is pushed or a PR is opened.

6. **No commit.** Audit only.

---

## Sequencing and parallelism

| Wave | Tasks      | Rationale                                                                   |
| ---- | ---------- | --------------------------------------------------------------------------- |
| 1    | T1, T2, T3 | Fully disjoint file sets; no shared state. Safe to run in parallel.         |
| 2    | T4         | Needs all three aliases declared so the RED isolates the missing barrel.    |
| 3    | T5         | Turns T4 green. Must follow T4 or the RED is never observed.                |
| 4    | T6         | Needs the renamed symbols (T1, T3) and the barrel (T5).                     |
| 5    | T7         | Needs the final public names (T5). Disjoint from T6 — may run alongside it. |
| 6    | T8         | Verification; needs all edits landed.                                       |
| 7    | T9         | Scope audit; must be last.                                                  |

**Total:** 9 tasks, ~33 minutes.

---

## Uncertainties

- **[ASSUMPTION]** No consumer outside this monorepo imports the three old names in a way that a
  `const` alias would not satisfy (e.g. `import type` of a function declaration's own type, or a
  declaration-merged namespace). Verified in-repo: zero non-orchestrator importers of
  `calculateRetryDelay` or `periodLengthMs`, and `state-machine.ts` is the sole `reconcile` importer.
  If a published consumer relied on the _declaration form_, Task 1/2/3's alias shape would need
  revisiting — but this is a runtime function value in every observed use.
- **[ASSUMPTION]** `pnpm --filter @harness-engineering/orchestrator exec vitest run <file>` resolves
  vitest from the package (`devDependencies.vitest: ^4.1.5`, config at
  `packages/orchestrator/vitest.config.mts` with `include: ['src/**/*.test.ts', 'tests/**/*.test.ts']`).
  If `exec` misresolves, substitute `pnpm --filter @harness-engineering/orchestrator test -- <file>`.
- **[DEFERRABLE]** The exact prettier-normalised column padding of the two README table rows. The
  pre-commit hook settles it; if it rewrites the file, re-`git add` and re-commit.
- **[DEFERRABLE]** Whether lint flags the alias definition sites under a `no-deprecated` rule
  (Task 8 step 3 carries the scoped remedy).
- **[NOT A BLOCKER]** Historical plan documents under `docs/changes/orchestrator/` and
  `docs/changes/hybrid-orchestrator/` also name `calculateRetryDelay`. Per the spec's Integration
  Points, those are dated records of past runs and are **deliberately left untouched**; touching them
  would fail the Task 9 audit.

## Known failure modes this plan defends against

| Failure mode                                                         | Defence                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Alias declared in module but missing from barrel (recurring here)    | Task 4 imports from `../../src/index` and is observed RED before Task 5               |
| A test that passes even when the defect is present                   | Task 4 step 2 **stops the lane** if the RED does not appear                           |
| Repo-wide `reconcile` replace hitting ~460 prose/4 real symbols      | N3 + per-file `sed` only + Task 6 trap grep + Task 9 forbidden-path grep              |
| Renaming `reconcileCompletedAndClaimed` / `applyReconcileEffects`    | N3 trap list + Task 6 step 5 asserts all three survive                                |
| Colliding with the sibling lane on `packages/core/src/rehearsal`     | N4 + Task 9 forbidden-path grep                                                       |
| ~14 phantom sqlite failures from running under Node 24               | N1 PATH prefix on every command + Task 8 step 2 misdiagnosis note                     |
| Exit code masked by a pipe to `tail`                                 | N2 — `echo "EXIT=$?"` always precedes any pipe                                        |
| `periodLengthMs` internal call site left behind ⇒ TDZ at module init | Task 2 step 5 asserts exactly one remaining occurrence (the alias)                    |
| SC5 audit passing on comment-only "effects" hits                     | Task 3 rewrites the two comments too; audit regex excludes `sideEffects`              |
| Scope audit false-positive on hook-written comprehension shards      | Task 9 tolerates `.harness/comprehension/**` explicitly; baseline captured pre-Task-1 |
| Scope audit false-positive on the spec commit's `SKILLS.md`          | `SKILLS.md` is in the Task 9 allowlist, flagged as a pre-existing branch artifact     |
