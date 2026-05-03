# Plan: Graph Constraint Migration (Phase 6 of 10)

**Date:** 2026-03-18
**Spec:** .harness/architecture/graph-context-system/ADR-001.md
**Estimated tasks:** 8
**Estimated time:** 40-60 minutes

## Goal

Replace file-system-based constraint checking in `packages/core/src/constraints/` with graph-driven alternatives. Dependency graph construction becomes a graph edge query. Layer violation detection uses graph `imports` edges. Circular dependency detection uses graph adjacency. The constraint functions gain optional graph-enhanced modes while maintaining full backward compatibility.

## Observable Truths (Acceptance Criteria)

1. When `buildDependencyGraph()` is called with `graphDependencyData`, the system shall use pre-computed graph data instead of parsing files with a LanguageParser.
2. When `validateDependencies()` is called with `graphDependencyData`, the system shall check layer violations using graph-derived edges instead of rebuilding the dependency graph from scratch.
3. When `detectCircularDeps()` is called with a graph-derived `DependencyGraph`, the system shall detect cycles using the same Tarjan algorithm on graph edges.
4. When `detectCircularDepsInFiles()` is called with `graphDependencyData`, the system shall skip file parsing and use the pre-computed graph.
5. When no graph data is provided, all functions shall fall back to existing implementations (backward compatibility).
6. When `GraphConstraintAdapter.computeDependencyGraph()` is called, the system shall extract file nodes and `imports` edges from the GraphStore and return a `DependencyGraph`.
7. When `GraphConstraintAdapter.computeLayerViolations()` is called with layer definitions, the system shall use graph edges to detect violations.
8. `pnpm test --filter @harness-engineering/core` passes with all new tests.
9. `pnpm test --filter @harness-engineering/graph` passes with all new tests.
10. `pnpm build` succeeds.

## [MODIFIED] Changes to Existing Behavior

- [ADDED] `GraphConstraintAdapter` in packages/graph — bridges graph queries to constraint-compatible formats
- [MODIFIED] `buildDependencyGraph` gains optional `graphDependencyData` parameter with pre-computed graph data
- [MODIFIED] `validateDependencies` gains optional `graphDependencyData` in `LayerConfig`
- [MODIFIED] `detectCircularDepsInFiles` gains optional `graphDependencyData` parameter to skip file parsing

## File Map

```
CREATE packages/graph/src/constraints/GraphConstraintAdapter.ts
CREATE packages/graph/tests/constraints/GraphConstraintAdapter.test.ts
MODIFY packages/core/src/constraints/dependencies.ts (add graph data path)
MODIFY packages/core/src/constraints/circular-deps.ts (add graph data path)
MODIFY packages/core/src/constraints/types.ts (add GraphDependencyData type)
CREATE packages/core/tests/constraints/graph-integration.test.ts
MODIFY packages/graph/src/index.ts (export GraphConstraintAdapter)
```

## Tasks

### Task 1: Implement GraphConstraintAdapter (TDD)

**Depends on:** none
**Files:** packages/graph/src/constraints/GraphConstraintAdapter.ts, packages/graph/tests/constraints/GraphConstraintAdapter.test.ts

1. Create adapter that bridges graph queries to constraint-compatible formats:

   ```typescript
   export interface GraphDependencyData {
     readonly nodes: readonly string[];
     readonly edges: ReadonlyArray<{
       from: string;
       to: string;
       importType: 'static' | 'dynamic' | 'type-only';
       line: number;
     }>;
   }

   export interface GraphLayerViolation {
     file: string;
     imports: string;
     fromLayer: string;
     toLayer: string;
     line: number;
   }

   export class GraphConstraintAdapter {
     constructor(private readonly store: GraphStore) {}

     computeDependencyGraph(): GraphDependencyData;
     computeLayerViolations(
       layers: Array<{ name: string; patterns: string[]; allowedDependencies: string[] }>,
       rootDir: string
     ): GraphLayerViolation[];
   }
   ```

   **computeDependencyGraph()**:
   - Find all `file` nodes in the graph
   - Find all `imports` edges
   - Convert file node `path` fields to absolute paths (nodes list)
   - Convert `imports` edges to `{ from, to, importType, line }` — importType defaults to `'static'`, line from edge metadata or 0
   - Return: `GraphDependencyData` compatible with `DependencyGraph`

   **computeLayerViolations()**:
   - Get dependency graph from `computeDependencyGraph()`
   - For each edge, resolve `from` and `to` to layers using minimatch on relative paths
   - If importing layer is not in `allowedDependencies`, record violation
   - Return violations array

