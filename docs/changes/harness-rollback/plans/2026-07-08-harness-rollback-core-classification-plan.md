# Plan: harness:rollback — Phase 1: Core Classification

**Date:** 2026-07-08 | **Spec:** docs/changes/harness-rollback/proposal.md (Implementation Order #1) | **Tasks:** 6 | **Time:** ~24 min | **Integration Tier:** medium

## Goal

Ship a pure, unit-testable `classify.ts` and the `RollbackDecision` type in a new `packages/core/src/rollback/` module (git/gh reached only through injected IO seams), wired into the core barrel and the `harness.config` schema, with unit coverage for clean revert, conflicting revert, dependent-merge block, and migration-warning paths (SC6).

## Scope Boundary (Phase 1 ONLY)

IN: `RollbackDecision` type, `RollbackIO` seam interface, pure `classifyRevert()` (cleanRevert, dependentMerges, migrationWarnings; blastRadius pass-through as context), core-barrel wiring (curated allowlist edit), `rollback` config block (`signals`, `evalTrigger.enabled`), unit tests, config-schema test.

OUT (later phases — DO NOT touch): CLI command (`rollback.ts`), PR composer (`compose.ts`), Node/`gh` IO adapter, workflow (`rollback-propose.yml`), the skill (4 platform copies), the ADR, AGENTS.md / reference-doc regen, `rollback_event` breadcrumb, signal-sweep engine.

## Observable Truths (Acceptance Criteria)

1. `packages/core/src/rollback/types.ts` exports `RollbackDecision` with exactly the spec's fields (`targetPr`, `trigger`, `revertReady`, `reasons`, `cleanRevert`, `dependentMerges`, `blastRadius?`, `migrationWarnings`, `action`, `prUrl?`).
2. `classify.ts` exports `classifyRevert(input, io)` reaching git/gh only through the injected `RollbackIO` seam — no `node:child_process` import anywhere in `packages/core/src/rollback/`.
3. Clean scratch-index revert → `cleanRevert=true`; conflicting revert → `cleanRevert=false`, `revertReady=false`, `action='skipped'`.
4. A later PR whose changed-file set intersects the target's → `dependentMerges` non-empty, `revertReady=false`, `action='blocked'`.
5. A target touching `**/migrations/**`, `*.sql`, or schema files → `migrationWarnings` non-empty; `migrationWarnings`/`blastRadius` never flip `revertReady` (context only).
6. `import { RollbackDecision, classifyRevert } from '@harness-engineering/core'` type-checks (barrel wired via `scripts/generate-core-barrel.mjs`).
7. `RollbackConfigSchema` (`signals`, `evalTrigger.enabled`) parses under `HarnessConfigSchema`; omitting the block is back-compat; `evalTrigger.enabled` defaults `false`.
8. `pnpm --filter @harness-engineering/core test` and `pnpm --filter @harness-engineering/cli test` (config schema test) pass; `node packages/cli/dist/bin/harness.js validate` shows no NEW findings.

### Requirements (EARS)

- When `classifyRevert` is called with a clean-applying merge sha and no dependent later merge, the system shall return `revertReady=true`, `action='proposed'`.
- If the injected `revertDryRun` reports a conflict, then the system shall set `cleanRevert=false`, `revertReady=false`, `action='skipped'` and shall not consult dependent merges as a gate override.
- If any later merged PR's changed-file set intersects the target's, then the system shall populate `dependentMerges`, set `revertReady=false`, `action='blocked'`.
- The system shall emit a `migrationWarnings` entry for each changed path matching a migration heuristic, without altering `revertReady`.

## File Map

- CREATE packages/core/src/rollback/types.ts
- CREATE packages/core/src/rollback/io.ts
- CREATE packages/core/src/rollback/classify.ts
- CREATE packages/core/src/rollback/index.ts
- CREATE packages/core/src/rollback/classify.test.ts
- MODIFY scripts/generate-core-barrel.mjs (add rollback to DIR_COMMENTS ordering + comment)
- MODIFY packages/core/src/index.ts (regenerated barrel — via `pnpm run generate:barrels`, not hand-edited)
- MODIFY packages/cli/src/config/schema.ts (add RollbackConfigSchema + `rollback` field + type export)
- CREATE packages/cli/tests/config/rollback-schema.test.ts

## Skeleton

_Not produced — task count (6) is below the standard-rigor threshold (8)._

## Uncertainties (carried to execution)

- [ASSUMPTION] Phase 1 ships the `RollbackIO` interface + pure logic only. The real Node/`gh`/`git` adapter binding lives in Phase 2 (CLI). Justification: spec says classify is "pure … git/gh reached through injected IO seams."
- [ASSUMPTION] `blastRadius` is a pass-through param (optional, from `compute_blast_radius` computed at CLI/command time). classify does NOT compute it. Migration detection IS in-module (pure path heuristic).
- [DEFERRABLE] Exact `reasons[]` wording — asserted by substring in tests.

---

## Tasks

### Task 1: Define `RollbackDecision` type and `RollbackIO` seam interface

**Depends on:** none | **Files:** packages/core/src/rollback/types.ts, packages/core/src/rollback/io.ts
**Skills:** `ts-type-guards` (reference)

1. Create `packages/core/src/rollback/types.ts` with exactly the spec's type plus the classify input shape:

   ```ts
   /**
    * Structured verdict from the rollback revert-readiness classifier.
    * Field set is the spec's Technical Design contract (packages/core/src/rollback/).
    * `blastRadius` and `migrationWarnings` are context only — they never gate `revertReady`.
    */
   export interface RollbackDecision {
     targetPr: number;
     trigger: 'signal' | 'eval';
     revertReady: boolean;
     /** Human-readable reasons the target is (not) revert-ready. */
     reasons: string[];
     /** `git revert -n -m 1 <mergeSha>` applies in a scratch index without conflict. */
     cleanRevert: boolean;
     /** Later-merged PRs whose changed-file set intersects the target's. */
     dependentMerges: number[];
     /** Context only, never a gate. Passed through from `compute_blast_radius` (CLI phase). */
     blastRadius?: number;
     /** Context only, never a gate. Emitted by the migration path heuristic. */
     migrationWarnings: string[];
     action: 'proposed' | 'skipped' | 'blocked';
     prUrl?: string;
   }

   /**
    * A later-merged PR the classifier compares against the target for dependency.
    */
   export interface LaterMerge {
     pr: number;
     changedFiles: string[];
   }

   /**
    * Pure inputs to `classifyRevert`. All git/gh access is via the injected
    * `RollbackIO` seam (see io.ts), never called directly here.
    */
   export interface ClassifyInput {
     targetPr: number;
     trigger: 'signal' | 'eval';
     /** Merge commit sha of the target PR, fed to the scratch-index revert. */
     mergeSha: string;
     /** Files the target PR changed (used for dependency intersection + migration heuristic). */
     changedFiles: string[];
     /** PRs merged after the target, in the relevant window. */
     laterMerges: LaterMerge[];
     /** Optional pre-computed blast-radius score (context only). */
     blastRadius?: number;
   }
   ```

2. Create `packages/core/src/rollback/io.ts` with the injected seam (mirrors the `ShardIO` convention in `packages/core/src/roadmap/store/shard-store.ts`):

   ```ts
   /**
    * Injected IO seam for the rollback classifier. Keeps `classify.ts` pure and
    * unit-testable: git/gh are reached only through these methods, never via
    * `node:child_process`. The real Node/`gh` adapter binding lands in the CLI phase.
    */
   export interface RollbackIO {
     /**
      * Attempt `git revert -n -m 1 <mergeSha>` in a scratch index (no working-tree
      * mutation), report whether it applied cleanly, then abort. `true` = clean apply.
      */
     revertDryRun(mergeSha: string): Promise<{ clean: boolean; conflictPaths: string[] }>;
   }
   ```

3. Run: `pnpm --filter @harness-engineering/core exec tsc --noEmit -p tsconfig.json` — observe it type-checks (no consumers yet).
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit: `feat(rollback): define RollbackDecision type and RollbackIO seam`

---

### Task 2: Write failing unit tests for `classifyRevert` (TDD red)

**Depends on:** Task 1 | **Files:** packages/core/src/rollback/classify.test.ts
**Skills:** `ts-testing-types` (reference)

1. Create `packages/core/src/rollback/classify.test.ts`. Import `classifyRevert` (not yet created — test will fail to compile/run) and drive the four SC6 paths via a fake `RollbackIO`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { classifyRevert } from './classify';
   import type { RollbackIO } from './io';
   import type { ClassifyInput } from './types';

   function fakeIo(clean: boolean, conflictPaths: string[] = []): RollbackIO {
     return { revertDryRun: async () => ({ clean, conflictPaths }) };
   }

   const base: ClassifyInput = {
     targetPr: 100,
     trigger: 'signal',
     mergeSha: 'abc123',
     changedFiles: ['src/foo.ts'],
     laterMerges: [],
   };

   describe('classifyRevert', () => {
     it('clean revert with no dependents is revert-ready and proposed', async () => {
       const d = await classifyRevert(base, fakeIo(true));
       expect(d.cleanRevert).toBe(true);
       expect(d.revertReady).toBe(true);
       expect(d.action).toBe('proposed');
       expect(d.dependentMerges).toEqual([]);
       expect(d.migrationWarnings).toEqual([]);
     });

     it('conflicting revert is not ready and skipped', async () => {
       const d = await classifyRevert(base, fakeIo(false, ['src/foo.ts']));
       expect(d.cleanRevert).toBe(false);
       expect(d.revertReady).toBe(false);
       expect(d.action).toBe('skipped');
       expect(d.reasons.join(' ')).toMatch(/conflict/i);
     });

     it('dependent later merge blocks a clean revert', async () => {
       const input: ClassifyInput = {
         ...base,
         laterMerges: [{ pr: 101, changedFiles: ['src/foo.ts', 'src/bar.ts'] }],
       };
       const d = await classifyRevert(input, fakeIo(true));
       expect(d.cleanRevert).toBe(true);
       expect(d.dependentMerges).toEqual([101]);
       expect(d.revertReady).toBe(false);
       expect(d.action).toBe('blocked');
     });

     it('non-intersecting later merge does not block', async () => {
       const input: ClassifyInput = {
         ...base,
         laterMerges: [{ pr: 102, changedFiles: ['src/unrelated.ts'] }],
       };
       const d = await classifyRevert(input, fakeIo(true));
       expect(d.dependentMerges).toEqual([]);
       expect(d.revertReady).toBe(true);
     });

     it('migration paths emit warnings as context without gating', async () => {
       const input: ClassifyInput = {
         ...base,
         changedFiles: [
           'db/migrations/0007_add_users.ts',
           'schema/orders.sql',
           'prisma/schema.prisma',
           'src/foo.ts',
         ],
       };
       const d = await classifyRevert(input, fakeIo(true));
       expect(d.migrationWarnings.length).toBeGreaterThan(0);
       // context only — clean + no dependents stays revert-ready
       expect(d.revertReady).toBe(true);
       expect(d.action).toBe('proposed');
     });

     it('blastRadius is passed through as context only', async () => {
       const d = await classifyRevert({ ...base, blastRadius: 42 }, fakeIo(true));
       expect(d.blastRadius).toBe(42);
       expect(d.revertReady).toBe(true);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core exec vitest run src/rollback/classify.test.ts` — observe FAILURE (module `./classify` does not exist).
3. Commit: `test(rollback): failing classifyRevert coverage (SC6 paths)`

---

### Task 3: Implement `classifyRevert` (TDD green)

**Depends on:** Task 2 | **Files:** packages/core/src/rollback/classify.ts
**Skills:** `ts-type-guards` (reference)

1. Create `packages/core/src/rollback/classify.ts`:

   ```ts
   import type { ClassifyInput, RollbackDecision } from './types';
   import type { RollbackIO } from './io';

   /**
    * Migration/irreversibility path heuristics. Matching is CONTEXT ONLY — it
    * emits warning strings and never flips `revertReady` (spec D3).
    */
   const MIGRATION_PATTERNS: ReadonlyArray<{ test: (p: string) => boolean; label: string }> = [
     { test: (p) => /(^|\/)migrations\//.test(p), label: 'migration directory' },
     { test: (p) => p.endsWith('.sql'), label: 'SQL file' },
     { test: (p) => /(^|\/)schema\.(prisma|sql|graphql|rb)$/.test(p), label: 'schema file' },
   ];

   function detectMigrationWarnings(changedFiles: string[]): string[] {
     const warnings: string[] = [];
     for (const file of changedFiles) {
       for (const { test, label } of MIGRATION_PATTERNS) {
         if (test(file)) {
           warnings.push(`${file} (${label}) — verify revert does not orphan schema state`);
           break;
         }
       }
     }
     return warnings;
   }

   function intersects(a: string[], b: string[]): boolean {
     const set = new Set(a);
     return b.some((x) => set.has(x));
   }

   /**
    * Pure revert-readiness classifier. Reaches git/gh only through the injected
    * `RollbackIO` seam. Gate order (spec D3): a conflicting revert short-circuits
    * to `skipped`; a dependent later merge blocks; otherwise revert-ready.
    * `blastRadius`/`migrationWarnings` are attached as context and never gate.
    */
   export async function classifyRevert(
     input: ClassifyInput,
     io: RollbackIO
   ): Promise<RollbackDecision> {
     const migrationWarnings = detectMigrationWarnings(input.changedFiles);
     const { clean, conflictPaths } = await io.revertDryRun(input.mergeSha);

     const dependentMerges = input.laterMerges
       .filter((m) => intersects(input.changedFiles, m.changedFiles))
       .map((m) => m.pr);

     const reasons: string[] = [];
     let revertReady: boolean;
     let action: RollbackDecision['action'];

     if (!clean) {
       revertReady = false;
       action = 'skipped';
       reasons.push(
         `git revert did not apply cleanly (conflicts: ${conflictPaths.join(', ') || 'unknown'})`
       );
     } else if (dependentMerges.length > 0) {
       revertReady = false;
       action = 'blocked';
       reasons.push(`dependent later merge(s) touch the same files: ${dependentMerges.join(', ')}`);
     } else {
       revertReady = true;
       action = 'proposed';
       reasons.push('clean revert with no dependent later merge');
     }

     return {
       targetPr: input.targetPr,
       trigger: input.trigger,
       revertReady,
       reasons,
       cleanRevert: clean,
       dependentMerges,
       blastRadius: input.blastRadius,
       migrationWarnings,
       action,
     };
   }
   ```

2. Run: `pnpm --filter @harness-engineering/core exec vitest run src/rollback/classify.test.ts` — observe PASS (all 6 tests green).
3. Run: `node packages/cli/dist/bin/harness.js validate`
4. Commit: `feat(rollback): implement pure classifyRevert (clean/conflict/dependent/migration)`

---

### Task 4: Barrel wiring — module index + curated allowlist edit

**Depends on:** Task 3 | **Files:** packages/core/src/rollback/index.ts, scripts/generate-core-barrel.mjs, packages/core/src/index.ts
**Category:** integration
**Skills:** none

> The core barrel is generated from a CURATED allowlist. A new dir with its own
> `index.ts` is auto-discovered, but it lands in the alphabetical fallback block
> with a generic comment. Adding a `DIR_COMMENTS` entry gives it canonical
> ordering + a real JSDoc line. Edit the SOURCE (`packages/core/src/index.ts` is
> AUTO-GENERATED — regenerate it, never hand-edit).

1. Create `packages/core/src/rollback/index.ts`:

   ```ts
   /**
    * Rollback module — post-ship revert-readiness classification.
    * Pure, IO-injected: git/gh are reached only through the `RollbackIO` seam.
    */
   export type { RollbackDecision, RollbackIO, ClassifyInput, LaterMerge } from './types';
   export type { RollbackIO as RollbackIOSeam } from './io';
   export { classifyRevert } from './classify';
   ```

   Note: `RollbackIO` is declared in `io.ts`, not `types.ts` — fix the re-export so it points at the right module:

   ```ts
   export type { RollbackDecision, ClassifyInput, LaterMerge } from './types';
   export type { RollbackIO } from './io';
   export { classifyRevert } from './classify';
   ```

   (Use this second block; drop the first.)

2. Edit `scripts/generate-core-barrel.mjs` — add a `rollback` entry to the `DIR_COMMENTS` map (near the other domain modules, e.g. after the `roadmap` line):

   ```js
   rollback: 'Rollback module — post-ship revert-readiness classification (pure, IO-injected).',
   ```

3. Regenerate the barrel: `pnpm run generate:barrels`
4. Verify: `grep -n "rollback" packages/core/src/index.ts` shows `export * from './rollback';` with the new comment.
5. Verify freshness gate: `node scripts/generate-core-barrel.mjs --check` prints "Core barrel is up to date."
6. Run: `node packages/cli/dist/bin/harness.js validate`
7. Commit: `feat(rollback): wire rollback exports into core barrel (curated allowlist)`

---

### Task 5: Config-schema wiring — `rollback` block

**Depends on:** Task 3 | **Files:** packages/cli/src/config/schema.ts
**Category:** integration
**Skills:** `ts-zod-integration` (reference)

1. In `packages/cli/src/config/schema.ts`, add the schema block ABOVE `export const HarnessConfigSchema = z.object({` (near the other domain schemas, e.g. after `RoadmapConfigSchema`):

   ```ts
   /**
    * Schema for the post-ship rollback circuit breaker (`rollback`).
    *
    * Phase 1 declares only the config surface the classification engine and its
    * trigger arms read:
    *   - `signals` maps a signal name -> threshold/direction/window; a crossing
    *     resolves to the PR(s) merged in the window (signal arm, live in v1).
    *   - `evalTrigger.enabled` gates the eval arm (dark in v1; default false).
    *
    * @see docs/changes/harness-rollback/proposal.md (Trigger arms)
    */
   export const RollbackSignalRuleSchema = z.object({
     /** Threshold value the signal must cross to fire. */
     threshold: z.number(),
     /** Which crossing direction fires: value going above or below the threshold. */
     direction: z.enum(['above', 'below']),
     /** Lookback window (e.g. "24h", "7d") mapping the crossing to merged PRs. */
     window: z.string(),
   });

   export const RollbackConfigSchema = z.object({
     /** Signal-name -> crossing rule. A crossing calls `evaluate --trigger signal`. */
     signals: z.record(z.string(), RollbackSignalRuleSchema).default({}),
     /** Eval-triggered arm. Dark in v1; default disabled until #31 lands. */
     evalTrigger: z
       .object({
         enabled: z.boolean().default(false),
       })
       .default({}),
   });
   ```

2. Add the field to `HarnessConfigSchema` (e.g. right after the `roadmap:` field):

   ```ts
     /** Post-ship rollback circuit-breaker settings (signal arm live, eval arm dark). */
     rollback: RollbackConfigSchema.optional(),
   ```

3. Add the type export near the other `z.infer` exports at the bottom of the file:

   ```ts
   /**
    * Type for rollback circuit-breaker configuration.
    */
   export type RollbackConfig = z.infer<typeof RollbackConfigSchema>;
   ```

4. Run: `pnpm --filter @harness-engineering/cli exec tsc --noEmit -p tsconfig.json` — observe it type-checks.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(rollback): add rollback config block (signals, evalTrigger.enabled)`

---

### Task 6: Config-schema unit test

**Depends on:** Task 5 | **Files:** packages/cli/tests/config/rollback-schema.test.ts
**Category:** integration
**Skills:** `ts-zod-integration` (reference), `ts-testing-types` (reference)

1. Create `packages/cli/tests/config/rollback-schema.test.ts` (mirror `packages/cli/tests/config/knowledge-schema.test.ts`):

   ```ts
   // packages/cli/tests/config/rollback-schema.test.ts
   import { describe, it, expect } from 'vitest';
   import { RollbackConfigSchema, HarnessConfigSchema } from '../../src/config/schema';

   describe('RollbackConfigSchema', () => {
     it('accepts a fully populated rollback config', () => {
       const result = RollbackConfigSchema.safeParse({
         signals: { errorRate: { threshold: 0.05, direction: 'above', window: '24h' } },
         evalTrigger: { enabled: true },
       });
       expect(result.success).toBe(true);
     });

     it('accepts an empty object (all fields defaulted)', () => {
       const parsed = RollbackConfigSchema.parse({});
       expect(parsed.signals).toEqual({});
       expect(parsed.evalTrigger).toEqual({ enabled: false });
     });

     it('defaults evalTrigger.enabled to false', () => {
       const parsed = RollbackConfigSchema.parse({ signals: {} });
       expect(parsed.evalTrigger.enabled).toBe(false);
     });

     it('rejects an invalid signal direction', () => {
       const result = RollbackConfigSchema.safeParse({
         signals: { x: { threshold: 1, direction: 'sideways', window: '1d' } },
       });
       expect(result.success).toBe(false);
     });

     it('rejects a non-numeric threshold', () => {
       const result = RollbackConfigSchema.safeParse({
         signals: { x: { threshold: 'high', direction: 'above', window: '1d' } },
       });
       expect(result.success).toBe(false);
     });
   });

   describe('HarnessConfigSchema with rollback block', () => {
     const baseConfig = { version: 1 as const, name: 'test-project' };

     it('accepts config with populated rollback block', () => {
       const result = HarnessConfigSchema.safeParse({
         ...baseConfig,
         rollback: {
           signals: { errorRate: { threshold: 0.05, direction: 'above', window: '24h' } },
           evalTrigger: { enabled: false },
         },
       });
       expect(result.success).toBe(true);
     });

     it('accepts config without rollback block (back-compat)', () => {
       const result = HarnessConfigSchema.safeParse(baseConfig);
       expect(result.success).toBe(true);
     });

     it('applies defaults when rollback block is empty object', () => {
       const parsed = HarnessConfigSchema.parse({ ...baseConfig, rollback: {} });
       expect(parsed.rollback).toEqual({ signals: {}, evalTrigger: { enabled: false } });
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/config/rollback-schema.test.ts` — observe PASS.
3. Run the full phase test sweep to confirm no regressions:
   `pnpm --filter @harness-engineering/core exec vitest run src/rollback && pnpm --filter @harness-engineering/cli exec vitest run tests/config/rollback-schema.test.ts`
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit: `test(rollback): config-schema coverage for rollback block`

---

## Dependency Graph

- Task 1 → (Task 2, Task 5)
- Task 2 → Task 3
- Task 3 → (Task 4, Task 5)
- Task 5 → Task 6

Parallel opportunity: after Task 3, Task 4 (barrel) and Task 5 (config schema) touch disjoint files and can run concurrently. Task 6 waits on Task 5.

## Validation Trace (truth → task)

| Observable Truth                       | Delivered by                   |
| -------------------------------------- | ------------------------------ |
| 1 (RollbackDecision type)              | Task 1                         |
| 2 (injected IO seam, no child_process) | Task 1, Task 3                 |
| 3 (clean/conflict)                     | Task 2, Task 3                 |
| 4 (dependent merge block)              | Task 2, Task 3                 |
| 5 (migration warnings, non-gating)     | Task 2, Task 3                 |
| 6 (barrel export resolves)             | Task 4                         |
| 7 (config block parses)                | Task 5, Task 6                 |
| 8 (tests + validate green)             | Task 3, Task 4, Task 5, Task 6 |
