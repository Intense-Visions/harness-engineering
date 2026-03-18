# Plan: Graph-Driven Context Assembly (Phase 4 of 10)

**Date:** 2026-03-18
**Spec:** .harness/architecture/graph-context-system/ADR-001.md
**Estimated tasks:** 10
**Estimated time:** 50-70 minutes

## Goal

Replace the static context assembly pipeline in `packages/core/src/context/` with graph-driven equivalents. Budget, filter, generate, and coverage functions become graph queries. The harness-context-assembler skill ties it together. Old APIs remain with deprecation warnings for backward compatibility.

## Observable Truths (Acceptance Criteria)

1. When `contextBudget()` is called with a GraphStore, the system shall compute token allocations informed by graph density (modules with more edges get more tokens) instead of fixed percentages.
2. When `contextFilter()` is called with a GraphStore and phase, the system shall use graph traversal to find phase-relevant nodes instead of hardcoded category maps.
3. When `generateAgentsMap()` is called with a GraphStore, the system shall generate AGENTS.md from graph topology (modules, entry points, dependency chains) instead of glob grouping.
4. When `checkDocCoverage()` is called with a GraphStore, the system shall query for code nodes without `documents` edges instead of filename matching.
5. When `validateKnowledgeMap()` is called with a GraphStore, the system shall check graph structural integrity instead of link existence.
6. When no GraphStore is provided, all functions shall fall back to their existing implementations (backward compatibility).
7. When deprecated functions are called without a GraphStore, the system shall emit a console warning directing users to the graph-enhanced version.
8. When the `Assembler.assembleContext()` is called with an intent and token budget, the system shall use FusionLayer + ContextQL + Budget to produce optimal context.
9. `pnpm test --filter @harness-engineering/core` passes.
10. `pnpm build` succeeds.

## [MODIFIED] Changes to Existing Behavior

- [MODIFIED] `contextBudget(totalTokens, overrides?)` gains optional third parameter `store?: GraphStore` — when provided, ratios are computed from graph density
- [MODIFIED] `contextFilter(phase, maxCategories?)` gains optional third parameter `store?: GraphStore` — when provided, returns graph-derived file lists
- [MODIFIED] `generateAgentsMap(config)` gains optional second parameter `store?: GraphStore` — when provided, generates from graph topology
- [MODIFIED] `checkDocCoverage(domain, options?)` gains optional `store?: GraphStore` in options — when provided, uses graph edges
- [ADDED] `Assembler` class in `packages/graph/src/context/Assembler.ts` — orchestrates graph-driven context assembly
- [ADDED] `validateAgentsMap()` and `validateKnowledgeMap()` emit deprecation warnings when called without graph

## File Map

```
CREATE packages/graph/src/context/Assembler.ts
CREATE packages/graph/tests/context/Assembler.test.ts
MODIFY packages/core/src/context/budget.ts (add graph-enhanced overload)
MODIFY packages/core/src/context/filter.ts (add graph-enhanced overload)
MODIFY packages/core/src/context/generate.ts (add graph-enhanced path)
MODIFY packages/core/src/context/doc-coverage.ts (add graph-enhanced path)
MODIFY packages/core/src/context/knowledge-map.ts (add deprecation warning)
MODIFY packages/core/src/context/agents-map.ts (add deprecation warning)
CREATE packages/core/tests/context/graph-integration.test.ts
MODIFY packages/core/src/context/index.ts (export new types)
```

## Tasks

### Task 1: Implement Assembler in packages/graph (TDD)

**Depends on:** none
**Files:** packages/graph/src/context/Assembler.ts, packages/graph/tests/context/Assembler.test.ts

1. Create the `Assembler` class — the core orchestrator for graph-driven context assembly:

   ```typescript
   export class Assembler {
     constructor(
       private readonly store: GraphStore,
       private readonly vectorStore?: VectorStore
     ) {}

     assembleContext(intent: string, tokenBudget?: number): AssembledContext;
     computeBudget(totalTokens: number, phase?: string): GraphBudget;
     filterForPhase(phase: string): GraphFilterResult;
     generateMap(): string;
     checkCoverage(): GraphCoverageReport;
   }
   ```

   - `assembleContext`: FusionLayer search → ContextQL expand around top results → truncate to token budget → return nodes + edges + metadata
   - `computeBudget`: Count nodes by type, compute density per module, allocate tokens proportionally
   - `filterForPhase`: Query graph for nodes relevant to phase (implement→code nodes, review→diff+spec nodes, debug→error-related nodes, plan→spec+architecture nodes)
   - `generateMap`: Traverse graph modules → entry points → dependency chains → format as markdown
   - `checkCoverage`: Find code nodes without `documents` edges → compute coverage percentage

2. Write tests with a pre-built graph (use CodeIngestor on fixture).
3. Export from packages/graph/src/index.ts.
4. Commit: `feat(graph): implement Assembler for graph-driven context assembly`

---

### Task 2: Enhance contextBudget with graph support

**Depends on:** Task 1
**Files:** packages/core/src/context/budget.ts

1. Add optional `store` parameter:

   ```typescript
   export function contextBudget(
     totalTokens: number,
     overrides?: TokenBudgetOverrides,
     store?: GraphStore
   ): TokenBudget;
   ```

2. When store is provided:
   - Count nodes by type to determine density
   - Modules with more edges → higher activeCode allocation
   - Specs/docs presence → higher projectManifest allocation
   - Adjust ratios based on graph composition
   - Fall back to fixed ratios for any missing category

3. When store is not provided: existing behavior unchanged.
4. Commit: `feat(core): enhance contextBudget with graph-density-aware allocation`

---

### Task 3: Enhance contextFilter with graph support