2. Export types: `GraphDependencyData`, `GraphLayerViolation`
3. Write tests using a fixture graph with file nodes and imports edges
4. Export from packages/graph/src/index.ts
5. Commit: `feat(graph): add GraphConstraintAdapter for constraint detection bridging`

---

### Task 2: Add GraphDependencyData type to core constraints

**Depends on:** none
**Files:** packages/core/src/constraints/types.ts

1. Add the graph dependency data type that core functions will accept:

   ```typescript
   /**
    * Pre-computed dependency data from graph — avoids file parsing.
    * Compatible with DependencyGraph shape.
    */
   export interface GraphDependencyData {
     nodes: string[];
     edges: Array<{
       from: string;
       to: string;
       importType: 'static' | 'dynamic' | 'type-only';
       line: number;
     }>;
   }
   ```

2. Export from packages/core/src/constraints/index.ts
3. Commit: `feat(core): add GraphDependencyData type for graph-enhanced constraints`

---

### Task 3: Enhance buildDependencyGraph with graph data (TDD)

**Depends on:** Task 2
**Files:** packages/core/src/constraints/dependencies.ts

1. Add optional parameter to `buildDependencyGraph`:

   ```typescript
   export async function buildDependencyGraph(
     files: string[],
     parser: LanguageParser,
     graphDependencyData?: GraphDependencyData
   ): Promise<Result<DependencyGraph, ConstraintError>>;
   ```

2. When `graphDependencyData` is provided:
   - Return `Ok({ nodes: graphDependencyData.nodes, edges: graphDependencyData.edges })` directly
   - Skip all file parsing and import resolution
   - The `files` and `parser` params are ignored (but kept for backward compat)

3. When not provided: existing behavior unchanged.
4. Commit: `feat(core): enhance buildDependencyGraph with graph-based dependency data`

---

### Task 4: Enhance validateDependencies with graph data (TDD)

**Depends on:** Tasks 2, 3
**Files:** packages/core/src/constraints/dependencies.ts, packages/core/src/constraints/types.ts

1. Add optional graph data to `LayerConfig`:

   ```typescript
   export interface LayerConfig {
     layers: Layer[];
     rootDir: string;
     parser: LanguageParser;
     fallbackBehavior?: 'skip' | 'error' | 'warn';
     graphDependencyData?: GraphDependencyData; // NEW
   }
   ```

2. When `graphDependencyData` is provided in config:
   - Skip parser health check
   - Skip file collection from layer patterns
   - Pass `graphDependencyData` through to `buildDependencyGraph`
   - Still run `checkLayerViolations` on the resulting graph

3. When not provided: existing behavior unchanged.
4. Commit: `feat(core): enhance validateDependencies with graph-based dependency data`

---

### Task 5: Enhance detectCircularDepsInFiles with graph data (TDD)

**Depends on:** Task 2
**Files:** packages/core/src/constraints/circular-deps.ts

1. Add optional parameter to `detectCircularDepsInFiles`:

   ```typescript
   export async function detectCircularDepsInFiles(
     files: string[],
     parser: LanguageParser,
     graphDependencyData?: GraphDependencyData
   ): Promise<Result<CircularDepsResult, ConstraintError>>;
   ```

2. When `graphDependencyData` is provided:
   - Skip `buildDependencyGraph(files, parser)` call
   - Use `{ nodes: graphDependencyData.nodes, edges: graphDependencyData.edges }` as the dependency graph directly
   - Pass to existing `detectCircularDeps()` (which already takes a `DependencyGraph`)

