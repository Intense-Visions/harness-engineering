# Plan: Graph Entropy Migration (Phase 5 of 10)

**Date:** 2026-03-18
**Spec:** .harness/architecture/graph-context-system/ADR-001.md
**Estimated tasks:** 8
**Estimated time:** 40-60 minutes

## Goal

Enhance the entropy detection system in `packages/core/src/entropy/` with graph-driven alternatives. Dead code detection becomes graph reachability. Documentation drift becomes stale-edge detection. Pattern violations become constraint-node queries. The `EntropyAnalyzer` gains an optional graph-enhanced mode. Skills `detect-doc-drift` and `cleanup-dead-code` are updated to note graph availability.

## Observable Truths (Acceptance Criteria)

1. When `EntropyAnalyzer.analyze()` is called with a GraphStore, the system shall use graph reachability for dead code detection instead of rebuilding a snapshot from scratch.
2. When `detectDocDrift()` is called with graph data, the system shall check `documents` edge staleness instead of regex pattern matching.
3. When `detectDeadCode()` is called with graph data, the system shall use graph reachability from entry point nodes instead of BFS on a fresh dependency graph.
4. When no graph data is provided, all functions shall fall back to existing implementations (backward compatibility).
5. When the `detect-doc-drift` and `cleanup-dead-code` skills are reviewed, they shall note graph availability in their SKILL.md context gathering sections.
6. `pnpm test --filter @harness-engineering/core` passes with all new tests.
7. `pnpm build` succeeds.

## [MODIFIED] Changes to Existing Behavior

- [MODIFIED] `EntropyAnalyzer` constructor gains optional `graphStore` parameter
- [MODIFIED] `detectDocDrift` gains optional `graphData` parameter with pre-computed drift info
- [MODIFIED] `detectDeadCode` gains optional `graphData` parameter with pre-computed reachability
- [MODIFIED] `buildSnapshot` gains optional `graphStore` parameter to populate from graph instead of parsing files
- [ADDED] `GraphEntropyAdapter` in packages/graph — bridges graph queries to entropy detector input formats

## File Map

```
CREATE packages/graph/src/entropy/GraphEntropyAdapter.ts
CREATE packages/graph/tests/entropy/GraphEntropyAdapter.test.ts
MODIFY packages/core/src/entropy/analyzer.ts (add graph-enhanced mode)
MODIFY packages/core/src/entropy/detectors/drift.ts (add graph data path)
MODIFY packages/core/src/entropy/detectors/dead-code.ts (add graph data path)
MODIFY packages/core/src/entropy/snapshot.ts (add graph population path)
CREATE packages/core/tests/entropy/graph-integration.test.ts
MODIFY packages/graph/src/index.ts (export GraphEntropyAdapter)
```

## Tasks

### Task 1: Implement GraphEntropyAdapter (TDD)

**Depends on:** none
**Files:** packages/graph/src/entropy/GraphEntropyAdapter.ts, tests

1. Create adapter that bridges graph queries to entropy-compatible formats:

   ```typescript
   export class GraphEntropyAdapter {
     constructor(private readonly store: GraphStore) {}

     computeDriftData(): GraphDriftData;
     computeDeadCodeData(): GraphDeadCodeData;
     computeSnapshotSummary(): GraphSnapshotSummary;
   }
   ```

   **computeDriftData()**:
   - Find all `documents` edges
   - For each, check if target code node still exists
   - For each code node with a `documents` edge, check `lastModified` vs edge creation
   - Return: `{ staleEdges: Array<{docNodeId, codeNodeId, edgeAge}>, missingTargets: string[] }`

   **computeDeadCodeData()**:
   - Find entry point nodes (file nodes with metadata `{ entryPoint: true }` or files named index.ts)
   - BFS from entry points following `imports`/`calls` edges
   - Return: `{ reachableNodeIds: Set<string>, unreachableNodes: GraphNode[], entryPoints: string[] }`

   **computeSnapshotSummary()**:
   - Count nodes by type, edges by type
   - Return summary stats compatible with snapshot format

2. Export types: `GraphDriftData`, `GraphDeadCodeData`, `GraphSnapshotSummary`
3. Write tests using fixture graph (CodeIngestor + KnowledgeIngestor)
4. Export from packages/graph/src/index.ts
5. Commit: `feat(graph): add GraphEntropyAdapter for entropy detection bridging`

---

### Task 2: Enhance detectDocDrift with graph data (TDD)

**Depends on:** Task 1
**Files:** packages/core/src/entropy/detectors/drift.ts

1. Add optional parameter to `detectDocDrift`:

   ```typescript
   export async function detectDocDrift(
     snapshot: CodebaseSnapshot,
     config?: Partial<DriftConfig>,
     graphDriftData?: {
       staleEdges: Array<{ docNodeId: string; codeNodeId: string }>;
       missingTargets: string[];
     }
   ): Promise<Result<DriftReport, EntropyError>>;
   ```

