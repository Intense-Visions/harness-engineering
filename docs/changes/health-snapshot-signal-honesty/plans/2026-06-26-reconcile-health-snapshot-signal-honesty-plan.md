# Plan: Reconcile health-snapshot `passed` flags with active signals

**Date:** 2026-06-26 | **Spec:** `docs/changes/health-snapshot-signal-honesty/proposal.md` | **Tasks:** 9 | **Time:** ~38 min | **Integration Tier:** large

## Goal

A health snapshot produced by `captureHealthSnapshot` can never report a check as `passed: true` while a contradicting signal is present, enforced by a single canonical signal↔check contract owned by `@harness-engineering/core` and consumed by both the cli capture path and the core `strength-007` detector.

## Observable Truths (Acceptance Criteria)

Traceable to the spec's 7 success criteria:

1. **(SC1)** When a snapshot's checks include a contradicting signal for check `k`, the system shall set `checks[k].passed = false` (demotion on contradiction). _Event-driven._
2. **(SC2)** The system shall preserve an `assess` failure that has no corresponding signal as `passed: false` (conjunction; exercised via `lint`, which has no signal rule). _Ubiquitous._
3. **(SC3)** The system shall never let a metrics-only signal (`check: null`, e.g. `high-coupling`) change any `passed` flag. _Unwanted: if a signal maps to no check, then it shall not affect `passed`._
4. **(SC4)** `SIGNAL_REGISTRY` shall be the only literal declaration of signal names; `CHECK_SIGNAL_MAP` and `SignalName` are derived from it (no second signal-name list in cli or core).
5. **(SC5)** `strength-007` shall consume the derived `CHECK_SIGNAL_MAP` and fire on entropy/deps/docs mismatches — a regression test reproduces the prior silent false-negative and proves it now fails closed.
6. **(SC6)** `deriveSignals` output shall be unchanged for given `(checks, metrics)` inputs (no signal-vocabulary regression).
7. **(SC7)** `harness validate`, typecheck, lint, and the full test suite shall pass.

## File Map

- CREATE `packages/core/src/health-signals/index.ts`
- CREATE `packages/core/src/health-signals/index.test.ts`
- MODIFY `packages/core/src/index.ts` (add barrel export near line 213)
- MODIFY `packages/cli/src/skill/health-snapshot.ts` (type `SIGNAL_RULES` with `SignalName`; add `reconcilePassed` call in `captureHealthSnapshot`)
- MODIFY `packages/cli/tests/skill/health-snapshot.test.ts` (demotion, lint-conjunction, metrics-only tests)
- MODIFY `packages/core/src/harness-strength/rules/strength-007-snapshot-signal-mismatch.ts` (delete local map; import derived map; iterate array)
- MODIFY `packages/core/src/harness-strength/rules/strength-007-snapshot-signal-mismatch.test.ts` (update map-shape test; add entropy/deps/docs regression)
- CREATE `docs/knowledge/decisions/0046-canonical-signal-check-contract-in-core.md`
- CREATE `docs/knowledge/core/health-signal-contract.md`

## Uncertainties

- **[ASSUMPTION]** The next ADR number is `0046` (latest on disk is `0045`). If a peer automation lands `0046` first, bump to the next free number. (Affects Task 7 only.)
- **[ASSUMPTION]** Workspace is built by the time tests run — `pnpm install` + `pnpm build` are already running in the background (per executor note). Do **not** start a competing build. The cli imports `@harness-engineering/core` as `workspace:*`; its compiled `dist/` must exist before cli tests resolve the new `reconcilePassed`/`SignalName` exports. If a cli test fails with a module-resolution error on the core import, the core build has not finished — wait, do not modify imports.
- **[DEFERRABLE]** Exact wording of the `strength-007` finding message when a check matches one of several array signals. Pick the first matching signal name for the message.

## Skeleton

1. Core contract: `health-signals` module with TDD + barrel export (~3 tasks, ~13 min)
2. Wire cli: typed `SIGNAL_RULES` + `reconcilePassed` in capture path with tests (~2 tasks, ~10 min)
3. Fix `strength-007`: derived map + false-negative regression (~1 task, ~5 min)
4. Integration: ADR, knowledge note, final validate (~3 tasks, ~10 min)

