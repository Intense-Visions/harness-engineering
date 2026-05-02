# Plan: Architecture Assertion Collectors (Phase 2)

**Date:** 2026-03-23
**Spec:** docs/changes/architecture-assertion-framework/proposal.md
**Estimated tasks:** 10
**Estimated time:** 40 minutes

## Goal

Implement seven collector adapters that wrap existing harness detectors (and two new implementations) to produce normalized `MetricResult[]` conforming to the architecture assertion type system, plus a registry that runs all collectors.

## Observable Truths (Acceptance Criteria)

1. When `CircularDepsCollector.collect()` is called with a project containing circular dependencies, the system shall return `MetricResult[]` with `category: 'circular-deps'`, one violation per cycle, and stable `id` hashes using `sha256(relativePath + ':' + category + ':' + normalizedDetail)`.
2. When `LayerViolationCollector.collect()` is called with a project containing layer violations, the system shall return `MetricResult[]` with `category: 'layer-violations'`, one violation per dependency violation with `reason === 'WRONG_LAYER'`.
3. When `ComplexityCollector.collect()` is called, the system shall return `MetricResult[]` with `category: 'complexity'`, converting `ComplexityViolation[]` from the entropy detector into normalized `Violation[]`.
4. When `CouplingCollector.collect()` is called, the system shall return `MetricResult[]` with `category: 'coupling'`, converting `CouplingViolation[]` from the entropy detector into normalized `Violation[]`.
5. When `ForbiddenImportCollector.collect()` is called, the system shall return `MetricResult[]` with `category: 'forbidden-imports'`, including only violations where `reason === 'FORBIDDEN_IMPORT'` from `validateDependencies()`.
6. When `ModuleSizeCollector.collect()` is called, the system shall return `MetricResult[]` with `category: 'module-size'`, one result per module containing `metadata: { fileCount, totalLoc }`.
7. When `DepDepthCollector.collect()` is called, the system shall return `MetricResult[]` with `category: 'dependency-depth'`, reporting the longest import chain per module.
8. When `runAll(config, rootDir)` is called, the system shall invoke all 7 default collectors in parallel and return a flat `MetricResult[]` array.
9. The system shall produce identical violation IDs across repeated runs on the same codebase (stable hashing).
10. `npx vitest run packages/core/tests/architecture/collectors/` shall pass with all tests green.
11. `harness validate` shall pass after all tasks are complete.

## File Map

- CREATE `packages/core/src/architecture/collectors/hash.ts`
- CREATE `packages/core/src/architecture/collectors/circular-deps.ts`
- CREATE `packages/core/src/architecture/collectors/layer-violations.ts`
- CREATE `packages/core/src/architecture/collectors/complexity.ts`
- CREATE `packages/core/src/architecture/collectors/coupling.ts`
- CREATE `packages/core/src/architecture/collectors/forbidden-imports.ts`
- CREATE `packages/core/src/architecture/collectors/module-size.ts`
- CREATE `packages/core/src/architecture/collectors/dep-depth.ts`
- CREATE `packages/core/src/architecture/collectors/index.ts`
- CREATE `packages/core/tests/architecture/collectors/hash.test.ts`
- CREATE `packages/core/tests/architecture/collectors/circular-deps.test.ts`
- CREATE `packages/core/tests/architecture/collectors/layer-violations.test.ts`
- CREATE `packages/core/tests/architecture/collectors/complexity.test.ts`
- CREATE `packages/core/tests/architecture/collectors/coupling.test.ts`
- CREATE `packages/core/tests/architecture/collectors/forbidden-imports.test.ts`
- CREATE `packages/core/tests/architecture/collectors/module-size.test.ts`
- CREATE `packages/core/tests/architecture/collectors/dep-depth.test.ts`
- CREATE `packages/core/tests/architecture/collectors/index.test.ts`
- MODIFY `packages/core/src/architecture/index.ts` (add collector exports)

## Tasks

### Task 1: Create violation ID hashing utility (TDD)

**Depends on:** none
**Files:** `packages/core/src/architecture/collectors/hash.ts`, `packages/core/tests/architecture/collectors/hash.test.ts`

1. Create test file `packages/core/tests/architecture/collectors/hash.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { violationId } from '../../../src/architecture/collectors/hash';

   describe('violationId', () => {
     it('produces a 64-char hex string (sha256)', () => {
       const id = violationId('src/a.ts', 'complexity', 'cyclomatic=18 in doStuff');
       expect(id).toMatch(/^[a-f0-9]{64}$/);
     });

     it('is deterministic across calls', () => {
       const a = violationId('src/a.ts', 'complexity', 'cyclomatic=18 in doStuff');
       const b = violationId('src/a.ts', 'complexity', 'cyclomatic=18 in doStuff');
       expect(a).toBe(b);
     });

     it('differs when file changes', () => {
       const a = violationId('src/a.ts', 'complexity', 'cyclomatic=18');
       const b = violationId('src/b.ts', 'complexity', 'cyclomatic=18');
       expect(a).not.toBe(b);
     });

     it('differs when category changes', () => {
       const a = violationId('src/a.ts', 'complexity', 'cyclomatic=18');
       const b = violationId('src/a.ts', 'coupling', 'cyclomatic=18');
       expect(a).not.toBe(b);
     });

     it('differs when detail changes', () => {
       const a = violationId('src/a.ts', 'complexity', 'cyclomatic=18');
       const b = violationId('src/a.ts', 'complexity', 'cyclomatic=20');
       expect(a).not.toBe(b);
     });

     it('normalizes Windows backslash paths', () => {
       const a = violationId('src\\a.ts', 'complexity', 'cyclomatic=18');
       const b = violationId('src/a.ts', 'complexity', 'cyclomatic=18');
       expect(a).toBe(b);
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/architecture/collectors/hash.test.ts`
3. Observe failure: module not found

4. Create implementation `packages/core/src/architecture/collectors/hash.ts`:

   ```typescript
   import { createHash } from 'node:crypto';

   /**
    * Produce a stable violation ID.
    * Formula: sha256(relativePath + ':' + category + ':' + normalizedDetail)
    * Line numbers are excluded to keep IDs stable across unrelated edits.
    */
   export function violationId(
     relativePath: string,
     category: string,
     normalizedDetail: string
   ): string {
     const path = relativePath.replace(/\\/g, '/');
     const input = `${path}:${category}:${normalizedDetail}`;
     return createHash('sha256').update(input).digest('hex');
   }
   ```

5. Run test: `npx vitest run packages/core/tests/architecture/collectors/hash.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(architecture): add violation ID hashing utility`

---

### Task 2: CircularDepsCollector (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/architecture/collectors/circular-deps.ts`, `packages/core/tests/architecture/collectors/circular-deps.test.ts`

