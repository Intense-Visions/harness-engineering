# Plan: Architecture Assertion Framework -- Phase 3: Baseline Engine

**Date:** 2026-03-23
**Spec:** docs/changes/architecture-assertion-framework/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Implement the baseline engine (`ArchBaselineManager` and `diff()`) that captures metric snapshots, persists them to disk, loads and validates them, and diffs current metrics against the baseline using ratchet logic.

## Observable Truths (Acceptance Criteria)

1. When `capture()` is called with `MetricResult[]` and a commit hash, the system shall return an `ArchBaseline` with `version: 1`, a valid ISO 8601 `updatedAt`, the provided commit hash in `updatedFrom`, and a `metrics` record keyed by category containing aggregate values and violation IDs.
2. When `save()` is called with an `ArchBaseline`, the system shall write valid JSON to the configured baseline path (default `.harness/arch/baselines.json`), creating parent directories if needed.
3. When `load()` is called and the baselines file exists with valid data, the system shall return an `ArchBaseline` validated against `ArchBaselineSchema`.
4. When `load()` is called and the file does not exist or contains invalid JSON or fails schema validation, the system shall return `null`.
5. When `diff()` receives current metrics with no new violations and no aggregate regressions compared to the baseline, the system shall return `{ passed: true }` with empty `newViolations` and `regressions` arrays.
6. When `diff()` receives current metrics containing a violation ID not present in the baseline, the system shall return `{ passed: false }` with that violation in `newViolations`.
7. When `diff()` receives current metrics where a baseline violation ID is absent from current results, the system shall include that ID in `resolvedViolations`.
8. When `diff()` receives current metrics where a category's aggregate value exceeds the baseline value, the system shall return `{ passed: false }` with a `CategoryRegression` entry containing the baseline value, current value, and delta.
9. When `diff()` receives current metrics where violation IDs exist in both current and baseline, those IDs shall appear in `preExisting`.
10. `npx vitest run packages/core/tests/architecture/baseline-manager.test.ts` passes with 6+ tests.
11. `npx vitest run packages/core/tests/architecture/diff.test.ts` passes with 8+ tests.
12. `harness validate` passes after all tasks complete.

## File Map

- CREATE `packages/core/src/architecture/baseline-manager.ts`
- CREATE `packages/core/src/architecture/diff.ts`
- CREATE `packages/core/tests/architecture/baseline-manager.test.ts`
- CREATE `packages/core/tests/architecture/diff.test.ts`
- MODIFY `packages/core/src/architecture/index.ts` (add exports for ArchBaselineManager and diff)

## Tasks

### Task 1: Create `ArchBaselineManager` with `capture()` method (TDD)

**Depends on:** none
**Files:** `packages/core/tests/architecture/baseline-manager.test.ts`, `packages/core/src/architecture/baseline-manager.ts`

