# Plan: Architecture Assertion Framework -- Phase 1: Types and Collector Interface

**Date:** 2026-03-23
**Spec:** docs/changes/architecture-assertion-framework/proposal.md
**Estimated tasks:** 3
**Estimated time:** 12 minutes

## Goal

Define all type definitions (Zod schemas + inferred types) and the Collector interface for the architecture assertion framework, establishing the foundation that all subsequent phases depend on.

## Observable Truths (Acceptance Criteria)

1. `packages/core/src/architecture/types.ts` exists and exports Zod schemas (`MetricResultSchema`, `ViolationSchema`, `ArchBaselineSchema`, `CategoryBaselineSchema`, `ArchDiffResultSchema`, `CategoryRegressionSchema`, `ArchConfigSchema`) and inferred TypeScript types, plus the `ArchMetricCategory` union type and `Collector` interface.
2. When `ViolationSchema.safeParse({ id: 'abc', file: 'src/foo.ts', detail: 'desc', severity: 'error' })` is called, the result has `success === true`.
3. When `ViolationSchema.safeParse({ id: 123 })` is called, the result has `success === false` (rejects invalid data).
4. When `ArchBaselineSchema.safeParse(...)` is called with a valid baseline object (version 1, ISO date, commit hash, metrics record), the result has `success === true`.
5. When `ArchConfigSchema.safeParse(...)` is called with a valid config object (enabled, baselinePath, thresholds, modules), the result has `success === true`.
6. `packages/core/src/architecture/index.ts` barrel-exports all schemas, types, and the `Collector` interface.
7. `packages/core/src/index.ts` includes `export * from './architecture'`.
8. `npx vitest run packages/core/tests/architecture/types.test.ts` passes with all tests green.
9. `harness validate` passes.

## File Map

- CREATE `packages/core/src/architecture/types.ts`
- CREATE `packages/core/src/architecture/index.ts`
- MODIFY `packages/core/src/index.ts` (add architecture re-export)
- CREATE `packages/core/tests/architecture/types.test.ts`

## Tasks

### Task 1: Create architecture types with Zod schemas

**Depends on:** none
**Files:** `packages/core/src/architecture/types.ts`

1. Create directory `packages/core/src/architecture/` if it does not exist:

   ```bash
   mkdir -p packages/core/src/architecture
   ```