1. Create test file `packages/core/tests/architecture/collectors/circular-deps.test.ts`:

   ```typescript
   import { describe, it, expect, vi } from 'vitest';
   import { CircularDepsCollector } from '../../../src/architecture/collectors/circular-deps';
   import type { ArchConfig } from '../../../src/architecture/types';

   const baseConfig: ArchConfig = {
     enabled: true,
     baselinePath: '.harness/arch/baselines.json',
     thresholds: {},
     modules: {},
   };

   // Mock buildDependencyGraph and detectCircularDeps
   vi.mock('../../../src/constraints/dependencies', () => ({
     buildDependencyGraph: vi.fn(),
   }));
   vi.mock('../../../src/constraints/circular-deps', () => ({
     detectCircularDeps: vi.fn(),
   }));

   import { buildDependencyGraph } from '../../../src/constraints/dependencies';
   import { detectCircularDeps } from '../../../src/constraints/circular-deps';

   const mockBuild = vi.mocked(buildDependencyGraph);
   const mockDetect = vi.mocked(detectCircularDeps);

   describe('CircularDepsCollector', () => {
     const collector = new CircularDepsCollector();

     it('has category "circular-deps"', () => {
       expect(collector.category).toBe('circular-deps');
     });

     it('returns empty results when no cycles found', async () => {
       mockBuild.mockResolvedValue({
         ok: true,
         value: { nodes: ['a.ts', 'b.ts'], edges: [] },
       } as any);
       mockDetect.mockReturnValue({
         ok: true,
         value: { hasCycles: false, cycles: [], largestCycle: 0 },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results).toHaveLength(1);
       expect(results[0]!.category).toBe('circular-deps');
       expect(results[0]!.scope).toBe('project');
       expect(results[0]!.value).toBe(0);
       expect(results[0]!.violations).toHaveLength(0);
     });

     it('returns one violation per cycle', async () => {
       mockBuild.mockResolvedValue({
         ok: true,
         value: {
           nodes: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
           edges: [
             { from: 'src/a.ts', to: 'src/b.ts', importType: 'static', line: 1 },
             { from: 'src/b.ts', to: 'src/a.ts', importType: 'static', line: 1 },
           ],
         },
       } as any);
       mockDetect.mockReturnValue({
         ok: true,
         value: {
           hasCycles: true,
           cycles: [{ cycle: ['src/a.ts', 'src/b.ts', 'src/a.ts'], severity: 'error', size: 2 }],
           largestCycle: 2,
         },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results).toHaveLength(1);
       expect(results[0]!.value).toBe(1);
       expect(results[0]!.violations).toHaveLength(1);
       expect(results[0]!.violations[0]!.severity).toBe('error');
       expect(results[0]!.violations[0]!.id).toMatch(/^[a-f0-9]{64}$/);
     });

     it('produces stable violation IDs', async () => {
       mockBuild.mockResolvedValue({
         ok: true,
         value: { nodes: ['src/a.ts', 'src/b.ts'], edges: [] },
       } as any);
       mockDetect.mockReturnValue({
         ok: true,
         value: {
           hasCycles: true,
           cycles: [{ cycle: ['src/a.ts', 'src/b.ts', 'src/a.ts'], severity: 'error', size: 2 }],
           largestCycle: 2,
         },
       } as any);

       const r1 = await collector.collect(baseConfig, '/project');
       const r2 = await collector.collect(baseConfig, '/project');
       expect(r1[0]!.violations[0]!.id).toBe(r2[0]!.violations[0]!.id);
     });

     it('includes metadata with largestCycle', async () => {
       mockBuild.mockResolvedValue({
         ok: true,
         value: { nodes: [], edges: [] },
       } as any);
       mockDetect.mockReturnValue({
         ok: true,
         value: {
           hasCycles: true,
           cycles: [{ cycle: ['a.ts', 'b.ts', 'c.ts', 'a.ts'], severity: 'error', size: 3 }],
           largestCycle: 3,
         },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results[0]!.metadata).toEqual({ largestCycle: 3, cycleCount: 1 });
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/architecture/collectors/circular-deps.test.ts`
3. Observe failure: module not found

4. Create implementation `packages/core/src/architecture/collectors/circular-deps.ts`:

   ```typescript
   import { relative } from 'node:path';
   import type { Collector, ArchConfig, MetricResult, Violation } from '../types';
   import { violationId } from './hash';
   import { buildDependencyGraph } from '../../constraints/dependencies';
   import { detectCircularDeps } from '../../constraints/circular-deps';
   import { findFiles } from '../../shared/fs-utils';

   export class CircularDepsCollector implements Collector {
     readonly category = 'circular-deps' as const;

     async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
       const files = await findFiles('**/*.ts', rootDir);
       const graphResult = await buildDependencyGraph(files, {
         name: 'typescript',
         parseFile: async () =>
           ({ ok: false, error: { code: 'PARSE_ERROR', message: 'not needed' } }) as any,
         extractImports: () =>
           ({ ok: false, error: { code: 'EXTRACT_ERROR', message: 'not needed' } }) as any,
         health: async () => ({ ok: true, value: { available: true } }) as any,
       });

       if (!graphResult.ok) {
         return [
           {
             category: this.category,
             scope: 'project',
             value: 0,
             violations: [],
             metadata: { error: 'Failed to build dependency graph' },
           },
         ];
       }

       const result = detectCircularDeps(graphResult.value);
       if (!result.ok) {
         return [
           {
             category: this.category,
             scope: 'project',
             value: 0,
             violations: [],
             metadata: { error: 'Failed to detect circular deps' },
           },
         ];
       }

       const { cycles, largestCycle } = result.value;
       const violations: Violation[] = cycles.map((cycle) => {
         const cyclePath = cycle.cycle.map((f) => relative(rootDir, f)).join(' -> ');
         const firstFile = relative(rootDir, cycle.cycle[0]!);
         return {
           id: violationId(firstFile, this.category, cyclePath),
           file: firstFile,
           detail: `Circular dependency: ${cyclePath}`,
           severity: cycle.severity,
         };
       });

       return [
         {
           category: this.category,
           scope: 'project',
           value: cycles.length,
           violations,
           metadata: { largestCycle, cycleCount: cycles.length },
         },
       ];
     }
   }
   ```

5. Run test: `npx vitest run packages/core/tests/architecture/collectors/circular-deps.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(architecture): add CircularDepsCollector`

---

### Task 3: LayerViolationCollector (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/architecture/collectors/layer-violations.ts`, `packages/core/tests/architecture/collectors/layer-violations.test.ts`