1. Create test file `packages/core/tests/architecture/baseline-manager.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { ArchBaselineManager } from '../../src/architecture/baseline-manager';
   import { ArchBaselineSchema } from '../../src/architecture/types';
   import type { MetricResult } from '../../src/architecture/types';
   import { mkdtempSync, rmSync } from 'node:fs';
   import { join } from 'node:path';
   import { tmpdir } from 'node:os';

   describe('ArchBaselineManager', () => {
     let tmpDir: string;
     let manager: ArchBaselineManager;

     beforeEach(() => {
       tmpDir = mkdtempSync(join(tmpdir(), 'arch-baseline-'));
       manager = new ArchBaselineManager(tmpDir);
     });

     afterEach(() => {
       rmSync(tmpDir, { recursive: true, force: true });
     });

     describe('capture()', () => {
       it('creates a baseline from metric results', () => {
         const results: MetricResult[] = [
           {
             category: 'circular-deps',
             scope: 'project',
             value: 2,
             violations: [
               { id: 'cd-1', file: 'src/a.ts', detail: 'Cycle: a -> b -> a', severity: 'error' },
               { id: 'cd-2', file: 'src/c.ts', detail: 'Cycle: c -> d -> c', severity: 'error' },
             ],
           },
           {
             category: 'complexity',
             scope: 'src/services',
             value: 15,
             violations: [
               {
                 id: 'cx-1',
                 file: 'src/services/user.ts',
                 detail: 'High complexity: 18',
                 severity: 'warning',
               },
             ],
           },
         ];

         const baseline = manager.capture(results, 'abc123');

         expect(baseline.version).toBe(1);
         expect(baseline.updatedFrom).toBe('abc123');
         // updatedAt should be valid ISO 8601
         expect(() => new Date(baseline.updatedAt).toISOString()).not.toThrow();
         // metrics keyed by category
         expect(baseline.metrics['circular-deps']).toEqual({
           value: 2,
           violationIds: ['cd-1', 'cd-2'],
         });
         expect(baseline.metrics['complexity']).toEqual({
           value: 15,
           violationIds: ['cx-1'],
         });
       });

       it('aggregates multiple results for the same category', () => {
         const results: MetricResult[] = [
           {
             category: 'complexity',
             scope: 'src/services',
             value: 10,
             violations: [{ id: 'cx-1', file: 'src/a.ts', detail: 'd1', severity: 'warning' }],
           },
           {
             category: 'complexity',
             scope: 'src/api',
             value: 5,
             violations: [{ id: 'cx-2', file: 'src/b.ts', detail: 'd2', severity: 'warning' }],
           },
         ];

         const baseline = manager.capture(results, 'def456');

         expect(baseline.metrics['complexity']!.value).toBe(15);
         expect(baseline.metrics['complexity']!.violationIds).toEqual(['cx-1', 'cx-2']);
       });

       it('produces a baseline that passes ArchBaselineSchema validation', () => {
         const results: MetricResult[] = [
           { category: 'coupling', scope: 'project', value: 3, violations: [] },
         ];
         const baseline = manager.capture(results, 'hash1');
         const parsed = ArchBaselineSchema.safeParse(baseline);
         expect(parsed.success).toBe(true);
       });

       it('returns empty metrics record for empty results', () => {
         const baseline = manager.capture([], 'hash2');
         expect(baseline.metrics).toEqual({});
         expect(baseline.version).toBe(1);
       });
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/architecture/baseline-manager.test.ts`
3. Observe failure: `ArchBaselineManager` is not defined / cannot be imported.

4. Create implementation `packages/core/src/architecture/baseline-manager.ts`:

   ```typescript
   import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
   import { join, dirname } from 'node:path';
   import { ArchBaselineSchema } from './types';
   import type { ArchBaseline, MetricResult, CategoryBaseline } from './types';

   /**
    * Manages architecture baselines stored on disk.
    *
    * Baselines are stored at `.harness/arch/baselines.json` relative to the project root.
    * Each category maps to an aggregate value and an allowlist of known violation IDs.
    */
   export class ArchBaselineManager {
     private readonly baselinesPath: string;

     constructor(projectRoot: string, baselinePath?: string) {
       this.baselinesPath = baselinePath
         ? join(projectRoot, baselinePath)
         : join(projectRoot, '.harness', 'arch', 'baselines.json');
     }

     /**
      * Snapshot the current metric results into an ArchBaseline.
      * Aggregates multiple MetricResults for the same category by summing values
      * and concatenating violation IDs.
      */
     capture(results: MetricResult[], commitHash: string): ArchBaseline {
       const metrics: Record<string, CategoryBaseline> = {};

       for (const result of results) {
         const existing = metrics[result.category];
         if (existing) {
           existing.value += result.value;
           existing.violationIds.push(...result.violations.map((v) => v.id));
         } else {
           metrics[result.category] = {
             value: result.value,
             violationIds: result.violations.map((v) => v.id),
           };
         }
       }

       return {
         version: 1,
         updatedAt: new Date().toISOString(),
         updatedFrom: commitHash,
         metrics,
       };
     }

     /**
      * Load the baselines file from disk.
      * Returns null if the file does not exist, contains invalid JSON,
      * or fails ArchBaselineSchema validation.
      */
     load(): ArchBaseline | null {
       if (!existsSync(this.baselinesPath)) {
         return null;
       }
       try {
         const raw = readFileSync(this.baselinesPath, 'utf-8');
         const data = JSON.parse(raw);
         const parsed = ArchBaselineSchema.safeParse(data);
         if (!parsed.success) {
           return null;
         }
         return parsed.data;
       } catch {
         return null;
       }
     }

     /**
      * Save an ArchBaseline to disk.
      * Creates parent directories if they do not exist.
      */
     save(baseline: ArchBaseline): void {
       const dir = dirname(this.baselinesPath);
       if (!existsSync(dir)) {
         mkdirSync(dir, { recursive: true });
       }
       writeFileSync(this.baselinesPath, JSON.stringify(baseline, null, 2));
     }
   }
   ```