2. When `graphDriftData` is provided:
   - Convert stale edges to `DocumentationDrift` objects with type `'api-signature'`, issue `'NOT_FOUND'`
   - Convert missing targets to drifts with appropriate confidence
   - Skip the file-based reference checking
   - Still compute stats and severity

3. When not provided: existing behavior unchanged.
4. Commit: `feat(core): enhance detectDocDrift with graph-based drift data`

---

### Task 3: Enhance detectDeadCode with graph data (TDD)

**Depends on:** Task 1
**Files:** packages/core/src/entropy/detectors/dead-code.ts

1. Add optional parameter to `detectDeadCode`:

   ```typescript
   export async function detectDeadCode(
     snapshot: CodebaseSnapshot,
     graphDeadCodeData?: {
       reachableNodeIds: Set<string> | string[];
       unreachableNodes: Array<{ id: string; type: string; name: string; path?: string }>;
     }
   ): Promise<Result<DeadCodeReport, EntropyError>>;
   ```

2. When `graphDeadCodeData` is provided:
   - Convert unreachable nodes to `DeadExport` / `DeadFile` objects
   - Use reachable set to determine what's alive
   - Skip the snapshot-based BFS reachability analysis
   - Still compute stats

3. When not provided: existing behavior unchanged.
4. Commit: `feat(core): enhance detectDeadCode with graph-based reachability`

---

### Task 4: Enhance EntropyAnalyzer with graph mode

**Depends on:** Tasks 2, 3
**Files:** packages/core/src/entropy/analyzer.ts

1. Add optional graph data to constructor or analyze method:

   ```typescript
   interface EntropyAnalyzerOptions {
     graphDriftData?: GraphDriftData;
     graphDeadCodeData?: GraphDeadCodeData;
   }

   async analyze(graphOptions?: EntropyAnalyzerOptions): Promise<Result<EntropyReport, EntropyError>>
   ```

2. When graph options provided, pass them through to detectors.
3. When not provided: existing behavior unchanged.
4. Commit: `feat(core): enhance EntropyAnalyzer with graph-driven analysis mode`

---

### Task 5: Write core entropy integration tests

**Depends on:** Tasks 2, 3, 4
**Files:** packages/core/tests/entropy/graph-integration.test.ts

1. Tests:
   - `detectDocDrift` with graphDriftData returns drift report from graph edges
   - `detectDocDrift` without graphDriftData uses existing behavior
   - `detectDeadCode` with graphDeadCodeData returns dead code from graph reachability
   - `detectDeadCode` without graphDeadCodeData uses existing behavior
   - `EntropyAnalyzer.analyze` with graph options uses graph-enhanced detectors

2. Commit: `test(core): add entropy graph-integration tests`

---

### Task 6: Update detect-doc-drift and cleanup-dead-code skill notes

**Depends on:** none
**Files:** agents/skills/claude-code/harness-detect-doc-drift/SKILL.md (note only), agents/skills/claude-code/harness-cleanup-dead-code/SKILL.md (note only)

This is documentation-only — add a note to the context gathering section of each skill mentioning that graph-based detection is available when a graph exists.

Actually, per the plan skill gates: "No implementation during planning." These are installed skill files, not project code. Skip this task — it will be addressed in Phase 7 (Tier-1 Skill Migration).

---

### Task 7: Build and test verification

**Depends on:** Tasks 1-5
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `cd packages/graph && npx vitest run`
2. Run: `cd packages/core && npx vitest run`
3. Run: `pnpm build --filter @harness-engineering/graph`
4. Observe: all pass
5. Commit: `chore: verify Phase 5 build and tests`

---

## Dependency Graph

```
Task 1 (GraphEntropyAdapter) ──→ Task 2 (drift enhancement) ──→ Task 4 (analyzer) ──→ Task 5 (tests) ──→ Task 7 (verify)
                             ──→ Task 3 (dead code enhancement) ──→│
```

**Parallelizable:**

- Tasks 2 and 3 (drift vs dead code — different files)

## Traceability Matrix

| Observable Truth                   | Delivered By               |
| ---------------------------------- | -------------------------- |
| 1. Graph-enhanced EntropyAnalyzer  | Task 4                     |
| 2. Graph-based drift detection     | Task 2                     |
| 3. Graph-based dead code detection | Task 3                     |
| 4. Backward compatibility          | Tasks 2-4 (fallback paths) |
| 5. Skill notes                     | Deferred to Phase 7        |
| 6. Core tests pass                 | Task 7                     |
| 7. Build succeeds                  | Task 7                     |