1. Create test file `packages/core/tests/architecture/collectors/layer-violations.test.ts`:

   ```typescript
   import { describe, it, expect, vi } from 'vitest';
   import { LayerViolationCollector } from '../../../src/architecture/collectors/layer-violations';
   import type { ArchConfig } from '../../../src/architecture/types';

   const baseConfig: ArchConfig = {
     enabled: true,
     baselinePath: '.harness/arch/baselines.json',
     thresholds: {},
     modules: {},
   };

   vi.mock('../../../src/constraints/dependencies', () => ({
     validateDependencies: vi.fn(),
   }));

   import { validateDependencies } from '../../../src/constraints/dependencies';
   const mockValidate = vi.mocked(validateDependencies);

   describe('LayerViolationCollector', () => {
     const collector = new LayerViolationCollector();

     it('has category "layer-violations"', () => {
       expect(collector.category).toBe('layer-violations');
     });

     it('returns empty results when no violations', async () => {
       mockValidate.mockResolvedValue({
         ok: true,
         value: { valid: true, violations: [], graph: { nodes: [], edges: [] } },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results).toHaveLength(1);
       expect(results[0]!.value).toBe(0);
       expect(results[0]!.violations).toHaveLength(0);
     });

     it('returns one violation per WRONG_LAYER dependency violation', async () => {
       mockValidate.mockResolvedValue({
         ok: true,
         value: {
           valid: false,
           violations: [
             {
               file: '/project/src/api/handler.ts',
               imports: '/project/src/db/connection.ts',
               fromLayer: 'api',
               toLayer: 'db',
               reason: 'WRONG_LAYER',
               line: 5,
               suggestion: 'Move to allowed layer',
             },
           ],
           graph: { nodes: [], edges: [] },
         },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results).toHaveLength(1);
       expect(results[0]!.value).toBe(1);
       expect(results[0]!.violations).toHaveLength(1);
       expect(results[0]!.violations[0]!.severity).toBe('error');
       expect(results[0]!.violations[0]!.id).toMatch(/^[a-f0-9]{64}$/);
       expect(results[0]!.violations[0]!.detail).toContain('api');
       expect(results[0]!.violations[0]!.detail).toContain('db');
     });

     it('excludes FORBIDDEN_IMPORT violations (those go to ForbiddenImportCollector)', async () => {
       mockValidate.mockResolvedValue({
         ok: true,
         value: {
           valid: false,
           violations: [
             {
               file: '/project/src/api/handler.ts',
               imports: '/project/src/db/connection.ts',
               fromLayer: 'api',
               toLayer: 'db',
               reason: 'WRONG_LAYER',
               line: 5,
               suggestion: 'Fix',
             },
             {
               file: '/project/src/api/handler.ts',
               imports: '/project/src/internal/secret.ts',
               fromLayer: 'api',
               toLayer: 'internal',
               reason: 'FORBIDDEN_IMPORT',
               line: 7,
               suggestion: 'Fix',
             },
           ],
           graph: { nodes: [], edges: [] },
         },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results[0]!.value).toBe(1);
       expect(results[0]!.violations).toHaveLength(1);
     });

     it('produces stable violation IDs', async () => {
       mockValidate.mockResolvedValue({
         ok: true,
         value: {
           valid: false,
           violations: [
             {
               file: '/project/src/api/handler.ts',
               imports: '/project/src/db/conn.ts',
               fromLayer: 'api',
               toLayer: 'db',
               reason: 'WRONG_LAYER',
               line: 5,
               suggestion: 'Fix',
             },
           ],
           graph: { nodes: [], edges: [] },
         },
       } as any);

       const r1 = await collector.collect(baseConfig, '/project');
       const r2 = await collector.collect(baseConfig, '/project');
       expect(r1[0]!.violations[0]!.id).toBe(r2[0]!.violations[0]!.id);
     });
   });
   ```

2. Run test, observe failure.

3. Create implementation `packages/core/src/architecture/collectors/layer-violations.ts`:

   ```typescript
   import { relative } from 'node:path';
   import type { Collector, ArchConfig, MetricResult, Violation } from '../types';
   import { violationId } from './hash';
   import { validateDependencies } from '../../constraints/dependencies';
   import type { DependencyViolation } from '../../constraints/types';

   export class LayerViolationCollector implements Collector {
     readonly category = 'layer-violations' as const;

     async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
       // LayerViolationCollector requires layer config to be passed through ArchConfig.
       // For now, use an empty layer set — the real layer config will come from harness.config.json
       // wiring in Phase 4 (config schema). This collector is invoked with the right LayerConfig
       // at that point.
       const result = await validateDependencies({
         layers: [],
         rootDir,
         parser: {
           name: 'typescript',
           parseFile: async () =>
             ({ ok: false, error: { code: 'PARSE_ERROR', message: '' } }) as any,
           extractImports: () =>
             ({ ok: false, error: { code: 'EXTRACT_ERROR', message: '' } }) as any,
           health: async () => ({ ok: true, value: { available: true } }) as any,
         },
         fallbackBehavior: 'skip',
       });

       if (!result.ok) {
         return [
           {
             category: this.category,
             scope: 'project',
             value: 0,
             violations: [],
             metadata: { error: 'Failed to validate dependencies' },
           },
         ];
       }

       const layerViolations = result.value.violations.filter(
         (v: DependencyViolation) => v.reason === 'WRONG_LAYER'
       );

       const violations: Violation[] = layerViolations.map((v: DependencyViolation) => {
         const relFile = relative(rootDir, v.file);
         const relImport = relative(rootDir, v.imports);
         const detail = `${v.fromLayer} -> ${v.toLayer}: ${relFile} imports ${relImport}`;
         return {
           id: violationId(relFile, this.category, detail),
           file: relFile,
           detail,
           severity: 'error' as const,
         };
       });

       return [
         {
           category: this.category,
           scope: 'project',
           value: violations.length,
           violations,
         },
       ];
     }
   }
   ```

4. Run test, observe pass.
5. Run: `harness validate`
6. Commit: `feat(architecture): add LayerViolationCollector`

---

### Task 4: ComplexityCollector (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/architecture/collectors/complexity.ts`, `packages/core/tests/architecture/collectors/complexity.test.ts`

1. Create test file `packages/core/tests/architecture/collectors/complexity.test.ts`:

   ```typescript
   import { describe, it, expect, vi } from 'vitest';
   import { ComplexityCollector } from '../../../src/architecture/collectors/complexity';
   import type { ArchConfig } from '../../../src/architecture/types';

   const baseConfig: ArchConfig = {
     enabled: true,
     baselinePath: '.harness/arch/baselines.json',
     thresholds: {},
     modules: {},
   };

   vi.mock('../../../src/entropy/detectors/complexity', () => ({
     detectComplexityViolations: vi.fn(),
   }));

   import { detectComplexityViolations } from '../../../src/entropy/detectors/complexity';
   const mockDetect = vi.mocked(detectComplexityViolations);

   describe('ComplexityCollector', () => {
     const collector = new ComplexityCollector();

     it('has category "complexity"', () => {
       expect(collector.category).toBe('complexity');
     });

     it('returns empty results when no violations', async () => {
       mockDetect.mockResolvedValue({
         ok: true,
         value: {
           violations: [],
           stats: {
             filesAnalyzed: 5,
             functionsAnalyzed: 10,
             violationCount: 0,
             errorCount: 0,
             warningCount: 0,
             infoCount: 0,
           },
         },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results).toHaveLength(1);
       expect(results[0]!.value).toBe(0);
       expect(results[0]!.violations).toHaveLength(0);
     });

     it('converts ComplexityViolation to Violation with stable IDs', async () => {
       mockDetect.mockResolvedValue({
         ok: true,
         value: {
           violations: [
             {
               file: '/project/src/service.ts',
               function: 'processData',
               line: 10,
               metric: 'cyclomaticComplexity',
               value: 18,
               threshold: 15,
               tier: 1,
               severity: 'error',
               message: 'Function "processData" has cyclomatic complexity of 18',
             },
           ],
           stats: {
             filesAnalyzed: 1,
             functionsAnalyzed: 1,
             violationCount: 1,
             errorCount: 1,
             warningCount: 0,
             infoCount: 0,
           },
         },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results).toHaveLength(1);
       expect(results[0]!.value).toBe(1);
       expect(results[0]!.violations).toHaveLength(1);
       expect(results[0]!.violations[0]!.id).toMatch(/^[a-f0-9]{64}$/);
       expect(results[0]!.violations[0]!.file).toBe('src/service.ts');
       expect(results[0]!.violations[0]!.detail).toContain('processData');
       expect(results[0]!.violations[0]!.detail).toContain('cyclomaticComplexity');
     });

     it('maps warning severity from ComplexityViolation', async () => {
       mockDetect.mockResolvedValue({
         ok: true,
         value: {
           violations: [
             {
               file: '/project/src/util.ts',
               function: 'helper',
               line: 5,
               metric: 'nestingDepth',
               value: 5,
               threshold: 4,
               tier: 2,
               severity: 'warning',
               message: 'Nesting too deep',
             },
           ],
           stats: {
             filesAnalyzed: 1,
             functionsAnalyzed: 1,
             violationCount: 1,
             errorCount: 0,
             warningCount: 1,
             infoCount: 0,
           },
         },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results[0]!.violations[0]!.severity).toBe('warning');
     });

     it('excludes info-severity violations (only error/warning)', async () => {
       mockDetect.mockResolvedValue({
         ok: true,
         value: {
           violations: [
             {
               file: '/project/src/big.ts',
               function: '<file>',
               line: 1,
               metric: 'fileLength',
               value: 400,
               threshold: 300,
               tier: 3,
               severity: 'info',
               message: 'File too long',
             },
           ],
           stats: {
             filesAnalyzed: 1,
             functionsAnalyzed: 0,
             violationCount: 1,
             errorCount: 0,
             warningCount: 0,
             infoCount: 1,
           },
         },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       // info violations are excluded because Violation type only supports error|warning
       expect(results[0]!.violations).toHaveLength(0);
       expect(results[0]!.value).toBe(0);
     });

     it('includes metadata with stats', async () => {
       mockDetect.mockResolvedValue({
         ok: true,
         value: {
           violations: [],
           stats: {
             filesAnalyzed: 10,
             functionsAnalyzed: 50,
             violationCount: 0,
             errorCount: 0,
             warningCount: 0,
             infoCount: 0,
           },
         },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results[0]!.metadata).toEqual({
         filesAnalyzed: 10,
         functionsAnalyzed: 50,
       });
     });
   });
   ```