5. Run test: `npx vitest run packages/core/tests/architecture/baseline-manager.test.ts`
6. Observe: all 4 tests pass.
7. Run: `npx harness validate`
8. Commit: `feat(architecture): add ArchBaselineManager with capture method`

---

### Task 2: Add `load()` and `save()` tests to ArchBaselineManager (TDD)

**Depends on:** Task 1
**Files:** `packages/core/tests/architecture/baseline-manager.test.ts`, `packages/core/src/architecture/baseline-manager.ts`

1. Append to the `describe('ArchBaselineManager')` block in `packages/core/tests/architecture/baseline-manager.test.ts`, after the `capture()` describe block. Add these imports at the top if not already present: `writeFileSync, mkdirSync, readFileSync` from `node:fs`:

   ```typescript
   describe('load()', () => {
     it('returns null when baselines file does not exist', () => {
       expect(manager.load()).toBeNull();
     });

     it('loads a valid baselines file', () => {
       const baseline = {
         version: 1,
         updatedAt: '2026-03-23T10:00:00.000Z',
         updatedFrom: 'abc123',
         metrics: {
           'circular-deps': { value: 2, violationIds: ['cd-1', 'cd-2'] },
         },
       };
       mkdirSync(join(tmpDir, '.harness', 'arch'), { recursive: true });
       writeFileSync(join(tmpDir, '.harness', 'arch', 'baselines.json'), JSON.stringify(baseline));

       const loaded = manager.load();
       expect(loaded).toEqual(baseline);
     });

     it('returns null for invalid JSON', () => {
       mkdirSync(join(tmpDir, '.harness', 'arch'), { recursive: true });
       writeFileSync(join(tmpDir, '.harness', 'arch', 'baselines.json'), 'not-valid-json{{{');
       expect(manager.load()).toBeNull();
     });

     it('returns null for JSON that fails schema validation', () => {
       mkdirSync(join(tmpDir, '.harness', 'arch'), { recursive: true });
       writeFileSync(
         join(tmpDir, '.harness', 'arch', 'baselines.json'),
         JSON.stringify({ version: 99, bad: true })
       );
       expect(manager.load()).toBeNull();
     });
   });

   describe('save()', () => {
     it('writes baseline to disk creating directories', () => {
       const baseline = manager.capture(
         [{ category: 'coupling', scope: 'project', value: 3, violations: [] }],
         'save-hash'
       );

       manager.save(baseline);

       const raw = readFileSync(join(tmpDir, '.harness', 'arch', 'baselines.json'), 'utf-8');
       const written = JSON.parse(raw);
       expect(written.version).toBe(1);
       expect(written.updatedFrom).toBe('save-hash');
       expect(written.metrics['coupling']).toEqual({ value: 3, violationIds: [] });
     });

     it('overwrites existing baseline file', () => {
       const first = manager.capture(
         [{ category: 'coupling', scope: 'project', value: 3, violations: [] }],
         'first'
       );
       manager.save(first);

       const second = manager.capture(
         [{ category: 'coupling', scope: 'project', value: 5, violations: [] }],
         'second'
       );
       manager.save(second);

       const loaded = manager.load();
       expect(loaded!.updatedFrom).toBe('second');
       expect(loaded!.metrics['coupling']!.value).toBe(5);
     });
   });

   describe('custom baselinePath', () => {
     it('uses custom path when provided', () => {
       const customManager = new ArchBaselineManager(tmpDir, 'custom/baselines.json');
       const baseline = customManager.capture(
         [{ category: 'complexity', scope: 'project', value: 1, violations: [] }],
         'custom-hash'
       );
       customManager.save(baseline);

       const loaded = customManager.load();
       expect(loaded).not.toBeNull();
       expect(loaded!.updatedFrom).toBe('custom-hash');
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/architecture/baseline-manager.test.ts`
3. Observe: all tests pass (implementation already supports load/save from Task 1).
4. Run: `npx harness validate`
5. Commit: `test(architecture): add load, save, and custom path tests for ArchBaselineManager`