3. When not provided: existing behavior unchanged.
4. Commit: `feat(core): enhance detectCircularDepsInFiles with graph-based dependency data`

---

### Task 6: Write core constraint integration tests

**Depends on:** Tasks 3, 4, 5
**Files:** packages/core/tests/constraints/graph-integration.test.ts

1. Tests:
   - `buildDependencyGraph` with `graphDependencyData` returns graph from pre-computed data (skips parser)
   - `buildDependencyGraph` without `graphDependencyData` uses existing parser behavior
   - `validateDependencies` with `graphDependencyData` detects layer violations from graph edges
   - `validateDependencies` with `graphDependencyData` returns valid when no violations exist
   - `validateDependencies` without `graphDependencyData` uses existing behavior
   - `detectCircularDepsInFiles` with `graphDependencyData` detects cycles from graph data
   - `detectCircularDepsInFiles` without `graphDependencyData` uses existing behavior

2. Use mock graph data matching the shape of `GraphDependencyData`:

   ```typescript
   const mockGraphData: GraphDependencyData = {
     nodes: ['/src/api/handler.ts', '/src/domain/user.ts', '/src/shared/utils.ts'],
     edges: [
       { from: '/src/api/handler.ts', to: '/src/domain/user.ts', importType: 'static', line: 1 },
       { from: '/src/domain/user.ts', to: '/src/shared/utils.ts', importType: 'static', line: 2 },
     ],
   };
   ```

3. Commit: `test(core): add constraint graph-integration tests`

---

### Task 7: Update graph package exports

**Depends on:** Task 1
**Files:** packages/graph/src/index.ts

1. Add constraint exports:

   ```typescript
   // Constraints
   export { GraphConstraintAdapter } from './constraints/GraphConstraintAdapter.js';
   export type {
     GraphDependencyData,
     GraphLayerViolation,
   } from './constraints/GraphConstraintAdapter.js';
   ```

2. Note: The `GraphDependencyData` type is defined in both packages (core has its own plain version, graph has a readonly version). This follows the established pattern — graph computes, core accepts plain objects.
3. Commit: `feat(graph): export GraphConstraintAdapter`

---

### Task 8: Build and test verification

**Depends on:** Tasks 1-7
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `cd packages/graph && npx vitest run`
2. Run: `cd packages/core && npx vitest run`
3. Run: `pnpm build --filter @harness-engineering/graph`
4. Run: `pnpm build --filter @harness-engineering/core`
5. Observe: all pass
6. Commit: `chore: verify Phase 6 build and tests`

---

## Dependency Graph

```
Task 1 (GraphConstraintAdapter) ──→ Task 7 (graph exports) ──→ Task 8 (verify)
Task 2 (GraphDependencyData type) ──→ Task 3 (buildDependencyGraph) ──→ Task 6 (tests) ──→ Task 8
                                  ──→ Task 4 (validateDependencies) ──→│
                                  ──→ Task 5 (detectCircularDepsInFiles) ──→│
```

**Parallelizable:**

- Tasks 1 and 2 (different packages, no dependency)
- Tasks 3, 4, and 5 (different functions, but 4 depends on 3 being done first since it uses buildDependencyGraph internally)
- Tasks 3 and 5 (different files, can be done in parallel)

## Traceability Matrix

| Observable Truth                        | Delivered By               |
| --------------------------------------- | -------------------------- |
| 1. Graph-enhanced buildDependencyGraph  | Task 3                     |
| 2. Graph-enhanced validateDependencies  | Task 4                     |
| 3. detectCircularDeps with graph data   | Task 5                     |
| 4. detectCircularDepsInFiles with graph | Task 5                     |
| 5. Backward compatibility               | Tasks 3-5 (fallback paths) |
| 6. GraphConstraintAdapter               | Task 1                     |
| 7. Graph layer violations               | Task 1                     |
| 8. Core tests pass                      | Task 8                     |
| 9. Graph tests pass                     | Task 8                     |
| 10. Build succeeds                      | Task 8                     |