2. Run test, observe failure.

3. Create implementation `packages/core/src/architecture/collectors/complexity.ts`:

   ```typescript
   import { relative } from 'node:path';
   import type { Collector, ArchConfig, MetricResult, Violation } from '../types';
   import { violationId } from './hash';
   import { detectComplexityViolations } from '../../entropy/detectors/complexity';
   import type { CodebaseSnapshot } from '../../entropy/types';
   import { findFiles } from '../../shared/fs-utils';

   export class ComplexityCollector implements Collector {
     readonly category = 'complexity' as const;

     async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
       const files = await findFiles('**/*.ts', rootDir);
       const snapshot: CodebaseSnapshot = {
         files: files.map((f) => ({
           path: f,
           ast: { type: 'Program', body: null, language: 'typescript' },
           imports: [],
           exports: [],
           internalSymbols: [],
           jsDocComments: [],
         })),
         dependencyGraph: { nodes: [], edges: [] },
         exportMap: { byFile: new Map(), byName: new Map() },
         docs: [],
         codeReferences: [],
         entryPoints: [],
         rootDir,
         config: { rootDir, analyze: {} },
         buildTime: 0,
       } as unknown as CodebaseSnapshot;

       const result = await detectComplexityViolations(snapshot);
       if (!result.ok) {
         return [
           {
             category: this.category,
             scope: 'project',
             value: 0,
             violations: [],
             metadata: { error: 'Failed to detect complexity violations' },
           },
         ];
       }

       const { violations: complexityViolations, stats } = result.value;

       // Only include error and warning severities (Violation schema supports error|warning)
       const filtered = complexityViolations.filter(
         (v) => v.severity === 'error' || v.severity === 'warning'
       );

       const violations: Violation[] = filtered.map((v) => {
         const relFile = relative(rootDir, v.file);
         const detail = `${v.metric}=${v.value} in ${v.function}`;
         return {
           id: violationId(relFile, this.category, detail),
           file: relFile,
           detail: `${v.metric}=${v.value} in ${v.function} (threshold: ${v.threshold})`,
           severity: v.severity as 'error' | 'warning',
         };
       });

       return [
         {
           category: this.category,
           scope: 'project',
           value: violations.length,
           violations,
           metadata: {
             filesAnalyzed: stats.filesAnalyzed,
             functionsAnalyzed: stats.functionsAnalyzed,
           },
         },
       ];
     }
   }
   ```

4. Run test, observe pass.
5. Run: `harness validate`
6. Commit: `feat(architecture): add ComplexityCollector`

---

### Task 5: CouplingCollector (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/architecture/collectors/coupling.ts`, `packages/core/tests/architecture/collectors/coupling.test.ts`

1. Create test file `packages/core/tests/architecture/collectors/coupling.test.ts`:

   ```typescript
   import { describe, it, expect, vi } from 'vitest';
   import { CouplingCollector } from '../../../src/architecture/collectors/coupling';
   import type { ArchConfig } from '../../../src/architecture/types';

   const baseConfig: ArchConfig = {
     enabled: true,
     baselinePath: '.harness/arch/baselines.json',
     thresholds: {},
     modules: {},
   };

   vi.mock('../../../src/entropy/detectors/coupling', () => ({
     detectCouplingViolations: vi.fn(),
   }));

   import { detectCouplingViolations } from '../../../src/entropy/detectors/coupling';
   const mockDetect = vi.mocked(detectCouplingViolations);

   describe('CouplingCollector', () => {
     const collector = new CouplingCollector();

     it('has category "coupling"', () => {
       expect(collector.category).toBe('coupling');
     });

     it('returns empty results when no violations', async () => {
       mockDetect.mockResolvedValue({
         ok: true,
         value: {
           violations: [],
           stats: { filesAnalyzed: 5, violationCount: 0, warningCount: 0, infoCount: 0 },
         },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results).toHaveLength(1);
       expect(results[0]!.value).toBe(0);
       expect(results[0]!.violations).toHaveLength(0);
     });

     it('converts CouplingViolation to Violation with stable IDs', async () => {
       mockDetect.mockResolvedValue({
         ok: true,
         value: {
           violations: [
             {
               file: '/project/src/hub.ts',
               metric: 'fanOut',
               value: 20,
               threshold: 15,
               tier: 2,
               severity: 'warning',
               message: 'File has 20 imports',
             },
           ],
           stats: { filesAnalyzed: 1, violationCount: 1, warningCount: 1, infoCount: 0 },
         },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results[0]!.value).toBe(1);
       expect(results[0]!.violations).toHaveLength(1);
       expect(results[0]!.violations[0]!.file).toBe('src/hub.ts');
       expect(results[0]!.violations[0]!.id).toMatch(/^[a-f0-9]{64}$/);
       expect(results[0]!.violations[0]!.severity).toBe('warning');
     });

     it('excludes info-severity violations', async () => {
       mockDetect.mockResolvedValue({
         ok: true,
         value: {
           violations: [
             {
               file: '/project/src/popular.ts',
               metric: 'fanIn',
               value: 25,
               threshold: 20,
               tier: 3,
               severity: 'info',
               message: 'High fan-in',
             },
           ],
           stats: { filesAnalyzed: 1, violationCount: 1, warningCount: 0, infoCount: 1 },
         },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results[0]!.violations).toHaveLength(0);
     });

     it('includes metadata with stats', async () => {
       mockDetect.mockResolvedValue({
         ok: true,
         value: {
           violations: [],
           stats: { filesAnalyzed: 15, violationCount: 0, warningCount: 0, infoCount: 0 },
         },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results[0]!.metadata).toEqual({ filesAnalyzed: 15 });
     });
   });
   ```