**Estimated total:** 9 tasks, ~38 minutes. _Skeleton approved: yes (standard rigor, proceeding to full expansion)._

## Tasks

### Task 1: Write failing tests for the `health-signals` contract

**Depends on:** none | **Files:** `packages/core/src/health-signals/index.test.ts`
**Skills:** `ts-testing-types` (reference), `ts-utility-types` (reference)

1. Create `packages/core/src/health-signals/index.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { SIGNAL_REGISTRY, CHECK_SIGNAL_MAP, reconcilePassed } from './index';

   describe('SIGNAL_REGISTRY', () => {
     it('declares the real signal vocabulary with check mappings', () => {
       const names = SIGNAL_REGISTRY.map((s) => s.name).sort();
       expect(names).toEqual(
         [
           'anomaly-outlier',
           'articulation-point',
           'circular-deps',
           'dead-code',
           'doc-gaps',
           'drift',
           'high-complexity',
           'high-coupling',
           'layer-violations',
           'low-coverage',
           'perf-regression',
           'security-findings',
         ].sort()
       );
     });

     it('marks metrics-only signals with check: null', () => {
       const metricsOnly = SIGNAL_REGISTRY.filter((s) => s.check === null).map((s) => s.name);
       expect(metricsOnly.sort()).toEqual(
         [
           'anomaly-outlier',
           'articulation-point',
           'high-complexity',
           'high-coupling',
           'low-coverage',
         ].sort()
       );
     });
   });

   describe('CHECK_SIGNAL_MAP (derived, SC4)', () => {
     it('groups signal names by check, skipping null, many-to-one', () => {
       expect(CHECK_SIGNAL_MAP.deps.sort()).toEqual(['circular-deps', 'layer-violations'].sort());
       expect(CHECK_SIGNAL_MAP.entropy.sort()).toEqual(['dead-code', 'drift'].sort());
       expect(CHECK_SIGNAL_MAP.security).toEqual(['security-findings']);
       expect(CHECK_SIGNAL_MAP.docs).toEqual(['doc-gaps']);
       expect(CHECK_SIGNAL_MAP.perf).toEqual(['perf-regression']);
     });

     it('has lint with no signals (governed by assess alone, SC2)', () => {
       expect(CHECK_SIGNAL_MAP.lint).toEqual([]);
     });

     it('never includes a metrics-only signal in any check bucket (SC3)', () => {
       const all = Object.values(CHECK_SIGNAL_MAP).flat();
       for (const s of [
         'anomaly-outlier',
         'articulation-point',
         'high-coupling',
         'high-complexity',
         'low-coverage',
       ]) {
         expect(all).not.toContain(s);
       }
     });
   });

   describe('reconcilePassed (conjunction, monotonic toward fail)', () => {
     it('demotes a dishonest pass when a contradicting signal is present (SC1)', () => {
       const out = reconcilePassed({ security: { passed: true, issueCount: 0 } }, [
         'security-findings',
       ]);
       expect(out.security.passed).toBe(false);
       expect(out.security.issueCount).toBe(0); // other fields preserved
     });

     it('demotes deps on any of its many signals (SC1, many-to-one)', () => {
       expect(reconcilePassed({ deps: { passed: true } }, ['layer-violations']).deps.passed).toBe(
         false
       );
       expect(reconcilePassed({ deps: { passed: true } }, ['circular-deps']).deps.passed).toBe(
         false
       );
     });

     it('preserves an assess failure that has no signal — lint conjunction (SC2)', () => {
       expect(reconcilePassed({ lint: { passed: false } }, []).lint.passed).toBe(false);
     });

     it('never flips false -> true even if no signal is present (monotonic)', () => {
       expect(reconcilePassed({ docs: { passed: false } }, []).docs.passed).toBe(false);
     });

     it('leaves passed true when no contradicting signal is present', () => {
       expect(reconcilePassed({ docs: { passed: true } }, []).docs.passed).toBe(true);
     });

     it('ignores metrics-only signals — they change nothing (SC3)', () => {
       const out = reconcilePassed({ deps: { passed: true }, entropy: { passed: true } }, [
         'high-coupling',
         'low-coverage',
         'anomaly-outlier',
       ]);
       expect(out.deps.passed).toBe(true);
       expect(out.entropy.passed).toBe(true);
     });

     it('is pure — does not mutate the input checks', () => {
       const input = { security: { passed: true } };
       reconcilePassed(input, ['security-findings']);
       expect(input.security.passed).toBe(true);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test -- src/health-signals/index.test.ts` — observe failure (module does not exist yet).