**Depends on:** Task 1
**Files:** packages/core/src/context/filter.ts

1. Add optional `store` parameter:

   ```typescript
   export function contextFilter(
     phase: WorkflowPhase,
     maxCategories?: number,
     store?: GraphStore
   ): ContextFilterResult;
   ```

2. When store is provided:
   - Query graph for nodes relevant to the phase
   - `implement`: code nodes (file, function, class) + their test files + type nodes
   - `review`: recently changed nodes (if git data) + spec/doc nodes + diff-related
   - `debug`: nodes linked to failure/learning nodes + call chain
   - `plan`: spec/doc/adr nodes + architecture (module, layer) nodes
   - Return file paths from matching nodes instead of glob patterns

3. When store is not provided: existing behavior unchanged.
4. Commit: `feat(core): enhance contextFilter with graph-driven phase filtering`

---

### Task 4: Enhance generateAgentsMap with graph support

**Depends on:** Task 1
**Files:** packages/core/src/context/generate.ts

1. Add optional `store` parameter:

   ```typescript
   export async function generateAgentsMap(
     config: AgentsMapConfig,
     store?: GraphStore
   ): Promise<Result<string, ContextError>>;
   ```

2. When store is provided:
   - Query graph for module nodes → generate "Repository Structure" from module hierarchy
   - Identify entry points (nodes with high out-degree, low in-degree) → feature them
   - Group by module rather than directory
   - Include dependency information in section descriptions

3. When store is not provided: existing behavior unchanged.
4. Commit: `feat(core): enhance generateAgentsMap with graph-topology generation`

---

### Task 5: Enhance checkDocCoverage with graph support

**Depends on:** Task 1
**Files:** packages/core/src/context/doc-coverage.ts

1. Add optional `store` in CoverageOptions:

   ```typescript
   export interface CoverageOptions {
     docsDir?: string;
     sourceDir?: string;
     excludePatterns?: string[];
     store?: GraphStore; // NEW
   }
   ```

2. When store is provided:
   - Find all code nodes (file, class, function, interface)
   - Check which have `documents` edges → documented
   - Those without → undocumented
   - Importance based on graph centrality (in-degree count)
   - Suggest section based on module membership

3. When store is not provided: existing behavior unchanged.
4. Commit: `feat(core): enhance checkDocCoverage with graph-based coverage analysis`

---

### Task 6: Add deprecation warnings to validateAgentsMap and validateKnowledgeMap

**Depends on:** none
**Files:** packages/core/src/context/agents-map.ts, knowledge-map.ts

1. Add deprecation warnings at the start of both functions:

   ```typescript
   export async function validateAgentsMap(
     path?: string
   ): Promise<Result<AgentMapValidation, ContextError>> {
     console.warn(
       '[harness] validateAgentsMap is deprecated. Use graph-based validation: Assembler.checkCoverage()'
     );
     // ... existing implementation unchanged
   }
   ```

2. Same for `validateKnowledgeMap`.
3. Commit: `chore(core): add deprecation warnings to legacy validation functions`

---

### Task 7: Write core integration tests

**Depends on:** Tasks 2-5
**Files:** packages/core/tests/context/graph-integration.test.ts

1. Tests that verify the graph-enhanced paths:
   - `contextBudget` with store returns different ratios than without
   - `contextFilter` with store returns graph-derived file paths
   - `generateAgentsMap` with store produces module-based structure
   - `checkDocCoverage` with store uses graph edges for coverage
   - All functions work identically without store (backward compat)

2. Use CodeIngestor + KnowledgeIngestor on the graph fixture to build a test graph.
3. Commit: `test(core): add graph-integration tests for enhanced context functions`

---

### Task 8: Update exports

**Depends on:** Tasks 1-6
**Files:** packages/core/src/context/index.ts, packages/graph/src/index.ts

1. Ensure all new types are exported (GraphBudget, GraphFilterResult, GraphCoverageReport, AssembledContext).
2. Export Assembler from graph package.
3. Verify builds: `pnpm build`
4. Commit: `feat(core,graph): update exports for graph-driven context assembly`

---

### Task 9: Build and test verification

**Depends on:** Tasks 7, 8
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `cd packages/graph && npx vitest run`
2. Run: `cd packages/core && npx vitest run`
3. Run: `cd packages/mcp-server && npx vitest run`
4. Run: `pnpm build`
5. Observe: all pass
6. Commit: `chore: verify Phase 4 build and tests`

---

## Dependency Graph

```
Task 1 (Assembler) ──→ Task 2 (budget) ──→ Task 7 (integration tests) ──→ Task 8 (exports) ──→ Task 9 (verify)
                  ──→ Task 3 (filter) ──→│
                  ──→ Task 4 (generate) →│
                  ──→ Task 5 (coverage) →│
Task 6 (deprecation warnings) ──────────→│
```

**Parallelizable:**

- Tasks 2, 3, 4, 5 (all enhance different context functions)
- Task 6 (deprecation) is independent of everything

## Traceability Matrix

| Observable Truth              | Delivered By                     |
| ----------------------------- | -------------------------------- |
| 1. Graph-density budget       | Task 2                           |
| 2. Graph-driven filter        | Task 3                           |
| 3. Graph-topology generate    | Task 4                           |
| 4. Graph-edge coverage        | Task 5                           |
| 5. Graph integrity validation | Task 1 (Assembler.checkCoverage) |
| 6. Backward compatibility     | Tasks 2-5 (fallback paths)       |
| 7. Deprecation warnings       | Task 6                           |
| 8. Assembler orchestration    | Task 1                           |
| 9. Core tests pass            | Task 9                           |
| 10. Build succeeds            | Task 9                           |