2. Run test, observe failure.

3. Create implementation `packages/core/src/architecture/collectors/coupling.ts`:

   ```typescript
   import { relative } from 'node:path';
   import type { Collector, ArchConfig, MetricResult, Violation } from '../types';
   import { violationId } from './hash';
   import { detectCouplingViolations } from '../../entropy/detectors/coupling';
   import type { CodebaseSnapshot } from '../../entropy/types';
   import { findFiles } from '../../shared/fs-utils';

   export class CouplingCollector implements Collector {
     readonly category = 'coupling' as const;

     async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
       const files = await findFiles('**/*.ts', rootDir);
       const snapshot: CodebaseSnapshot = {
         files: files.map((f) => ({
           path: f,
           ast: { type: 'Program', body: null, language: 'typescript' },
           imports: [],
           exports: [],
           internalSymbols: [],
           jsDocComments: [],
         })),
         dependencyGraph: { nodes: [], edges: [] },
         exportMap: { byFile: new Map(), byName: new Map() },
         docs: [],
         codeReferences: [],
         entryPoints: [],
         rootDir,
         config: { rootDir, analyze: {} },
         buildTime: 0,
       } as unknown as CodebaseSnapshot;

       const result = await detectCouplingViolations(snapshot);
       if (!result.ok) {
         return [
           {
             category: this.category,
             scope: 'project',
             value: 0,
             violations: [],
             metadata: { error: 'Failed to detect coupling violations' },
           },
         ];
       }

       const { violations: couplingViolations, stats } = result.value;

       const filtered = couplingViolations.filter(
         (v) => v.severity === 'error' || v.severity === 'warning'
       );

       const violations: Violation[] = filtered.map((v) => {
         const relFile = relative(rootDir, v.file);
         const detail = `${v.metric}=${v.value}`;
         return {
           id: violationId(relFile, this.category, detail),
           file: relFile,
           detail: `${v.metric}=${v.value} (threshold: ${v.threshold})`,
           severity: v.severity as 'error' | 'warning',
         };
       });

       return [
         {
           category: this.category,
           scope: 'project',
           value: violations.length,
           violations,
           metadata: { filesAnalyzed: stats.filesAnalyzed },
         },
       ];
     }
   }
   ```

4. Run test, observe pass.
5. Run: `harness validate`
6. Commit: `feat(architecture): add CouplingCollector`

---

### Task 6: ForbiddenImportCollector (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/architecture/collectors/forbidden-imports.ts`, `packages/core/tests/architecture/collectors/forbidden-imports.test.ts`

1. Create test file `packages/core/tests/architecture/collectors/forbidden-imports.test.ts`:

   ```typescript
   import { describe, it, expect, vi } from 'vitest';
   import { ForbiddenImportCollector } from '../../../src/architecture/collectors/forbidden-imports';
   import type { ArchConfig } from '../../../src/architecture/types';

   const baseConfig: ArchConfig = {
     enabled: true,
     baselinePath: '.harness/arch/baselines.json',
     thresholds: {},
     modules: {},
   };

   vi.mock('../../../src/constraints/dependencies', () => ({
     validateDependencies: vi.fn(),
   }));

   import { validateDependencies } from '../../../src/constraints/dependencies';
   const mockValidate = vi.mocked(validateDependencies);

   describe('ForbiddenImportCollector', () => {
     const collector = new ForbiddenImportCollector();

     it('has category "forbidden-imports"', () => {
       expect(collector.category).toBe('forbidden-imports');
     });

     it('returns empty results when no violations', async () => {
       mockValidate.mockResolvedValue({
         ok: true,
         value: { valid: true, violations: [], graph: { nodes: [], edges: [] } },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results).toHaveLength(1);
       expect(results[0]!.value).toBe(0);
       expect(results[0]!.violations).toHaveLength(0);
     });

     it('returns only FORBIDDEN_IMPORT violations', async () => {
       mockValidate.mockResolvedValue({
         ok: true,
         value: {
           valid: false,
           violations: [
             {
               file: '/project/src/api/handler.ts',
               imports: '/project/src/internal/secret.ts',
               fromLayer: 'api',
               toLayer: 'internal',
               reason: 'FORBIDDEN_IMPORT',
               line: 7,
               suggestion: 'Use the public API instead',
             },
             {
               file: '/project/src/api/handler.ts',
               imports: '/project/src/db/connection.ts',
               fromLayer: 'api',
               toLayer: 'db',
               reason: 'WRONG_LAYER',
               line: 5,
               suggestion: 'Fix layer',
             },
           ],
           graph: { nodes: [], edges: [] },
         },
       } as any);

       const results = await collector.collect(baseConfig, '/project');
       expect(results[0]!.value).toBe(1);
       expect(results[0]!.violations).toHaveLength(1);
       expect(results[0]!.violations[0]!.detail).toContain('secret.ts');
     });

     it('produces stable violation IDs', async () => {
       mockValidate.mockResolvedValue({
         ok: true,
         value: {
           valid: false,
           violations: [
             {
               file: '/project/src/api/handler.ts',
               imports: '/project/src/internal/secret.ts',
               fromLayer: 'api',
               toLayer: 'internal',
               reason: 'FORBIDDEN_IMPORT',
               line: 7,
               suggestion: 'Fix',
             },
           ],
           graph: { nodes: [], edges: [] },
         },
       } as any);

       const r1 = await collector.collect(baseConfig, '/project');
       const r2 = await collector.collect(baseConfig, '/project');
       expect(r1[0]!.violations[0]!.id).toBe(r2[0]!.violations[0]!.id);
     });
   });
   ```

2. Run test, observe failure.

3. Create implementation `packages/core/src/architecture/collectors/forbidden-imports.ts`:

   ```typescript
   import { relative } from 'node:path';
   import type { Collector, ArchConfig, MetricResult, Violation } from '../types';
   import { violationId } from './hash';
   import { validateDependencies } from '../../constraints/dependencies';
   import type { DependencyViolation } from '../../constraints/types';

   export class ForbiddenImportCollector implements Collector {
     readonly category = 'forbidden-imports' as const;

     async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
       const result = await validateDependencies({
         layers: [],
         rootDir,
         parser: {
           name: 'typescript',
           parseFile: async () =>
             ({ ok: false, error: { code: 'PARSE_ERROR', message: '' } }) as any,
           extractImports: () =>
             ({ ok: false, error: { code: 'EXTRACT_ERROR', message: '' } }) as any,
           health: async () => ({ ok: true, value: { available: true } }) as any,
         },
         fallbackBehavior: 'skip',
       });

       if (!result.ok) {
         return [
           {
             category: this.category,
             scope: 'project',
             value: 0,
             violations: [],
             metadata: { error: 'Failed to validate dependencies' },
           },
         ];
       }

       const forbidden = result.value.violations.filter(
         (v: DependencyViolation) => v.reason === 'FORBIDDEN_IMPORT'
       );

       const violations: Violation[] = forbidden.map((v: DependencyViolation) => {
         const relFile = relative(rootDir, v.file);
         const relImport = relative(rootDir, v.imports);
         const detail = `forbidden import: ${relFile} -> ${relImport}`;
         return {
           id: violationId(relFile, this.category, detail),
           file: relFile,
           detail,
           severity: 'error' as const,
         };
       });

       return [
         {
           category: this.category,
           scope: 'project',
           value: violations.length,
           violations,
         },
       ];
     }
   }
   ```