3. Commit: `test(core): add failing tests for health-signals contract`

### Task 2: Implement the `health-signals` contract

**Depends on:** Task 1 | **Files:** `packages/core/src/health-signals/index.ts`
**Skills:** `ts-utility-types` (reference), `ts-type-guards` (reference)

1. Create `packages/core/src/health-signals/index.ts`:

   ```ts
   /**
    * Canonical health-signal vocabulary and its mapping to assess checks.
    *
    * `SIGNAL_REGISTRY` is the SINGLE SOURCE OF TRUTH for signal names and the
    * check each signal contradicts. `CHECK_SIGNAL_MAP` and `SignalName` are
    * DERIVED from it — never hand-maintain a second list. Adding a signal is a
    * single registry entry that flows to the name union, the check map, and the
    * cli's `SIGNAL_RULES` typing automatically.
    *
    * Layer rule: this contract lives in core; the cli imports it. core must not
    * import cli.
    */

   export type CheckKey = 'deps' | 'entropy' | 'security' | 'perf' | 'docs' | 'lint';

   /** The check vocabulary (NOT signal names — see SC4). Used to fully populate CHECK_SIGNAL_MAP. */
   const CHECK_KEYS: readonly CheckKey[] = ['deps', 'entropy', 'security', 'perf', 'docs', 'lint'];

   /**
    * THE single source of truth. `check: null` marks a metrics-only signal that
    * maps to no check (it must never affect any `passed` flag).
    */
   export const SIGNAL_REGISTRY = [
     { name: 'circular-deps', check: 'deps' },
     { name: 'layer-violations', check: 'deps' },
     { name: 'dead-code', check: 'entropy' },
     { name: 'drift', check: 'entropy' },
     { name: 'security-findings', check: 'security' },
     { name: 'doc-gaps', check: 'docs' },
     { name: 'perf-regression', check: 'perf' },
     { name: 'anomaly-outlier', check: null },
     { name: 'articulation-point', check: null },
     { name: 'high-coupling', check: null },
     { name: 'high-complexity', check: null },
     { name: 'low-coverage', check: null },
   ] as const satisfies ReadonlyArray<{ name: string; check: CheckKey | null }>;

   export type SignalName = (typeof SIGNAL_REGISTRY)[number]['name'];

   /**
    * Derived: check -> contradicting signal names (many-to-one). Built by grouping
    * SIGNAL_REGISTRY on `check`, skipping null. Every CheckKey is present; a check
    * with no signals (e.g. `lint`) maps to `[]`.
    */
   export const CHECK_SIGNAL_MAP: Record<CheckKey, SignalName[]> = Object.fromEntries(
     CHECK_KEYS.map((key) => [
       key,
       SIGNAL_REGISTRY.filter((s) => s.check === key).map((s) => s.name),
     ])
   ) as Record<CheckKey, SignalName[]>;

   /**
    * Pure reconciliation: for each check, `passed` stays true only if assess passed
    * AND no contradicting signal is present. Conjunction, monotonic toward fail —
    * never flips false -> true. Returns a new object; does not mutate `checks`.
    */
   export function reconcilePassed<C extends Record<string, { passed: boolean }>>(
     checks: C,
     signals: readonly string[]
   ): C {
     const present = new Set(signals);
     const result = {} as C;
     for (const key of Object.keys(checks) as (keyof C)[]) {
       const check = checks[key];
       const contradicting = CHECK_SIGNAL_MAP[key as CheckKey] ?? [];
       const hasContradiction = contradicting.some((s) => present.has(s));
       result[key] = { ...check, passed: check.passed && !hasContradiction };
     }
     return result;
   }
   ```