---

### Task 3: Implement `diff()` pure function (TDD)

**Depends on:** Task 1 (uses types only, no runtime dep on baseline-manager)
**Files:** `packages/core/tests/architecture/diff.test.ts`, `packages/core/src/architecture/diff.ts`

1. Create test file `packages/core/tests/architecture/diff.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { diff } from '../../src/architecture/diff';
   import type { MetricResult, ArchBaseline } from '../../src/architecture/types';

   function makeBaseline(
     metrics: Record<string, { value: number; violationIds: string[] }>
   ): ArchBaseline {
     return {
       version: 1,
       updatedAt: '2026-03-23T10:00:00.000Z',
       updatedFrom: 'baseline-hash',
       metrics,
     };
   }

   describe('diff()', () => {
     it('passes when current matches baseline exactly', () => {
       const baseline = makeBaseline({
         'circular-deps': { value: 2, violationIds: ['cd-1', 'cd-2'] },
       });
       const current: MetricResult[] = [
         {
           category: 'circular-deps',
           scope: 'project',
           value: 2,
           violations: [
             { id: 'cd-1', file: 'src/a.ts', detail: 'Cycle a', severity: 'error' },
             { id: 'cd-2', file: 'src/b.ts', detail: 'Cycle b', severity: 'error' },
           ],
         },
       ];

       const result = diff(current, baseline);

       expect(result.passed).toBe(true);
       expect(result.newViolations).toEqual([]);
       expect(result.resolvedViolations).toEqual([]);
       expect(result.preExisting).toEqual(['cd-1', 'cd-2']);
       expect(result.regressions).toEqual([]);
     });

     it('fails when there are new violations', () => {
       const baseline = makeBaseline({
         'circular-deps': { value: 1, violationIds: ['cd-1'] },
       });
       const current: MetricResult[] = [
         {
           category: 'circular-deps',
           scope: 'project',
           value: 2,
           violations: [
             { id: 'cd-1', file: 'src/a.ts', detail: 'Cycle a', severity: 'error' },
             { id: 'cd-new', file: 'src/c.ts', detail: 'New cycle', severity: 'error' },
           ],
         },
       ];

       const result = diff(current, baseline);

       expect(result.passed).toBe(false);
       expect(result.newViolations).toHaveLength(1);
       expect(result.newViolations[0]!.id).toBe('cd-new');
       expect(result.preExisting).toEqual(['cd-1']);
     });

     it('detects resolved violations', () => {
       const baseline = makeBaseline({
         'circular-deps': { value: 2, violationIds: ['cd-1', 'cd-2'] },
       });
       const current: MetricResult[] = [
         {
           category: 'circular-deps',
           scope: 'project',
           value: 1,
           violations: [{ id: 'cd-1', file: 'src/a.ts', detail: 'Cycle a', severity: 'error' }],
         },
       ];

       const result = diff(current, baseline);

       expect(result.passed).toBe(true);
       expect(result.resolvedViolations).toEqual(['cd-2']);
       expect(result.preExisting).toEqual(['cd-1']);
     });

     it('fails when aggregate value exceeds baseline (regression)', () => {
       const baseline = makeBaseline({
         complexity: { value: 10, violationIds: ['cx-1'] },
       });
       const current: MetricResult[] = [
         {
           category: 'complexity',
           scope: 'project',
           value: 15,
           violations: [{ id: 'cx-1', file: 'src/a.ts', detail: 'High', severity: 'warning' }],
         },
       ];

       const result = diff(current, baseline);

       expect(result.passed).toBe(false);
       expect(result.regressions).toHaveLength(1);
       expect(result.regressions[0]).toEqual({
         category: 'complexity',
         baselineValue: 10,
         currentValue: 15,
         delta: 5,
       });
       // No new violations since cx-1 is pre-existing
       expect(result.newViolations).toEqual([]);
       expect(result.preExisting).toEqual(['cx-1']);
     });

     it('handles multiple categories independently', () => {
       const baseline = makeBaseline({
         'circular-deps': { value: 1, violationIds: ['cd-1'] },
         complexity: { value: 5, violationIds: ['cx-1'] },
       });
       const current: MetricResult[] = [
         {
           category: 'circular-deps',
           scope: 'project',
           value: 0,
           violations: [],
         },
         {
           category: 'complexity',
           scope: 'project',
           value: 8,
           violations: [
             { id: 'cx-1', file: 'src/a.ts', detail: 'High', severity: 'warning' },
             { id: 'cx-2', file: 'src/b.ts', detail: 'New', severity: 'warning' },
           ],
         },
       ];

       const result = diff(current, baseline);

       expect(result.passed).toBe(false);
       // circular-deps resolved
       expect(result.resolvedViolations).toContain('cd-1');
       // complexity has new violation and regression
       expect(result.newViolations).toHaveLength(1);
       expect(result.newViolations[0]!.id).toBe('cx-2');
       expect(result.regressions).toHaveLength(1);
       expect(result.regressions[0]!.category).toBe('complexity');
     });

     it('passes when aggregate decreases (improvement)', () => {
       const baseline = makeBaseline({
         complexity: { value: 10, violationIds: ['cx-1', 'cx-2'] },
       });
       const current: MetricResult[] = [
         {
           category: 'complexity',
           scope: 'project',
           value: 7,
           violations: [{ id: 'cx-1', file: 'src/a.ts', detail: 'High', severity: 'warning' }],
         },
       ];

       const result = diff(current, baseline);

       expect(result.passed).toBe(true);
       expect(result.regressions).toEqual([]);
       expect(result.resolvedViolations).toContain('cx-2');
     });

     it('handles categories in current that are not in baseline', () => {
       const baseline = makeBaseline({
         'circular-deps': { value: 0, violationIds: [] },
       });
       const current: MetricResult[] = [
         {
           category: 'circular-deps',
           scope: 'project',
           value: 0,
           violations: [],
         },
         {
           category: 'complexity',
           scope: 'project',
           value: 5,
           violations: [{ id: 'cx-1', file: 'src/a.ts', detail: 'High', severity: 'warning' }],
         },
       ];

       const result = diff(current, baseline);

       // New category not in baseline — all violations are new
       expect(result.passed).toBe(false);
       expect(result.newViolations).toHaveLength(1);
       expect(result.newViolations[0]!.id).toBe('cx-1');
     });

     it('aggregates multiple MetricResults for the same category', () => {
       const baseline = makeBaseline({
         complexity: { value: 15, violationIds: ['cx-1', 'cx-2'] },
       });
       const current: MetricResult[] = [
         {
           category: 'complexity',
           scope: 'src/services',
           value: 8,
           violations: [
             { id: 'cx-1', file: 'src/services/a.ts', detail: 'High', severity: 'warning' },
           ],
         },
         {
           category: 'complexity',
           scope: 'src/api',
           value: 7,
           violations: [{ id: 'cx-2', file: 'src/api/b.ts', detail: 'High', severity: 'warning' }],
         },
       ];

       const result = diff(current, baseline);

       expect(result.passed).toBe(true);
       expect(result.preExisting).toEqual(expect.arrayContaining(['cx-1', 'cx-2']));
       expect(result.regressions).toEqual([]);
     });

     it('handles new category with zero violations as passing', () => {
       const baseline = makeBaseline({
         'circular-deps': { value: 0, violationIds: [] },
       });
       const current: MetricResult[] = [
         { category: 'circular-deps', scope: 'project', value: 0, violations: [] },
         { category: 'complexity', scope: 'project', value: 0, violations: [] },
       ];

       const result = diff(current, baseline);

       expect(result.passed).toBe(true);
       expect(result.newViolations).toEqual([]);
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/architecture/diff.test.ts`
3. Observe failure: `diff` cannot be imported.