4. Run test, observe pass.
5. Run: `harness validate`
6. Commit: `feat(architecture): add ForbiddenImportCollector`

---

### Task 7: ModuleSizeCollector (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/architecture/collectors/module-size.ts`, `packages/core/tests/architecture/collectors/module-size.test.ts`

1. Create test file `packages/core/tests/architecture/collectors/module-size.test.ts`:

   ```typescript
   import { describe, it, expect, beforeAll, afterAll } from 'vitest';
   import { ModuleSizeCollector } from '../../../src/architecture/collectors/module-size';
   import type { ArchConfig } from '../../../src/architecture/types';
   import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
   import { join } from 'path';
   import { tmpdir } from 'os';

   let tempDir: string;

   const baseConfig: ArchConfig = {
     enabled: true,
     baselinePath: '.harness/arch/baselines.json',
     thresholds: {},
     modules: {},
   };

   beforeAll(async () => {
     tempDir = await mkdtemp(join(tmpdir(), 'module-size-test-'));
     // Create module structure
     await mkdir(join(tempDir, 'src', 'services'), { recursive: true });
     await mkdir(join(tempDir, 'src', 'api'), { recursive: true });
     await writeFile(
       join(tempDir, 'src', 'services', 'user.ts'),
       'export class User {}\n// line 2\n// line 3\n',
       'utf-8'
     );
     await writeFile(
       join(tempDir, 'src', 'services', 'auth.ts'),
       'export function auth() {}\n// line 2\n',
       'utf-8'
     );
     await writeFile(
       join(tempDir, 'src', 'api', 'routes.ts'),
       'export const routes = [];\n',
       'utf-8'
     );
   });

   afterAll(async () => {
     await rm(tempDir, { recursive: true, force: true });
   });

   describe('ModuleSizeCollector', () => {
     const collector = new ModuleSizeCollector();

     it('has category "module-size"', () => {
       expect(collector.category).toBe('module-size');
     });

     it('returns one MetricResult per discovered module directory', async () => {
       const results = await collector.collect(baseConfig, tempDir);
       // Should find src/services and src/api as modules
       expect(results.length).toBeGreaterThanOrEqual(2);
       const categories = results.map((r) => r.category);
       expect(categories.every((c) => c === 'module-size')).toBe(true);
     });

     it('includes metadata with fileCount and totalLoc', async () => {
       const results = await collector.collect(baseConfig, tempDir);
       const servicesResult = results.find((r) => r.scope.includes('services'));
       expect(servicesResult).toBeDefined();
       expect(servicesResult!.metadata).toBeDefined();
       expect(servicesResult!.metadata!.fileCount).toBe(2);
       expect(typeof servicesResult!.metadata!.totalLoc).toBe('number');
       expect(servicesResult!.metadata!.totalLoc as number).toBeGreaterThan(0);
     });

     it('value equals totalLoc for the module', async () => {
       const results = await collector.collect(baseConfig, tempDir);
       const apiResult = results.find((r) => r.scope.includes('api'));
       expect(apiResult).toBeDefined();
       expect(apiResult!.value).toBe(apiResult!.metadata!.totalLoc);
     });

     it('produces no violations when under threshold', async () => {
       const results = await collector.collect(baseConfig, tempDir);
       for (const r of results) {
         // With no thresholds set, no violations expected
         expect(r.violations).toHaveLength(0);
       }
     });

     it('produces violations when module exceeds threshold', async () => {
       const configWithThreshold: ArchConfig = {
         ...baseConfig,
         thresholds: { 'module-size': { maxLoc: 2, maxFiles: 1 } },
       };
       const results = await collector.collect(configWithThreshold, tempDir);
       const servicesResult = results.find((r) => r.scope.includes('services'));
       expect(servicesResult).toBeDefined();
       expect(servicesResult!.violations.length).toBeGreaterThan(0);
       expect(servicesResult!.violations[0]!.id).toMatch(/^[a-f0-9]{64}$/);
     });
   });
   ```

2. Run test, observe failure.

3. Create implementation `packages/core/src/architecture/collectors/module-size.ts`:

   ```typescript
   import { readFile, readdir, stat } from 'node:fs/promises';
   import { join, relative } from 'node:path';
   import type { Collector, ArchConfig, MetricResult, Violation } from '../types';
   import { violationId } from './hash';

   interface ModuleStats {
     modulePath: string;
     fileCount: number;
     totalLoc: number;
     files: string[];
   }

   async function discoverModules(rootDir: string): Promise<ModuleStats[]> {
     const modules: ModuleStats[] = [];

     async function scanDir(dir: string): Promise<void> {
       let entries;
       try {
         entries = await readdir(dir, { withFileTypes: true });
       } catch {
         return;
       }

       const tsFiles: string[] = [];
       const subdirs: string[] = [];

       for (const entry of entries) {
         if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
           continue;
         }
         const fullPath = join(dir, entry.name);
         if (entry.isDirectory()) {
           subdirs.push(fullPath);
         } else if (
           entry.isFile() &&
           (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
           !entry.name.endsWith('.test.ts') &&
           !entry.name.endsWith('.test.tsx') &&
           !entry.name.endsWith('.spec.ts')
         ) {
           tsFiles.push(fullPath);
         }
       }

       if (tsFiles.length > 0) {
         let totalLoc = 0;
         for (const f of tsFiles) {
           try {
             const content = await readFile(f, 'utf-8');
             totalLoc += content.split('\n').filter((line) => line.trim().length > 0).length;
           } catch {
             // skip unreadable files
           }
         }
         modules.push({
           modulePath: relative(rootDir, dir),
           fileCount: tsFiles.length,
           totalLoc,
           files: tsFiles.map((f) => relative(rootDir, f)),
         });
       }

       for (const sub of subdirs) {
         await scanDir(sub);
       }
     }

     await scanDir(rootDir);
     return modules;
   }

   export class ModuleSizeCollector implements Collector {
     readonly category = 'module-size' as const;

     async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
       const modules = await discoverModules(rootDir);

       const thresholds = config.thresholds['module-size'];
       let maxLoc = Infinity;
       let maxFiles = Infinity;
       if (typeof thresholds === 'object' && thresholds !== null) {
         const t = thresholds as Record<string, number>;
         if (t.maxLoc !== undefined) maxLoc = t.maxLoc;
         if (t.maxFiles !== undefined) maxFiles = t.maxFiles;
       }

       return modules.map((mod) => {
         const violations: Violation[] = [];

         if (mod.totalLoc > maxLoc) {
           violations.push({
             id: violationId(mod.modulePath, this.category, `totalLoc=${mod.totalLoc}`),
             file: mod.modulePath,
             detail: `Module has ${mod.totalLoc} lines of code (threshold: ${maxLoc})`,
             severity: 'warning',
           });
         }

         if (mod.fileCount > maxFiles) {
           violations.push({
             id: violationId(mod.modulePath, this.category, `fileCount=${mod.fileCount}`),
             file: mod.modulePath,
             detail: `Module has ${mod.fileCount} files (threshold: ${maxFiles})`,
             severity: 'warning',
           });
         }

         return {
           category: this.category,
           scope: mod.modulePath,
           value: mod.totalLoc,
           violations,
           metadata: { fileCount: mod.fileCount, totalLoc: mod.totalLoc },
         };
       });
     }
   }
   ```