2. Run: `pnpm --filter @harness-engineering/core test -- src/health-signals/index.test.ts` — observe all pass.
3. Run: `pnpm --filter @harness-engineering/core typecheck` — observe pass (verifies `as const satisfies` and derivation types).
4. Run: `harness validate`
5. Commit: `feat(core): add canonical health-signals contract (SIGNAL_REGISTRY)`

### Task 3: Barrel-export `health-signals` from core; verify the public surface

**Depends on:** Task 2 | **Files:** `packages/core/src/index.ts` | **Category:** integration

1. In `packages/core/src/index.ts`, add the export immediately after the `harness-strength` export (~line 213):

   ```ts
   /**
    * Harness-strength module.
    */
   export * from './harness-strength';

   /**
    * Health-signals contract (canonical signal<->check mapping).
    */
   export * from './health-signals';
   ```

2. Run: `pnpm --filter @harness-engineering/core build` — observe the new exports compile into `dist/`. (Required so the cli can resolve them in Tasks 4-5.)
3. Run: `pnpm --filter @harness-engineering/core typecheck`
4. Run: `harness validate`
5. Commit: `feat(core): barrel-export health-signals contract`

### Task 4: Type cli `SIGNAL_RULES` with the imported `SignalName` (no behavior change, SC4/SC6)

**Depends on:** Task 3 | **Files:** `packages/cli/src/skill/health-snapshot.ts`
**Skills:** `node-esm-patterns` (reference)

1. In `packages/cli/src/skill/health-snapshot.ts`, add the type import near the existing `logger` import at the top:

   ```ts
   import type { SignalName } from '@harness-engineering/core';
   ```

2. Change the `SIGNAL_RULES` declaration (line 104) to type the signal-name slot with `SignalName` so the literals are checked against the registry (no value changes to the literals or predicates):

   ```ts
   /** Signal derivation rules: [signalName, predicate]. */
   const SIGNAL_RULES: Array<[SignalName, (c: HealthChecks, m: HealthMetrics) => boolean]> = [
   ```

   Leave every rule entry and predicate exactly as-is. `deriveSignals` and its `string[]` return type stay unchanged.