2. Create `packages/core/src/architecture/types.ts` with the following content:

   ```typescript
   import { z } from 'zod';

   // --- Metric Categories ---

   export const ArchMetricCategorySchema = z.enum([
     'circular-deps',
     'layer-violations',
     'complexity',
     'coupling',
     'forbidden-imports',
     'module-size',
     'dependency-depth',
   ]);

   export type ArchMetricCategory = z.infer<typeof ArchMetricCategorySchema>;

   // --- Violation ---

   export const ViolationSchema = z.object({
     id: z.string(), // stable hash: sha256(relativePath + ':' + category + ':' + normalizedDetail)
     file: z.string(), // relative to project root
     detail: z.string(), // human-readable description
     severity: z.enum(['error', 'warning']),
   });

   export type Violation = z.infer<typeof ViolationSchema>;

   // --- Metric Result ---

   export const MetricResultSchema = z.object({
     category: ArchMetricCategorySchema,
     scope: z.string(), // e.g., 'project', 'src/services', 'src/api/routes.ts'
     value: z.number(), // numeric metric (violation count, complexity score, etc.)
     violations: z.array(ViolationSchema),
     metadata: z.record(z.unknown()).optional(),
   });

   export type MetricResult = z.infer<typeof MetricResultSchema>;

   // --- Category Baseline ---

   export const CategoryBaselineSchema = z.object({
     value: z.number(), // aggregate metric value at baseline time
     violationIds: z.array(z.string()), // stable IDs of known violations (the allowlist)
   });

   export type CategoryBaseline = z.infer<typeof CategoryBaselineSchema>;

   // --- Arch Baseline ---

   export const ArchBaselineSchema = z.object({
     version: z.literal(1),
     updatedAt: z.string(), // ISO 8601
     updatedFrom: z.string(), // commit hash
     metrics: z.record(ArchMetricCategorySchema, CategoryBaselineSchema),
   });

   export type ArchBaseline = z.infer<typeof ArchBaselineSchema>;

   // --- Category Regression ---

   export const CategoryRegressionSchema = z.object({
     category: ArchMetricCategorySchema,
     baselineValue: z.number(),
     currentValue: z.number(),
     delta: z.number(),
   });

   export type CategoryRegression = z.infer<typeof CategoryRegressionSchema>;

   // --- Arch Diff Result ---

   export const ArchDiffResultSchema = z.object({
     passed: z.boolean(),
     newViolations: z.array(ViolationSchema), // in current but not in baseline -> FAIL
     resolvedViolations: z.array(z.string()), // in baseline but not in current -> celebrate
     preExisting: z.array(z.string()), // in both -> allowed, tracked
     regressions: z.array(CategoryRegressionSchema), // aggregate value exceeded baseline
   });

   export type ArchDiffResult = z.infer<typeof ArchDiffResultSchema>;

   // --- Threshold Config ---

   export const ThresholdConfigSchema = z.record(
     z.string(),
     z.union([z.number(), z.record(z.string(), z.number())])
   );

   export type ThresholdConfig = z.infer<typeof ThresholdConfigSchema>;

   // --- Arch Config ---

   export const ArchConfigSchema = z.object({
     enabled: z.boolean().default(true),
     baselinePath: z.string().default('.harness/arch/baselines.json'),
     thresholds: ThresholdConfigSchema.default({}),
     modules: z.record(z.string(), ThresholdConfigSchema).default({}),
   });

   export type ArchConfig = z.infer<typeof ArchConfigSchema>;

   // --- Collector Interface ---

   /**
    * Collector interface for architecture metric collection.
    * Each collector is responsible for a single metric category.
    * Cannot be expressed as a Zod schema because it has methods.
    */
   export interface Collector {
     category: ArchMetricCategory;
     collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]>;
   }
   ```

3. Run: `npx harness validate`
4. Commit: `feat(architecture): add types and Zod schemas for architecture assertion framework`

---

### Task 2: Create barrel export and wire into core index

**Depends on:** Task 1
**Files:** `packages/core/src/architecture/index.ts`, `packages/core/src/index.ts`

1. Create `packages/core/src/architecture/index.ts`:

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
     Collector,
   } from './types';
   ```

2. Add architecture module re-export to `packages/core/src/index.ts`. Insert before the `// Parsers` comment:

   ```typescript
   // Architecture module
   export * from './architecture';
   ```

3. Run: `npx harness validate`
4. Commit: `feat(architecture): add barrel exports and wire into core index`

---

### Task 3: Create type validation tests (TDD-retroactive -- schemas already exist)

**Depends on:** Task 2
**Files:** `packages/core/tests/architecture/types.test.ts`

1. Create directory `packages/core/tests/architecture/` if it does not exist:

   ```bash
   mkdir -p packages/core/tests/architecture
   ```