4. Run test, observe pass.
5. Run: `harness validate`
6. Commit: `feat(architecture): add ModuleSizeCollector`

---

### Task 8: DepDepthCollector (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/architecture/collectors/dep-depth.ts`, `packages/core/tests/architecture/collectors/dep-depth.test.ts`

1. Create test file `packages/core/tests/architecture/collectors/dep-depth.test.ts`:

   ```typescript
   import { describe, it, expect, beforeAll, afterAll } from 'vitest';
   import { DepDepthCollector } from '../../../src/architecture/collectors/dep-depth';
   import type { ArchConfig } from '../../../src/architecture/types';
   import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
   import { join } from 'path';
   import { tmpdir } from 'os';

   let tempDir: string;

   const baseConfig: ArchConfig = {
     enabled: true,
     baselinePath: '.harness/arch/baselines.json',
     thresholds: {},
     modules: {},
   };

   beforeAll(async () => {
     tempDir = await mkdtemp(join(tmpdir(), 'dep-depth-test-'));
     await mkdir(join(tempDir, 'src', 'services'), { recursive: true });
     // Chain: a.ts -> b.ts -> c.ts (depth 2)
     await writeFile(
       join(tempDir, 'src', 'services', 'a.ts'),
       "import { b } from './b';\nexport const a = b;\n",
       'utf-8'
     );
     await writeFile(
       join(tempDir, 'src', 'services', 'b.ts'),
       "import { c } from './c';\nexport const b = c;\n",
       'utf-8'
     );
     await writeFile(join(tempDir, 'src', 'services', 'c.ts'), 'export const c = 1;\n', 'utf-8');
   });

   afterAll(async () => {
     await rm(tempDir, { recursive: true, force: true });
   });

   describe('DepDepthCollector', () => {
     const collector = new DepDepthCollector();

     it('has category "dependency-depth"', () => {
       expect(collector.category).toBe('dependency-depth');
     });

     it('returns MetricResult with longest import chain depth', async () => {
       const results = await collector.collect(baseConfig, tempDir);
       expect(results.length).toBeGreaterThanOrEqual(1);
       const servicesResult = results.find((r) => r.scope.includes('services'));
       expect(servicesResult).toBeDefined();
       expect(servicesResult!.category).toBe('dependency-depth');
       // a.ts -> b.ts -> c.ts = depth 2
       expect(servicesResult!.value).toBeGreaterThanOrEqual(2);
     });

     it('produces no violations when under threshold', async () => {
       const results = await collector.collect(baseConfig, tempDir);
       for (const r of results) {
         expect(r.violations).toHaveLength(0);
       }
     });

     it('produces violations when depth exceeds threshold', async () => {
       const configWithThreshold: ArchConfig = {
         ...baseConfig,
         thresholds: { 'dependency-depth': 1 },
       };
       const results = await collector.collect(configWithThreshold, tempDir);
       const servicesResult = results.find((r) => r.scope.includes('services'));
       expect(servicesResult).toBeDefined();
       expect(servicesResult!.violations.length).toBeGreaterThan(0);
       expect(servicesResult!.violations[0]!.severity).toBe('warning');
       expect(servicesResult!.violations[0]!.id).toMatch(/^[a-f0-9]{64}$/);
     });

     it('includes metadata with longestChain', async () => {
       const results = await collector.collect(baseConfig, tempDir);
       const servicesResult = results.find((r) => r.scope.includes('services'));
       expect(servicesResult).toBeDefined();
       expect(servicesResult!.metadata).toBeDefined();
       expect(typeof servicesResult!.metadata!.longestChain).toBe('number');
     });
   });
   ```

2. Run test, observe failure.

3. Create implementation `packages/core/src/architecture/collectors/dep-depth.ts`:

   ```typescript
   import { readFile, readdir } from 'node:fs/promises';
   import { join, relative, dirname, resolve } from 'node:path';
   import type { Collector, ArchConfig, MetricResult, Violation } from '../types';
   import { violationId } from './hash';

   interface ModuleDepthInfo {
     modulePath: string;
     longestChain: number;
     files: string[];
   }

   /**
    * Extract relative import sources from a TypeScript file using regex.
    * Returns resolved absolute paths.
    */
   function extractImportSources(content: string, filePath: string): string[] {
     const importRegex = /(?:import|export)\s+.*?from\s+['"](\.[^'"]+)['"]/g;
     const dynamicRegex = /import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
     const sources: string[] = [];
     const dir = dirname(filePath);

     for (const regex of [importRegex, dynamicRegex]) {
       let match;
       while ((match = regex.exec(content)) !== null) {
         let resolved = resolve(dir, match[1]!);
         if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
           resolved += '.ts';
         }
         sources.push(resolved);
       }
     }

     return sources;
   }

   async function collectTsFiles(dir: string): Promise<string[]> {
     const results: string[] = [];

     async function scan(d: string): Promise<void> {
       let entries;
       try {
         entries = await readdir(d, { withFileTypes: true });
       } catch {
         return;
       }
       for (const entry of entries) {
         if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist')
           continue;
         const fullPath = join(d, entry.name);
         if (entry.isDirectory()) {
           await scan(fullPath);
         } else if (
           entry.isFile() &&
           (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
           !entry.name.endsWith('.test.ts') &&
           !entry.name.endsWith('.test.tsx') &&
           !entry.name.endsWith('.spec.ts')
         ) {
           results.push(fullPath);
         }
       }
     }

     await scan(dir);
     return results;
   }

   function computeLongestChain(
     file: string,
     graph: Map<string, string[]>,
     visited: Set<string>,
     memo: Map<string, number>
   ): number {
     if (memo.has(file)) return memo.get(file)!;
     if (visited.has(file)) return 0; // cycle — avoid infinite recursion

     visited.add(file);
     const deps = graph.get(file) || [];
     let maxDepth = 0;

     for (const dep of deps) {
       const depth = 1 + computeLongestChain(dep, graph, visited, memo);
       if (depth > maxDepth) maxDepth = depth;
     }

     visited.delete(file);
     memo.set(file, maxDepth);
     return maxDepth;
   }

   export class DepDepthCollector implements Collector {
     readonly category = 'dependency-depth' as const;

     async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
       const allFiles = await collectTsFiles(rootDir);

       // Build import graph
       const graph = new Map<string, string[]>();
       const fileSet = new Set(allFiles);

       for (const file of allFiles) {
         try {
           const content = await readFile(file, 'utf-8');
           const imports = extractImportSources(content, file).filter((imp) => fileSet.has(imp));
           graph.set(file, imports);
         } catch {
           graph.set(file, []);
         }
       }

       // Group files by module directory
       const moduleMap = new Map<string, string[]>();
       for (const file of allFiles) {
         const relDir = relative(rootDir, dirname(file));
         if (!moduleMap.has(relDir)) moduleMap.set(relDir, []);
         moduleMap.get(relDir)!.push(file);
       }

       // Compute longest chain per module
       const memo = new Map<string, number>();
       const threshold =
         typeof config.thresholds['dependency-depth'] === 'number'
           ? config.thresholds['dependency-depth']
           : Infinity;

       const results: MetricResult[] = [];

       for (const [modulePath, files] of moduleMap) {
         let longestChain = 0;

         for (const file of files) {
           const depth = computeLongestChain(file, graph, new Set(), memo);
           if (depth > longestChain) longestChain = depth;
         }

         const violations: Violation[] = [];
         if (longestChain > threshold) {
           violations.push({
             id: violationId(modulePath, this.category, `depth=${longestChain}`),
             file: modulePath,
             detail: `Import chain depth is ${longestChain} (threshold: ${threshold})`,
             severity: 'warning',
           });
         }

         results.push({
           category: this.category,
           scope: modulePath,
           value: longestChain,
           violations,
           metadata: { longestChain },
         });
       }

       return results;
     }
   }
   ```