4. Create implementation `packages/core/src/architecture/diff.ts`:

   ```typescript
   import type {
     MetricResult,
     ArchBaseline,
     ArchDiffResult,
     CategoryRegression,
     Violation,
     CategoryBaseline,
   } from './types';

   interface AggregatedCategory {
     value: number;
     violations: Violation[];
   }

   /**
    * Aggregate MetricResult[] by category, summing values and concatenating violations.
    */
   function aggregateByCategory(results: MetricResult[]): Map<string, AggregatedCategory> {
     const map = new Map<string, AggregatedCategory>();
     for (const result of results) {
       const existing = map.get(result.category);
       if (existing) {
         existing.value += result.value;
         existing.violations.push(...result.violations);
       } else {
         map.set(result.category, {
           value: result.value,
           violations: [...result.violations],
         });
       }
     }
     return map;
   }

   /**
    * Diff current metric results against a stored baseline.
    *
    * Pure function implementing the ratchet logic:
    * - New violations (in current but not baseline) cause failure
    * - Aggregate value exceeding baseline causes failure (regression)
    * - Pre-existing violations (in both) are allowed
    * - Resolved violations (in baseline but not current) are celebrated
    *
    * Categories present in current but absent from the baseline are treated
    * as having an empty baseline (value: 0, no known violations), so any
    * violations in those categories are considered new.
    */
   export function diff(current: MetricResult[], baseline: ArchBaseline): ArchDiffResult {
     const aggregated = aggregateByCategory(current);
     const newViolations: Violation[] = [];
     const resolvedViolations: string[] = [];
     const preExisting: string[] = [];
     const regressions: CategoryRegression[] = [];

     // Track which baseline categories we have visited
     const visitedCategories = new Set<string>();

     // Process each category in the current results
     for (const [category, agg] of aggregated) {
       visitedCategories.add(category);

       const baselineCategory: CategoryBaseline | undefined =
         baseline.metrics[category as keyof typeof baseline.metrics];
       const baselineViolationIds = new Set(baselineCategory?.violationIds ?? []);
       const baselineValue = baselineCategory?.value ?? 0;

       // Classify violations
       for (const violation of agg.violations) {
         if (baselineViolationIds.has(violation.id)) {
           preExisting.push(violation.id);
         } else {
           newViolations.push(violation);
         }
       }

       // Find resolved violations (in baseline but not in current)
       const currentViolationIds = new Set(agg.violations.map((v) => v.id));
       if (baselineCategory) {
         for (const id of baselineCategory.violationIds) {
           if (!currentViolationIds.has(id)) {
             resolvedViolations.push(id);
           }
         }
       }

       // Check for aggregate regression
       if (baselineCategory && agg.value > baselineValue) {
         regressions.push({
           category: category as ArchDiffResult['regressions'][number]['category'],
           baselineValue,
           currentValue: agg.value,
           delta: agg.value - baselineValue,
         });
       }
     }

     // Process baseline categories not present in current results (all resolved)
     for (const [category, baselineCategory] of Object.entries(baseline.metrics)) {
       if (!visitedCategories.has(category) && baselineCategory) {
         for (const id of baselineCategory.violationIds) {
           resolvedViolations.push(id);
         }
       }
     }

     const passed = newViolations.length === 0 && regressions.length === 0;

     return {
       passed,
       newViolations,
       resolvedViolations,
       preExisting,
       regressions,
     };
   }
   ```

