# Plan: Core ConflictPredictor Class

**Date:** 2026-03-23
**Spec:** docs/changes/conflict-prediction/proposal.md
**Estimated tasks:** 3
**Estimated time:** 12 minutes

## Goal

Implement the `ConflictPredictor` class with severity classification, reasoning generation, and union-find regrouping in `packages/graph/src/independence/ConflictPredictor.ts`.

## Observable Truths (Acceptance Criteria)

1. File `packages/graph/src/independence/ConflictPredictor.ts` exists and exports `ConflictPredictor` class, `ConflictSeverity` type, `ConflictDetail` interface, and `ConflictPrediction` interface.
2. The file compiles without TypeScript errors (`npx tsc --noEmit` in packages/graph passes).
3. The class composes `TaskIndependenceAnalyzer` internally (constructor creates an instance).
4. `predict()` accepts `IndependenceCheckParams` and returns `ConflictPrediction` matching the spec types exactly.
5. Severity classification follows spec rules: direct overlap = high, transitive + high churn/coupling = medium, transitive-only = low.
6. Without a graph store, direct overlaps are high, transitive overlaps are low, and verdict notes degradation.
7. Union-find groups only merge on high-severity edges; medium and low do not cause regrouping.
8. Every `ConflictDetail` has non-empty `reason` and `mitigation` strings generated from templates.
9. `summary.regrouped` is true when revised groups differ from the analyzer's original groups.

## File Map

- CREATE `packages/graph/src/independence/ConflictPredictor.ts`

## Tasks

### Task 1: Define exported types

**Depends on:** none
**Files:** `packages/graph/src/independence/ConflictPredictor.ts`

1. Create `packages/graph/src/independence/ConflictPredictor.ts` with the type definitions and an empty class shell:

   ```typescript
   import type { GraphStore } from '../store/GraphStore.js';
   import type { IndependenceCheckParams, OverlapDetail } from './TaskIndependenceAnalyzer.js';
   import { TaskIndependenceAnalyzer } from './TaskIndependenceAnalyzer.js';
   import { GraphComplexityAdapter } from '../entropy/GraphComplexityAdapter.js';
   import { GraphCouplingAdapter } from '../entropy/GraphCouplingAdapter.js';

   // --- Public types ---

   export type ConflictSeverity = 'high' | 'medium' | 'low';

   export interface ConflictDetail {
     readonly taskA: string;
     readonly taskB: string;
     readonly severity: ConflictSeverity;
     readonly reason: string;
     readonly mitigation: string;
     readonly overlaps: readonly OverlapDetail[];
   }

   export interface ConflictPrediction {
     readonly tasks: readonly string[];
     readonly analysisLevel: 'graph-expanded' | 'file-only';
     readonly depth: number;
     readonly conflicts: readonly ConflictDetail[];
     readonly groups: readonly (readonly string[])[];
     readonly summary: {
       readonly high: number;
       readonly medium: number;
       readonly low: number;
       readonly regrouped: boolean;
     };
     readonly verdict: string;
   }

   // --- ConflictPredictor ---

   export class ConflictPredictor {
     private readonly store: GraphStore | undefined;

     constructor(store?: GraphStore) {
       this.store = store;
     }

     predict(_params: IndependenceCheckParams): ConflictPrediction {
       throw new Error('Not yet implemented');
     }
   }
   ```

2. Run: `cd packages/graph && npx tsc --noEmit`
3. Observe: compiles without errors (the unused imports for adapters will be used in Task 2; `noUnusedLocals` may require temporarily marking them -- if so, add `// @ts-expect-error -- used in Task 2` or use them in the stub). **Note:** If `noUnusedLocals` triggers, move the adapter imports into Task 2 and only keep the types and class shell here.
4. Run: `npx harness validate`
5. Commit: `feat(conflict-prediction): define ConflictPredictor types and class shell`

### Task 2: Implement predict() with severity classification

**Depends on:** Task 1
**Files:** `packages/graph/src/independence/ConflictPredictor.ts`