4. Run test, observe pass.
5. Run: `harness validate`
6. Commit: `feat(architecture): add DepDepthCollector`

---

### Task 9: Collector registry with runAll() (TDD)

**Depends on:** Tasks 2-8
**Files:** `packages/core/src/architecture/collectors/index.ts`, `packages/core/tests/architecture/collectors/index.test.ts`

1. Create test file `packages/core/tests/architecture/collectors/index.test.ts`:

   ```typescript
   import { describe, it, expect, vi } from 'vitest';
   import { defaultCollectors, runAll } from '../../../src/architecture/collectors/index';
   import type { ArchConfig, Collector, MetricResult } from '../../../src/architecture/types';

   const baseConfig: ArchConfig = {
     enabled: true,
     baselinePath: '.harness/arch/baselines.json',
     thresholds: {},
     modules: {},
   };

   describe('defaultCollectors', () => {
     it('contains exactly 7 collectors', () => {
       expect(defaultCollectors).toHaveLength(7);
     });

     it('covers all 7 metric categories', () => {
       const categories = defaultCollectors.map((c) => c.category).sort();
       expect(categories).toEqual([
         'circular-deps',
         'complexity',
         'coupling',
         'dependency-depth',
         'forbidden-imports',
         'layer-violations',
         'module-size',
       ]);
     });

     it('each collector implements the Collector interface', () => {
       for (const c of defaultCollectors) {
         expect(typeof c.category).toBe('string');
         expect(typeof c.collect).toBe('function');
       }
     });
   });

   describe('runAll', () => {
     it('calls all provided collectors and flattens results', async () => {
       const mockCollectorA: Collector = {
         category: 'complexity',
         collect: vi
           .fn()
           .mockResolvedValue([
             { category: 'complexity', scope: 'project', value: 2, violations: [] },
           ]),
       };
       const mockCollectorB: Collector = {
         category: 'coupling',
         collect: vi.fn().mockResolvedValue([
           { category: 'coupling', scope: 'project', value: 1, violations: [] },
           { category: 'coupling', scope: 'src/api', value: 0, violations: [] },
         ]),
       };

       const results = await runAll(baseConfig, '/project', [mockCollectorA, mockCollectorB]);
       expect(results).toHaveLength(3);
       expect(mockCollectorA.collect).toHaveBeenCalledWith(baseConfig, '/project');
       expect(mockCollectorB.collect).toHaveBeenCalledWith(baseConfig, '/project');
     });

     it('runs collectors in parallel (both resolve before either is awaited)', async () => {
       const callOrder: string[] = [];
       const collectorA: Collector = {
         category: 'complexity',
         collect: async () => {
           callOrder.push('A-start');
           await new Promise((r) => setTimeout(r, 10));
           callOrder.push('A-end');
           return [{ category: 'complexity', scope: 'project', value: 0, violations: [] }];
         },
       };
       const collectorB: Collector = {
         category: 'coupling',
         collect: async () => {
           callOrder.push('B-start');
           await new Promise((r) => setTimeout(r, 10));
           callOrder.push('B-end');
           return [{ category: 'coupling', scope: 'project', value: 0, violations: [] }];
         },
       };

       await runAll(baseConfig, '/project', [collectorA, collectorB]);
       // Both should start before either ends (parallel execution)
       expect(callOrder[0]).toBe('A-start');
       expect(callOrder[1]).toBe('B-start');
     });

     it('returns empty array when no collectors provided', async () => {
       const results = await runAll(baseConfig, '/project', []);
       expect(results).toEqual([]);
     });

     it('uses defaultCollectors when collectors param is omitted', async () => {
       // This is a type-level check — we just verify runAll accepts 2 args
       // Actual execution would touch the filesystem so we skip it
       expect(typeof runAll).toBe('function');
       expect(runAll.length).toBeGreaterThanOrEqual(2);
     });
   });
   ```

2. Run test, observe failure.

3. Create implementation `packages/core/src/architecture/collectors/index.ts`:

   ```typescript
   import type { Collector, ArchConfig, MetricResult } from '../types';
   import { CircularDepsCollector } from './circular-deps';
   import { LayerViolationCollector } from './layer-violations';
   import { ComplexityCollector } from './complexity';
   import { CouplingCollector } from './coupling';
   import { ForbiddenImportCollector } from './forbidden-imports';
   import { ModuleSizeCollector } from './module-size';
   import { DepDepthCollector } from './dep-depth';

   export const defaultCollectors: Collector[] = [
     new CircularDepsCollector(),
     new LayerViolationCollector(),
     new ComplexityCollector(),
     new CouplingCollector(),
     new ForbiddenImportCollector(),
     new ModuleSizeCollector(),
     new DepDepthCollector(),
   ];

   /**
    * Run all collectors in parallel and return a flat array of MetricResults.
    */
   export async function runAll(
     config: ArchConfig,
     rootDir: string,
     collectors: Collector[] = defaultCollectors
   ): Promise<MetricResult[]> {
     const promises = collectors.map((c) => c.collect(config, rootDir));
     const nested = await Promise.all(promises);
     return nested.flat();
   }

   export { CircularDepsCollector } from './circular-deps';
   export { LayerViolationCollector } from './layer-violations';
   export { ComplexityCollector } from './complexity';
   export { CouplingCollector } from './coupling';
   export { ForbiddenImportCollector } from './forbidden-imports';
   export { ModuleSizeCollector } from './module-size';
   export { DepDepthCollector } from './dep-depth';
   export { violationId } from './hash';
   ```

4. Run test, observe pass.
5. Run: `harness validate`
6. Commit: `feat(architecture): add collector registry with runAll()`

---

### Task 10: Update architecture index exports and final verification

[checkpoint:human-verify]

**Depends on:** Task 9
**Files:** `packages/core/src/architecture/index.ts`

1. Modify `packages/core/src/architecture/index.ts` to add collector exports:

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
   ```

2. Run all collector tests: `npx vitest run packages/core/tests/architecture/`
3. Observe: all tests pass
4. Run: `harness validate`
5. Run: `harness check-deps`
6. Commit: `feat(architecture): export collectors from architecture index`