5. Run test: `npx vitest run packages/core/tests/architecture/diff.test.ts`
6. Observe: all 9 tests pass.
7. Run: `npx harness validate`
8. Commit: `feat(architecture): add diff() pure function with ratchet logic`

---

### Task 4: Additional diff edge cases (TDD)

**Depends on:** Task 3
**Files:** `packages/core/tests/architecture/diff.test.ts`

1. Append additional test cases to the existing `describe('diff()')` block in `packages/core/tests/architecture/diff.test.ts`:

   ```typescript
   it('resolves all violations when category disappears from current', () => {
     const baseline = makeBaseline({
       'circular-deps': { value: 2, violationIds: ['cd-1', 'cd-2'] },
       complexity: { value: 5, violationIds: ['cx-1'] },
     });
     // Only complexity in current, circular-deps entirely gone
     const current: MetricResult[] = [
       {
         category: 'complexity',
         scope: 'project',
         value: 5,
         violations: [{ id: 'cx-1', file: 'src/a.ts', detail: 'High', severity: 'warning' }],
       },
     ];

     const result = diff(current, baseline);

     expect(result.passed).toBe(true);
     expect(result.resolvedViolations).toContain('cd-1');
     expect(result.resolvedViolations).toContain('cd-2');
     expect(result.preExisting).toEqual(['cx-1']);
   });

   it('passes with empty current and empty baseline', () => {
     const baseline = makeBaseline({});
     const current: MetricResult[] = [];

     const result = diff(current, baseline);

     expect(result.passed).toBe(true);
     expect(result.newViolations).toEqual([]);
     expect(result.resolvedViolations).toEqual([]);
     expect(result.preExisting).toEqual([]);
     expect(result.regressions).toEqual([]);
   });

   it('new violations contain full Violation objects not just IDs', () => {
     const baseline = makeBaseline({
       'forbidden-imports': { value: 0, violationIds: [] },
     });
     const current: MetricResult[] = [
       {
         category: 'forbidden-imports',
         scope: 'project',
         value: 1,
         violations: [
           {
             id: 'fi-1',
             file: 'src/api/handler.ts',
             detail: 'Imports from src/internal',
             severity: 'error',
           },
         ],
       },
     ];

     const result = diff(current, baseline);

     expect(result.passed).toBe(false);
     expect(result.newViolations[0]).toEqual({
       id: 'fi-1',
       file: 'src/api/handler.ts',
       detail: 'Imports from src/internal',
       severity: 'error',
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/architecture/diff.test.ts`
3. Observe: all 12 tests pass.
4. Run: `npx harness validate`
5. Commit: `test(architecture): add edge case tests for diff() ratchet logic`