1. Replace the stub `predict()` method and add all private helpers. The complete implementation of the class body (replacing everything from `export class ConflictPredictor` to the end of file):

   ```typescript
   export class ConflictPredictor {
     private readonly store: GraphStore | undefined;

     constructor(store?: GraphStore) {
       this.store = store;
     }

     predict(params: IndependenceCheckParams): ConflictPrediction {
       // 1. Run base analyzer
       const analyzer = new TaskIndependenceAnalyzer(this.store);
       const result = analyzer.analyze(params);

       // 2. Build churn and coupling lookup maps (only with graph)
       const churnMap = new Map<string, number>();
       const couplingMap = new Map<string, number>();
       let churnThreshold = Infinity;
       let couplingThreshold = Infinity;

       if (this.store != null) {
         const complexityResult = new GraphComplexityAdapter(
           this.store
         ).computeComplexityHotspots();
         for (const hotspot of complexityResult.hotspots) {
           const existing = churnMap.get(hotspot.file);
           if (existing === undefined || hotspot.changeFrequency > existing) {
             churnMap.set(hotspot.file, hotspot.changeFrequency);
           }
         }

         const couplingResult = new GraphCouplingAdapter(this.store).computeCouplingData();
         for (const fileData of couplingResult.files) {
           couplingMap.set(fileData.file, fileData.fanIn + fileData.fanOut);
         }

         // Compute 80th percentile thresholds
         churnThreshold = this.computePercentile(Array.from(churnMap.values()), 80);
         couplingThreshold = this.computePercentile(Array.from(couplingMap.values()), 80);
       }

       // 3. Classify each conflicting pair
       const conflicts: ConflictDetail[] = [];

       for (const pair of result.pairs) {
         if (pair.independent) continue;

         const { severity, reason, mitigation } = this.classifyPair(
           pair.taskA,
           pair.taskB,
           pair.overlaps,
           churnMap,
           couplingMap,
           churnThreshold,
           couplingThreshold
         );

         conflicts.push({
           taskA: pair.taskA,
           taskB: pair.taskB,
           severity,
           reason,
           mitigation,
           overlaps: pair.overlaps,
         });
       }

       // 4. Build revised groups (high-severity edges only)
       const taskIds = result.tasks;
       const groups = this.buildHighSeverityGroups(taskIds, conflicts);

       // 5. Compare groups to detect regrouping
       const regrouped = !this.groupsEqual(result.groups, groups);

       // 6. Build summary
       let highCount = 0;
       let mediumCount = 0;
       let lowCount = 0;
       for (const c of conflicts) {
         if (c.severity === 'high') highCount++;
         else if (c.severity === 'medium') mediumCount++;
         else lowCount++;
       }

       // 7. Generate verdict
       const verdict = this.generateVerdict(
         taskIds,
         groups,
         result.analysisLevel,
         highCount,
         mediumCount,
         lowCount,
         regrouped
       );

       return {
         tasks: taskIds,
         analysisLevel: result.analysisLevel,
         depth: result.depth,
         conflicts,
         groups,
         summary: {
           high: highCount,
           medium: mediumCount,
           low: lowCount,
           regrouped,
         },
         verdict,
       };
     }

     // --- Private helpers ---

     private classifyPair(
       taskA: string,
       taskB: string,
       overlaps: readonly OverlapDetail[],
       churnMap: Map<string, number>,
       couplingMap: Map<string, number>,
       churnThreshold: number,
       couplingThreshold: number
     ): { severity: ConflictSeverity; reason: string; mitigation: string } {
       let maxSeverity: ConflictSeverity = 'low';
       let primaryReason = '';
       let primaryMitigation = '';

       for (const overlap of overlaps) {
         let overlapSeverity: ConflictSeverity;
         let reason: string;
         let mitigation: string;

         if (overlap.type === 'direct') {
           overlapSeverity = 'high';
           reason = `Both tasks write to ${overlap.file}`;
           mitigation = `Serialize: run ${taskA} before ${taskB}`;
         } else {
           // Transitive overlap -- check churn and coupling
           const churn = churnMap.get(overlap.file);
           const coupling = couplingMap.get(overlap.file);
           const via = overlap.via ?? 'unknown';

           if (churn !== undefined && churn >= churnThreshold && churnThreshold !== Infinity) {
             overlapSeverity = 'medium';
             reason = `Transitive overlap on high-churn file ${overlap.file} (via ${via})`;
             mitigation = `Review: ${overlap.file} changes frequently — coordinate edits between ${taskA} and ${taskB}`;
           } else if (
             coupling !== undefined &&
             coupling >= couplingThreshold &&
             couplingThreshold !== Infinity
           ) {
             overlapSeverity = 'medium';
             reason = `Transitive overlap on highly-coupled file ${overlap.file} (via ${via})`;
             mitigation = `Review: ${overlap.file} has high coupling — coordinate edits between ${taskA} and ${taskB}`;
           } else {
             overlapSeverity = 'low';
             reason = `Transitive overlap on ${overlap.file} (via ${via}) — low risk`;
             mitigation = `Info: transitive overlap unlikely to cause conflicts`;
           }
         }

         if (this.severityRank(overlapSeverity) > this.severityRank(maxSeverity)) {
           maxSeverity = overlapSeverity;
           primaryReason = reason;
           primaryMitigation = mitigation;
         } else if (primaryReason === '') {
           primaryReason = reason;
           primaryMitigation = mitigation;
         }
       }

       return { severity: maxSeverity, reason: primaryReason, mitigation: primaryMitigation };
     }

     private severityRank(severity: ConflictSeverity): number {
       switch (severity) {
         case 'high':
           return 3;
         case 'medium':
           return 2;
         case 'low':
           return 1;
       }
     }

     private computePercentile(values: number[], percentile: number): number {
       if (values.length === 0) return Infinity;
       const sorted = [...values].sort((a, b) => a - b);
       const index = Math.ceil((percentile / 100) * sorted.length) - 1;
       return sorted[Math.min(index, sorted.length - 1)]!;
     }

     private buildHighSeverityGroups(
       taskIds: readonly string[],
       conflicts: readonly ConflictDetail[]
     ): readonly (readonly string[])[] {
       // Union-find: only merge on high-severity edges
       const parent = new Map<string, string>();
       const rank = new Map<string, number>();

       for (const id of taskIds) {
         parent.set(id, id);
         rank.set(id, 0);
       }

       const find = (x: string): string => {
         let root = x;
         while (parent.get(root) !== root) {
           root = parent.get(root)!;
         }
         // Path compression
         let current = x;
         while (current !== root) {
           const next = parent.get(current)!;
           parent.set(current, root);
           current = next;
         }
         return root;
       };

       const union = (a: string, b: string): void => {
         const rootA = find(a);
         const rootB = find(b);
         if (rootA === rootB) return;
         const rankA = rank.get(rootA)!;
         const rankB = rank.get(rootB)!;
         if (rankA < rankB) {
           parent.set(rootA, rootB);
         } else if (rankA > rankB) {
           parent.set(rootB, rootA);
         } else {
           parent.set(rootB, rootA);
           rank.set(rootA, rankA + 1);
         }
       };

       // Only union high-severity conflicts
       for (const conflict of conflicts) {
         if (conflict.severity === 'high') {
           union(conflict.taskA, conflict.taskB);
         }
       }

       // Collect groups
       const groupMap = new Map<string, string[]>();
       for (const id of taskIds) {
         const root = find(id);
         let group = groupMap.get(root);
         if (group === undefined) {
           group = [];
           groupMap.set(root, group);
         }
         group.push(id);
       }

       return Array.from(groupMap.values());
     }

     private groupsEqual(
       a: readonly (readonly string[])[],
       b: readonly (readonly string[])[]
     ): boolean {
       if (a.length !== b.length) return false;

       // Normalize: sort each group, then sort groups by first element
       const normalize = (groups: readonly (readonly string[])[]): string[][] =>
         groups
           .map((g) => [...g].sort())
           .sort((x, y) => {
             const xFirst = x[0]!;
             const yFirst = y[0]!;
             return xFirst.localeCompare(yFirst);
           });

       const normA = normalize(a);
       const normB = normalize(b);

       for (let i = 0; i < normA.length; i++) {
         const groupA = normA[i]!;
         const groupB = normB[i]!;
         if (groupA.length !== groupB.length) return false;
         for (let j = 0; j < groupA.length; j++) {
           if (groupA[j] !== groupB[j]) return false;
         }
       }

       return true;
     }

     private generateVerdict(
       taskIds: readonly string[],
       groups: readonly (readonly string[])[],
       analysisLevel: 'graph-expanded' | 'file-only',
       highCount: number,
       mediumCount: number,
       lowCount: number,
       regrouped: boolean
     ): string {
       const total = taskIds.length;
       const groupCount = groups.length;
       const parts: string[] = [];

       // Conflict summary
       const conflictParts: string[] = [];
       if (highCount > 0) conflictParts.push(`${highCount} high`);
       if (mediumCount > 0) conflictParts.push(`${mediumCount} medium`);
       if (lowCount > 0) conflictParts.push(`${lowCount} low`);

       if (conflictParts.length === 0) {
         parts.push(`${total} tasks have no conflicts — can all run in parallel.`);
       } else {
         parts.push(`${total} tasks have ${conflictParts.join(', ')} severity conflicts.`);
       }

       // Group summary
       if (groupCount === 1) {
         parts.push(`All tasks must run serially.`);
       } else if (groupCount === total) {
         parts.push(`${groupCount} parallel groups (all independent).`);
       } else {
         parts.push(`${groupCount} parallel groups possible.`);
       }

       // Regrouping note
       if (regrouped) {
         parts.push(`Tasks were regrouped due to high-severity conflicts.`);
       }

       // Degradation note
       if (analysisLevel === 'file-only') {
         parts.push(`Graph unavailable — severity based on file overlaps only.`);
       }

       return parts.join(' ');
     }
   }
   ```