2. Create `packages/core/tests/architecture/types.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import {
     ArchMetricCategorySchema,
     ViolationSchema,
     MetricResultSchema,
     CategoryBaselineSchema,
     ArchBaselineSchema,
     CategoryRegressionSchema,
     ArchDiffResultSchema,
     ArchConfigSchema,
   } from '../../src/architecture/types';
   import type { Collector, ArchConfig, MetricResult } from '../../src/architecture/types';

   describe('ArchMetricCategorySchema', () => {
     it('accepts all 7 valid categories', () => {
       const categories = [
         'circular-deps',
         'layer-violations',
         'complexity',
         'coupling',
         'forbidden-imports',
         'module-size',
         'dependency-depth',
       ];
       for (const cat of categories) {
         const result = ArchMetricCategorySchema.safeParse(cat);
         expect(result.success).toBe(true);
       }
     });

     it('rejects invalid category', () => {
       const result = ArchMetricCategorySchema.safeParse('invalid-category');
       expect(result.success).toBe(false);
     });
   });

   describe('ViolationSchema', () => {
     it('validates a complete violation', () => {
       const result = ViolationSchema.safeParse({
         id: 'abc123',
         file: 'src/services/user.ts',
         detail: 'Function exceeds complexity threshold',
         severity: 'error',
       });
       expect(result.success).toBe(true);
     });

     it('validates a warning severity', () => {
       const result = ViolationSchema.safeParse({
         id: 'def456',
         file: 'src/api/routes.ts',
         detail: 'High fan-out detected',
         severity: 'warning',
       });
       expect(result.success).toBe(true);
     });

     it('rejects violation with missing fields', () => {
       const result = ViolationSchema.safeParse({ id: 'abc' });
       expect(result.success).toBe(false);
     });

     it('rejects violation with invalid severity', () => {
       const result = ViolationSchema.safeParse({
         id: 'abc',
         file: 'src/foo.ts',
         detail: 'desc',
         severity: 'critical',
       });
       expect(result.success).toBe(false);
     });
   });

   describe('MetricResultSchema', () => {
     it('validates a metric result with violations', () => {
       const result = MetricResultSchema.safeParse({
         category: 'complexity',
         scope: 'src/services',
         value: 12,
         violations: [
           {
             id: 'v1',
             file: 'src/services/user.ts',
             detail: 'High complexity',
             severity: 'warning',
           },
         ],
       });
       expect(result.success).toBe(true);
     });

     it('validates a metric result with optional metadata', () => {
       const result = MetricResultSchema.safeParse({
         category: 'module-size',
         scope: 'src/api',
         value: 25,
         violations: [],
         metadata: { fileCount: 25, totalLoc: 1500 },
       });
       expect(result.success).toBe(true);
     });

     it('validates a metric result without metadata', () => {
       const result = MetricResultSchema.safeParse({
         category: 'circular-deps',
         scope: 'project',
         value: 0,
         violations: [],
       });
       expect(result.success).toBe(true);
     });

     it('rejects metric result with invalid category', () => {
       const result = MetricResultSchema.safeParse({
         category: 'not-a-category',
         scope: 'project',
         value: 0,
         violations: [],
       });
       expect(result.success).toBe(false);
     });
   });

   describe('CategoryBaselineSchema', () => {
     it('validates a category baseline', () => {
       const result = CategoryBaselineSchema.safeParse({
         value: 3,
         violationIds: ['v1', 'v2', 'v3'],
       });
       expect(result.success).toBe(true);
     });

     it('validates a category baseline with empty violations', () => {
       const result = CategoryBaselineSchema.safeParse({
         value: 0,
         violationIds: [],
       });
       expect(result.success).toBe(true);
     });
   });

   describe('ArchBaselineSchema', () => {
     it('validates a complete baseline', () => {
       const result = ArchBaselineSchema.safeParse({
         version: 1,
         updatedAt: '2026-03-23T10:00:00Z',
         updatedFrom: 'abc123def',
         metrics: {
           'circular-deps': { value: 0, violationIds: [] },
           complexity: { value: 12, violationIds: ['v1', 'v2'] },
         },
       });
       expect(result.success).toBe(true);
     });

     it('rejects baseline with wrong version', () => {
       const result = ArchBaselineSchema.safeParse({
         version: 2,
         updatedAt: '2026-03-23T10:00:00Z',
         updatedFrom: 'abc123def',
         metrics: {},
       });
       expect(result.success).toBe(false);
     });

     it('rejects baseline with invalid category key', () => {
       const result = ArchBaselineSchema.safeParse({
         version: 1,
         updatedAt: '2026-03-23T10:00:00Z',
         updatedFrom: 'abc123def',
         metrics: {
           'not-a-category': { value: 0, violationIds: [] },
         },
       });
       expect(result.success).toBe(false);
     });
   });

   describe('CategoryRegressionSchema', () => {
     it('validates a regression entry', () => {
       const result = CategoryRegressionSchema.safeParse({
         category: 'coupling',
         baselineValue: 5,
         currentValue: 8,
         delta: 3,
       });
       expect(result.success).toBe(true);
     });
   });

   describe('ArchDiffResultSchema', () => {
     it('validates a passing diff result', () => {
       const result = ArchDiffResultSchema.safeParse({
         passed: true,
         newViolations: [],
         resolvedViolations: ['old-v1'],
         preExisting: ['v2', 'v3'],
         regressions: [],
       });
       expect(result.success).toBe(true);
     });

     it('validates a failing diff result with new violations', () => {
       const result = ArchDiffResultSchema.safeParse({
         passed: false,
         newViolations: [
           { id: 'new-v1', file: 'src/new.ts', detail: 'New circular dep', severity: 'error' },
         ],
         resolvedViolations: [],
         preExisting: ['v2'],
         regressions: [{ category: 'circular-deps', baselineValue: 1, currentValue: 2, delta: 1 }],
       });
       expect(result.success).toBe(true);
     });
   });

   describe('ArchConfigSchema', () => {
     it('validates a complete config', () => {
       const result = ArchConfigSchema.safeParse({
         enabled: true,
         baselinePath: '.harness/arch/baselines.json',
         thresholds: {
           'circular-deps': 0,
           'layer-violations': 0,
           complexity: 15,
           coupling: { maxFanIn: 10, maxFanOut: 8 },
           'forbidden-imports': 0,
           'module-size': { maxFiles: 30, maxLoc: 3000 },
           'dependency-depth': 7,
         },
         modules: {
           'src/services': { complexity: 10 },
           'src/api': { coupling: { maxFanOut: 5 } },
         },
       });
       expect(result.success).toBe(true);
     });

     it('applies defaults for minimal config', () => {
       const result = ArchConfigSchema.parse({});
       expect(result.enabled).toBe(true);
       expect(result.baselinePath).toBe('.harness/arch/baselines.json');
       expect(result.thresholds).toEqual({});
       expect(result.modules).toEqual({});
     });

     it('allows overriding defaults', () => {
       const result = ArchConfigSchema.parse({
         enabled: false,
         baselinePath: 'custom/path.json',
       });
       expect(result.enabled).toBe(false);
       expect(result.baselinePath).toBe('custom/path.json');
     });
   });

   describe('Collector interface', () => {
     it('can be implemented with correct shape', () => {
       const mockCollector: Collector = {
         category: 'complexity',
         collect: async (_config: ArchConfig, _rootDir: string): Promise<MetricResult[]> => {
           return [
             {
               category: 'complexity',
               scope: 'project',
               value: 10,
               violations: [],
             },
           ];
         },
       };
       expect(mockCollector.category).toBe('complexity');
       expect(typeof mockCollector.collect).toBe('function');
     });

     it('collect returns a promise of MetricResult[]', async () => {
       const mockCollector: Collector = {
         category: 'circular-deps',
         collect: async () => [],
       };
       const results = await mockCollector.collect(
         {
           enabled: true,
           baselinePath: '.harness/arch/baselines.json',
           thresholds: {},
           modules: {},
         },
         '/tmp/project'
       );
       expect(Array.isArray(results)).toBe(true);
       expect(results).toHaveLength(0);
     });
   });
   ```

3. Run test: `npx vitest run packages/core/tests/architecture/types.test.ts`
4. Observe: all tests pass
5. Run: `npx harness validate`
6. Commit: `test(architecture): add type validation tests for architecture assertion schemas`