---

### Task 5: Export baseline-manager and diff from architecture index

**Depends on:** Task 1, Task 3
**Files:** `packages/core/src/architecture/index.ts`

1. Modify `packages/core/src/architecture/index.ts` to add exports. After the existing collector exports block, add:

   ```typescript
   export { ArchBaselineManager } from './baseline-manager';
   export { diff } from './diff';
   ```

   The full file should read:

   ```typescript
   export {
     ArchMetricCategorySchema,
     ViolationSchema,
     MetricResultSchema,
     CategoryBaselineSchema,
     ArchBaselineSchema,
     CategoryRegressionSchema,
     ArchDiffResultSchema,
     ThresholdConfigSchema,
     ArchConfigSchema,
     ConstraintRuleSchema,
   } from './types';

   export type {
     ArchMetricCategory,
     Violation,
     MetricResult,
     CategoryBaseline,
     ArchBaseline,
     CategoryRegression,
     ArchDiffResult,
     ThresholdConfig,
     ArchConfig,
     ConstraintRule,
     Collector,
   } from './types';

   export {
     defaultCollectors,
     runAll,
     CircularDepsCollector,
     LayerViolationCollector,
     ComplexityCollector,
     CouplingCollector,
     ForbiddenImportCollector,
     ModuleSizeCollector,
     DepDepthCollector,
     violationId,
   } from './collectors/index';

   export { ArchBaselineManager } from './baseline-manager';
   export { diff } from './diff';
   ```

2. Run all architecture tests to verify nothing is broken: `npx vitest run packages/core/tests/architecture/`
3. Run: `npx harness validate`
4. Run: `npx harness check-deps`
5. Commit: `feat(architecture): export ArchBaselineManager and diff from index`