2. Run: `cd packages/graph && npx tsc --noEmit`
3. Observe: compiles without errors.
4. Run: `npx harness validate`
5. Commit: `feat(conflict-prediction): implement predict() with severity classification and regrouping`

### Task 3: Verify compilation and fix any strictness issues

**Depends on:** Task 2
**Files:** `packages/graph/src/independence/ConflictPredictor.ts`

[checkpoint:human-verify] -- Review the complete implementation before proceeding to tests phase.

1. Run: `cd packages/graph && npx tsc --noEmit 2>&1`
2. If there are `noUncheckedIndexedAccess` errors on array indexing, add `!` non-null assertions to the specific lines (per project learning).
3. If there are `noUnusedLocals` or `noUnusedParameters` errors, fix by using the parameters or removing the unused ones.
4. If there are `exactOptionalPropertyTypes` errors, ensure optional properties use `| undefined` in their type annotations where needed.
5. Run: `cd packages/graph && npx tsc --noEmit 2>&1`
6. Observe: zero errors.
7. Run: `npx harness validate`
8. If fixes were needed, commit: `fix(conflict-prediction): resolve TypeScript strictness issues`
9. If no fixes needed, skip commit -- Task 2 already captured the implementation.

## Traceability

| Observable Truth                      | Delivered by                                    |
| ------------------------------------- | ----------------------------------------------- |
| 1. File exists with exports           | Task 1                                          |
| 2. Compiles without TS errors         | Task 2, Task 3                                  |
| 3. Composes TaskIndependenceAnalyzer  | Task 2 (constructor + predict)                  |
| 4. predict() signature matches spec   | Task 1 (types), Task 2 (implementation)         |
| 5. Severity classification rules      | Task 2 (classifyPair)                           |
| 6. Graceful degradation without graph | Task 2 (Infinity thresholds, file-only verdict) |
| 7. Union-find on high-severity only   | Task 2 (buildHighSeverityGroups)                |
| 8. Non-empty reason and mitigation    | Task 2 (classifyPair templates)                 |
| 9. summary.regrouped detection        | Task 2 (groupsEqual comparison)                 |