3. Run: `pnpm --filter @harness-engineering/cli typecheck` — observe pass. If any literal in `SIGNAL_RULES` is not a member of `SignalName`, this fails closed (proves cli emits exactly the registry's names, SC4).
4. Run: `pnpm --filter @harness-engineering/cli test -- tests/skill/health-snapshot.test.ts` — observe the existing `deriveSignals` tests still pass unchanged (SC6).
5. Run: `harness validate`
6. Commit: `refactor(cli): type SIGNAL_RULES against core SignalName`

### Task 5: Apply `reconcilePassed` in `captureHealthSnapshot` + write reconciliation tests (SC1/SC2/SC3)

**Depends on:** Task 4 | **Files:** `packages/cli/src/skill/health-snapshot.ts`, `packages/cli/tests/skill/health-snapshot.test.ts`
**Skills:** `ts-testing-types` (reference)

1. Add the value import (alongside the `SignalName` type import) in `health-snapshot.ts`:

   ```ts
   import { reconcilePassed } from '@harness-engineering/core';
   ```

2. In `captureHealthSnapshot` (line 381), reconcile after deriving signals and use the reconciled checks in the snapshot:

   ```ts
   // Derive signals
   const signals = deriveSignals(checks, metrics);

   // Reconcile: demote any check that passed assess but has a contradicting signal.
   // Conjunction, monotonic toward fail — never promotes a real failure to green.
   const reconciledChecks = reconcilePassed(checks, signals);

   const snapshot: HealthSnapshot = {
     capturedAt: new Date().toISOString(),
     gitHead,
     projectPath,
     checks: reconciledChecks,
     metrics,
     signals,
   };
   ```

3. In `packages/cli/tests/skill/health-snapshot.test.ts`, add a `describe` block. Note `reconcilePassed` is imported from `@harness-engineering/core` (already a workspace dep). Add to the existing core import or a new one:

   ```ts
   import { reconcilePassed } from '@harness-engineering/core';

   describe('reconcilePassed wiring (snapshot honesty)', () => {
     it('demotes a check that passed assess but has a contradicting signal (SC1)', () => {
       const checks = {
         security: { passed: true, findingCount: 16, criticalCount: 16 },
         docs: { passed: true, undocumentedCount: 27481 },
       };
       const out = reconcilePassed(checks, ['security-findings', 'doc-gaps']);
       expect(out.security.passed).toBe(false);
       expect(out.docs.passed).toBe(false);
     });

     it('preserves a lint assess-failure that has no signal (SC2 conjunction)', () => {
       const out = reconcilePassed({ lint: { passed: false, issueCount: 3 } }, []);
       expect(out.lint.passed).toBe(false);
     });

     it('does not let metrics-only signals change passed (SC3)', () => {
       const out = reconcilePassed(
         { deps: { passed: true, issueCount: 0, circularDeps: 0, layerViolations: 0 } },
         ['high-coupling', 'low-coverage']
       );
       expect(out.deps.passed).toBe(true);
     });
   });
   ```

4. Run: `pnpm --filter @harness-engineering/cli test -- tests/skill/health-snapshot.test.ts` — observe all pass.
5. Run: `pnpm --filter @harness-engineering/cli typecheck`
6. Run: `harness validate`
7. Commit: `feat(cli): reconcile snapshot passed flags against active signals`

### Task 6: Fix `strength-007` to consume the derived map + false-negative regression (SC5)

**Depends on:** Task 3 | **Files:** `packages/core/src/harness-strength/rules/strength-007-snapshot-signal-mismatch.ts`, `packages/core/src/harness-strength/rules/strength-007-snapshot-signal-mismatch.test.ts`

Note: independent of Tasks 4-5 (different package path) — depends only on the core contract (Task 3).

1. **(RED)** Rewrite `strength-007-snapshot-signal-mismatch.test.ts` to import the derived map from `../../health-signals` and assert the new array shape plus the entropy/deps/docs regression. Replace the `CHECK_SIGNAL_MAP` import and its shape test:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { strength007SnapshotSignalMismatch } from './strength-007-snapshot-signal-mismatch';
   import { CHECK_SIGNAL_MAP } from '../../health-signals';
   import type { ProjectContext } from '../types';

   function ctx(partial: Partial<ProjectContext>): ProjectContext {
     return {
       root: '/r',
       mode: 'adopter',
       config: null,
       preCommit: null,
       hookFiles: [],
       workflows: [],
       healthSnapshot: null,
       ...partial,
     };
   }

   describe('STRENGTH-007 uses the derived CHECK_SIGNAL_MAP (SC4/SC5)', () => {
     it('reads the real, derived signal vocabulary (no local map)', () => {
       expect(CHECK_SIGNAL_MAP.deps.sort()).toEqual(['circular-deps', 'layer-violations'].sort());
       expect(CHECK_SIGNAL_MAP.entropy.sort()).toEqual(['dead-code', 'drift'].sort());
       expect(CHECK_SIGNAL_MAP.docs).toEqual(['doc-gaps']);
       expect(CHECK_SIGNAL_MAP.security).toEqual(['security-findings']);
     });
   });

   describe('STRENGTH-007 snapshot/signal mismatch detect', () => {
     it('flags a passing security check while security-findings is present', () => {
       const findings = strength007SnapshotSignalMismatch.detect(
         ctx({
           healthSnapshot: {
             checks: { security: { passed: true } },
             signals: ['security-findings'],
           },
         })
       );
       expect(findings).toHaveLength(1);
       expect(findings[0]!.id).toBe('STRENGTH-007');
       expect(findings[0]!.message).toMatch(/security/);
       expect('severity' in findings[0]!).toBe(false);
     });

     it('REGRESSION: fires on entropy/deps/docs mismatches that the old map silently missed (SC5)', () => {
       const findings = strength007SnapshotSignalMismatch.detect(
         ctx({
           healthSnapshot: {
             checks: {
               entropy: { passed: true },
               deps: { passed: true },
               docs: { passed: true },
             },
             signals: ['drift', 'layer-violations', 'doc-gaps'],
           },
         })
       );
       expect(findings).toHaveLength(3);
       expect(findings.every((f) => f.id === 'STRENGTH-007')).toBe(true);
     });

     it('passes when a check passed and there is no contradicting signal', () => {
       expect(
         strength007SnapshotSignalMismatch.detect(
           ctx({ healthSnapshot: { checks: { security: { passed: true } }, signals: [] } })
         )
       ).toEqual([]);
     });

     it('passes an honest failure (passed false with the signal listed)', () => {
       expect(
         strength007SnapshotSignalMismatch.detect(
           ctx({ healthSnapshot: { checks: { entropy: { passed: false } }, signals: ['drift'] } })
         )
       ).toEqual([]);
     });

     it('ignores metrics-only signals (no check maps to them, SC3)', () => {
       expect(
         strength007SnapshotSignalMismatch.detect(
           ctx({
             healthSnapshot: { checks: { deps: { passed: true } }, signals: ['high-coupling'] },
           })
         )
       ).toEqual([]);
     });

     it('is not evaluable when healthSnapshot is null', () => {
       const c = ctx({ healthSnapshot: null });
       expect(strength007SnapshotSignalMismatch.evaluable?.(c)).toBe(false);
       expect(strength007SnapshotSignalMismatch.detect(c)).toEqual([]);
     });

     it('is not evaluable when the snapshot is malformed (no checks)', () => {
       const c = ctx({ healthSnapshot: { foo: 'bar' } });
       expect(strength007SnapshotSignalMismatch.evaluable?.(c)).toBe(false);
       expect(strength007SnapshotSignalMismatch.detect(c)).toEqual([]);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test -- src/harness-strength/rules/strength-007-snapshot-signal-mismatch.test.ts` — observe failure (old code still has the local 1:1 string map; regression test and array-shape test fail).
3. **(GREEN)** Edit `strength-007-snapshot-signal-mismatch.ts`: delete the local `CHECK_SIGNAL_MAP` declaration (lines 12-19) and the stale doc paragraph referencing it; import the derived map and iterate the array:

   ```ts
   import type { ProjectContext, StrengthFinding, StrengthRule } from '../types';
   import { CHECK_SIGNAL_MAP } from '../../health-signals';

   /**
    * STRENGTH-007 — snapshot/signal mismatch (defense-in-depth backstop).
    *
    * Flags a health-snapshot check reported as passing while one of its
    * contradicting signals (per the canonical, core-owned `CHECK_SIGNAL_MAP`) is
    * present. The write-path reconciliation in `captureHealthSnapshot` is the
    * primary guarantee; this rule catches hand-edited or stale snapshots that
    * bypass it. Checks with no contradicting signal (e.g. `lint`) are ignored.
    */

   interface SnapshotShape {
     checks: Record<string, { passed?: boolean }>;
     signals?: string[];
   }

   /** Narrow an unknown health snapshot to the minimal shape this rule needs. */
   function isSnapshot(value: unknown): value is SnapshotShape {
     if (value === null || typeof value !== 'object') return false;
     const checks = (value as Record<string, unknown>).checks;
     return checks !== null && typeof checks === 'object';
   }

   export const strength007SnapshotSignalMismatch: StrengthRule = {
     id: 'STRENGTH-007',
     gearPiece: 'snapshot-honesty',
     defaultSeverity: 'error',
     appliesIn: () => true,
     evaluable: (ctx) => isSnapshot(ctx.healthSnapshot),
     detect(ctx: ProjectContext): Omit<StrengthFinding, 'severity'>[] {
       if (!isSnapshot(ctx.healthSnapshot)) return [];
       const { checks, signals } = ctx.healthSnapshot;
       const present = new Set(Array.isArray(signals) ? signals : []);
       const findings: Omit<StrengthFinding, 'severity'>[] = [];
       for (const [check, result] of Object.entries(checks)) {
         const contradicting = CHECK_SIGNAL_MAP[check as keyof typeof CHECK_SIGNAL_MAP];
         // Checks outside the contract (or with no signals, e.g. lint) are ignored.
         if (!contradicting || contradicting.length === 0) continue;
         const hit = contradicting.find((signal) => present.has(signal));
         if (result?.passed === true && hit) {
           findings.push({
             id: 'STRENGTH-007',
             gearPiece: 'snapshot-honesty',
             file: '.harness/health-snapshot.json',
             message: `Health snapshot reports the "${check}" check as passing while the contradicting signal "${hit}" is present — the snapshot is dishonest.`,
             remediation: `Reconcile the snapshot: either the "${check}" check did not actually pass, or the "${hit}" signal is stale. Regenerate the snapshot from a clean run.`,
           });
         }
       }
       return findings;
     },
   };
   ```

4. Run: `pnpm --filter @harness-engineering/core test -- src/harness-strength/rules/strength-007-snapshot-signal-mismatch.test.ts` — observe all pass.
5. Run: `pnpm --filter @harness-engineering/core typecheck`
6. Run: `harness validate`
7. Commit: `fix(core): strength-007 consumes derived CHECK_SIGNAL_MAP (closes entropy/deps/docs false-negative)`

### Task 7: Write ADR — canonical signal↔check contract owned by core

**Depends on:** Task 6 | **Files:** `docs/knowledge/decisions/0046-canonical-signal-check-contract-in-core.md` | **Category:** integration

1. Confirm `0046` is free: if `docs/knowledge/decisions/0046-*.md` exists, use the next free number throughout.
2. Create `docs/knowledge/decisions/0046-canonical-signal-check-contract-in-core.md`:

   ```markdown
   ---
   number: 0046
   title: Canonical signal<->check contract owned by core
   date: 2026-06-26
   status: accepted
   tier: large
   source: docs/changes/health-snapshot-signal-honesty/proposal.md
   ---

   ## Context

   `health-snapshot.json` could report a check as `passed: true` while `signals[]`
   listed a contradicting problem (observed: `security.passed: true` with 16 findings;
   `docs.passed: true` with 27,481 undocumented symbols). The root cause was a
   two-source-of-truth drift: the signal<->check mapping was declared independently in
   the cli (`deriveSignals` / `SIGNAL_RULES`) and in the core `strength-007` detector
   (a local `CHECK_SIGNAL_MAP`). The two had already diverged — `strength-007` looked
   for signal names (`entropy-drift`, `dependency-violations`, `doc-coverage`,
   `lint-issues`) that the cli never emits, so entropy/deps/docs mismatches were silent
   false-negatives.

   ## Decision

   **The health-signal vocabulary and its mapping to checks are a single canonical
   contract owned by `@harness-engineering/core`, in `packages/core/src/health-signals/`.**

   - One `SIGNAL_REGISTRY` list is the only literal declaration of signal names.
     `CHECK_SIGNAL_MAP` (check -> contradicting signals, many-to-one) and the
     `SignalName` union are DERIVED from it. A metrics-only signal is marked
     `check: null` and never maps to a check.
   - Both consumers import the contract: the cli capture path (`SIGNAL_RULES` typing +
     `reconcilePassed`) and the core `strength-007` detector. Neither re-declares a
     local map. This respects the cli->core layer direction: the contract lives in
     core; the cli imports it; core must not import cli.
   - `reconcilePassed` is a conjunction (`passed && !contradictingSignalPresent`),
     monotonic toward fail — it can demote a dishonest pass but never promote a real
     failure to green, and preserves assess failures with no signal (e.g. lint).
   - The write path (`captureHealthSnapshot`) is the primary guarantee; `strength-007`
     is demoted to a defense-in-depth backstop for hand-edited or stale snapshots.

   ## Consequences

   - Adding a signal is a single registry entry that flows to the name union, the check
     map, and the cli's `SIGNAL_RULES` typing automatically — the drift class is removed,
     not just the current symptom.
   - A future contributor must not re-introduce a local signal<->check map in cli or
     core; extend `SIGNAL_REGISTRY` instead.
   - Read-path stale caches are out of scope; they self-heal on regeneration and
     `strength-007` flags any that persist.
   ```

3. Run: `harness validate`
4. Commit: `docs(adr-0046): canonical signal<->check contract owned by core`

### Task 8: Write knowledge note — `health-signal-contract`

**Depends on:** Task 7 | **Files:** `docs/knowledge/core/health-signal-contract.md` | **Category:** integration

1. Create `docs/knowledge/core/health-signal-contract.md`:

   ```markdown
   # Health-signal contract

   **Concept:** `health-signal-contract` — a single registry from which the
   check<->signal map is derived, with snapshot `passed` flags reconciled
   monotonically-toward-fail against active signals.

   ## What it is

   `packages/core/src/health-signals/index.ts` owns the canonical health-signal
   vocabulary. `SIGNAL_REGISTRY` is the single source of truth: an array of
   `{ name, check }` where `check` is a `CheckKey` or `null` (metrics-only). From it
   are derived:

   - `SignalName` — the union of all signal names.
   - `CHECK_SIGNAL_MAP` — `CheckKey -> SignalName[]` (many-to-one), built by grouping
     the registry on `check` and skipping `null`. Every `CheckKey` is present; a check
     with no signals (e.g. `lint`) maps to `[]`.
   - `reconcilePassed(checks, signals)` — pure conjunction that keeps `passed` true
     only if assess passed AND no contradicting signal is present. Never flips
     false -> true.

   ## Relationships

   - `captureHealthSnapshot` (cli) **depends-on** the registry: it imports
     `reconcilePassed` and applies it after `deriveSignals`, and types `SIGNAL_RULES`
     against `SignalName`. This is the primary honesty guarantee (write path).
   - `strength-007` (core) **depends-on** the registry: it imports `CHECK_SIGNAL_MAP`
     as a defense-in-depth backstop for snapshots that bypass the write path.

   ## Invariant

   A snapshot from `captureHealthSnapshot` never has `checks[k].passed === true` while
   any signal in `CHECK_SIGNAL_MAP[k]` is present in `signals[]`. Metrics-only signals
   (`check: null`) never affect any `passed` flag.

   ## See also

   - ADR 0046 — Canonical signal<->check contract owned by core.
   - Spec: `docs/changes/health-snapshot-signal-honesty/proposal.md`.
   ```

2. Run: `harness validate`
3. Commit: `docs(knowledge): add health-signal-contract concept note`

### Task 9: Full-suite validation + dogfood honesty check

**Depends on:** Task 8 | **Files:** none (verification only) | **Category:** integration
[checkpoint:human-verify]

1. Run the full workspace test suite: `pnpm test` (or `pnpm -r test`) — observe core and cli suites pass (SC7).
2. Run: `pnpm -r typecheck` and `pnpm -r lint` — observe pass.
3. Run: `harness validate` — observe pass.
4. Regenerate the dogfooded snapshot for this worktree (the write path now reconciles): trigger `captureHealthSnapshot` via the normal harness path that produces `.harness/health-snapshot.json`, then inspect it.
5. **[checkpoint:human-verify]** Confirm with the human: in the regenerated `.harness/health-snapshot.json`, `security.passed` and `docs.passed` are no longer `true` while their contradicting signals are present (the original github#528 symptom). Show the relevant `checks` and `signals` excerpt. Wait for confirmation before considering the plan complete.
6. No commit unless the regenerated snapshot is a tracked artifact in this repo; if it is, commit: `chore: regenerate honest health-snapshot`.

## Notes for the executor

- **Do not start a build.** `pnpm install` + `pnpm build` are already running in the background. Tasks 4-6 (cli/core cross-package imports) assume core's `dist/` is current. If a cli test fails on resolving `reconcilePassed`/`SignalName` from `@harness-engineering/core`, the core build has not finished — wait and re-run; do not edit imports.
- **Commit after every task** (worktree HEAD can be force-reset by peer automation, wiping uncommitted work).
- **Stay in this worktree** (`/Users/cwarner/Projects/iv/harness-engineering-hs-spec`); do not touch the main checkout.
- `harness validate` may flag a pre-existing stale arch baseline unrelated to this change — that is non-blocking; do not "fix" it as part of these tasks.
