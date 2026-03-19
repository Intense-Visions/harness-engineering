# Plan: Tier-1 Skill Migration (Phase 7 of 10)

**Date:** 2026-03-18
**Spec:** .harness/architecture/graph-context-system/ADR-001.md
**Estimated tasks:** 10
**Estimated time:** 50-70 minutes

## Goal

Wire graph-enhanced core functions into the MCP tool layer, enhance the feedback system with optional graph-based impact analysis, and update 7 Tier-1 skill SKILL.md files with graph-aware context gathering notes. After this phase, every MCP tool that wraps a graph-enhanced core function will automatically use the graph when available.

## Observable Truths (Acceptance Criteria)

1. When `analyzeDiff()` is called with `graphImpactData`, the system shall use graph relationships for test coverage detection instead of filename matching.
2. When `ChecklistBuilder.withHarnessChecks()` is called with graph data, the system shall return real check results instead of placeholders.
3. When `requestPeerReview()` is called with graph context in metadata, the agent shall receive pre-assembled context.
4. When no graph data is provided, all feedback functions shall fall back to existing implementations (backward compatibility).
5. When the `detect_entropy` MCP tool is called and a graph exists at `.harness/graph/`, the system shall load the graph and pass entropy adapter data to `EntropyAnalyzer.analyze()`.
6. When the `check_dependencies` MCP tool is called and a graph exists, the system shall pass graph dependency data to `validateDependencies()`.
7. When the `check_docs` MCP tool is called and a graph exists, the system shall pass graph coverage data to `checkDocCoverage()`.
8. When the `create_self_review`, `analyze_diff`, or `request_peer_review` MCP tools are called and a graph exists, the system shall pass graph data to the corresponding core functions.
9. When the 7 Tier-1 skill SKILL.md files are reviewed, they shall contain graph-aware context gathering notes.
10. `pnpm test --filter @harness-engineering/core` passes with all new tests.
11. `pnpm test --filter @harness-engineering/graph` passes with all new tests.
12. `pnpm test --filter @harness-engineering/mcp-server` passes (no regressions beyond pre-existing failures).
13. `pnpm build` succeeds.

## [MODIFIED] Changes to Existing Behavior

- [ADDED] `GraphFeedbackAdapter` in packages/graph — bridges graph queries to feedback-compatible formats
- [MODIFIED] `analyzeDiff` gains optional `graphImpactData` parameter with pre-computed impact info
- [MODIFIED] `ChecklistBuilder.withHarnessChecks()` gains optional `graphData` parameter for real checks
- [MODIFIED] `requestPeerReview` gains optional graph context via `ReviewContext.metadata.graphContext`
- [MODIFIED] `handleDetectEntropy` MCP tool loads graph and passes to EntropyAnalyzer
- [MODIFIED] `handleCheckDependencies` MCP tool loads graph and passes to validateDependencies
- [MODIFIED] `handleCheckDocs` MCP tool loads graph and passes to checkDocCoverage
- [MODIFIED] `handleCreateSelfReview` MCP tool loads graph and passes to createSelfReview
- [MODIFIED] `handleAnalyzeDiff` MCP tool loads graph and passes to analyzeDiff
- [MODIFIED] `handleRequestPeerReview` MCP tool loads graph and passes to requestPeerReview
- [MODIFIED] 7 Tier-1 skill SKILL.md files gain graph-aware context gathering notes

## File Map

```
CREATE packages/graph/src/feedback/GraphFeedbackAdapter.ts
CREATE packages/graph/tests/feedback/GraphFeedbackAdapter.test.ts
MODIFY packages/core/src/feedback/types.ts (add GraphImpactData, GraphHarnessCheckData)
MODIFY packages/core/src/feedback/review/diff-analyzer.ts (add graph impact path)
MODIFY packages/core/src/feedback/review/checklist.ts (add graph harness checks)
MODIFY packages/core/src/feedback/review/peer-review.ts (pass graph context)
MODIFY packages/core/src/feedback/index.ts (export new types)
CREATE packages/core/tests/feedback/graph-integration.test.ts
MODIFY packages/mcp-server/src/tools/entropy.ts (load graph, pass to analyzer)
MODIFY packages/mcp-server/src/tools/validate.ts (load graph, pass to validators)
MODIFY packages/mcp-server/src/tools/feedback.ts (load graph, pass to feedback)
MODIFY packages/graph/src/index.ts (export GraphFeedbackAdapter)
MODIFY agents/skills/claude-code/harness-code-review/SKILL.md (graph notes)
MODIFY agents/skills/claude-code/validate-context-engineering/SKILL.md (graph notes)
MODIFY agents/skills/claude-code/harness-parallel-agents/SKILL.md (graph notes)
MODIFY agents/skills/claude-code/harness-onboarding/SKILL.md (graph notes)
MODIFY agents/skills/claude-code/detect-doc-drift/SKILL.md (graph notes)
MODIFY agents/skills/claude-code/cleanup-dead-code/SKILL.md (graph notes)
MODIFY agents/skills/claude-code/enforce-architecture/SKILL.md (graph notes)
```

## Tasks

### Task 1: Implement GraphFeedbackAdapter (TDD)

**Depends on:** none
**Files:** packages/graph/src/feedback/GraphFeedbackAdapter.ts, packages/graph/tests/feedback/GraphFeedbackAdapter.test.ts

1. Create adapter that bridges graph queries to feedback-compatible formats:

   ```typescript
   export interface GraphImpactData {
     readonly affectedTests: ReadonlyArray<{
       testFile: string;
       coversFile: string;
     }>;
     readonly affectedDocs: ReadonlyArray<{
       docFile: string;
       documentsFile: string;
     }>;
     readonly impactScope: number; // total affected downstream nodes
   }

   export interface GraphHarnessCheckData {
     readonly graphExists: boolean;
     readonly nodeCount: number;
     readonly edgeCount: number;
     readonly constraintViolations: number;
     readonly undocumentedFiles: number;
     readonly unreachableNodes: number;
   }

   export class GraphFeedbackAdapter {
     constructor(private readonly store: GraphStore) {}

     computeImpactData(changedFiles: string[]): GraphImpactData;
     computeHarnessCheckData(): GraphHarnessCheckData;
   }
   ```

   **computeImpactData(changedFiles)**:
   - For each changed file, find its graph node by path
   - Find inbound `imports` edges to identify dependents (impact scope)
   - Find related test files: nodes connected via `imports` edges with `test` in name/path
   - Find related doc files: nodes connected via `documents` edges
   - Return aggregated impact data

   **computeHarnessCheckData()**:
   - Count total nodes and edges
   - Count `imports` edges that violate layer constraints (use simple heuristic: check for `violates` edges)
   - Count code `file` nodes without any `documents` inbound edge (undocumented)
   - Count unreachable nodes (file nodes with no inbound `imports` edges that aren't entry points)

2. Export types: `GraphImpactData`, `GraphHarnessCheckData`
3. Write tests using fixture graph with file, test, and doc nodes
4. Export from packages/graph/src/index.ts
5. Commit: `feat(graph): add GraphFeedbackAdapter for feedback system bridging`

---

### Task 2: Add graph types to core feedback

**Depends on:** none
**Files:** packages/core/src/feedback/types.ts, packages/core/src/feedback/index.ts

1. Add graph data types at end of `packages/core/src/feedback/types.ts`:

   ```typescript
   /**
    * Pre-computed impact data from graph — enriches diff analysis.
    */
   export interface GraphImpactData {
     affectedTests: Array<{ testFile: string; coversFile: string }>;
     affectedDocs: Array<{ docFile: string; documentsFile: string }>;
     impactScope: number;
   }

   /**
    * Pre-computed harness check data from graph — replaces placeholders.
    */
   export interface GraphHarnessCheckData {
     graphExists: boolean;
     nodeCount: number;
     edgeCount: number;
     constraintViolations: number;
     undocumentedFiles: number;
     unreachableNodes: number;
   }
   ```

2. Export both types from `packages/core/src/feedback/index.ts`
3. Commit: `feat(core): add graph impact and harness check types for feedback`

---

### Task 3: Enhance analyzeDiff with graph impact data (TDD)

**Depends on:** Task 2
**Files:** packages/core/src/feedback/review/diff-analyzer.ts

1. Add optional parameter to `analyzeDiff`:

   ```typescript
   export async function analyzeDiff(
     changes: CodeChanges,
     options: SelfReviewConfig['diffAnalysis'],
     graphImpactData?: GraphImpactData
   ): Promise<Result<ReviewItem[], FeedbackError>>;
   ```

2. When `graphImpactData` is provided:
   - Replace filename-based test coverage check with graph-based: for each new file, check if `graphImpactData.affectedTests` includes a test covering it
   - Add new review item for impact scope: if `impactScope > 20`, add a warning about broad impact
   - Add review item for documentation: if changed files have no entry in `affectedDocs`, flag missing documentation

3. When not provided: existing behavior unchanged.
4. Commit: `feat(core): enhance analyzeDiff with graph-based impact analysis`

---

### Task 4: Enhance ChecklistBuilder with graph harness checks (TDD)

**Depends on:** Task 2
**Files:** packages/core/src/feedback/review/checklist.ts

1. Add optional graph data to `withHarnessChecks`:

   ```typescript
   withHarnessChecks(
     options?: SelfReviewConfig['harness'],
     graphData?: GraphHarnessCheckData
   ): this
   ```

2. In `run()`, when `graphData` is provided:
   - Replace context placeholder with real check: `graphData.graphExists && graphData.nodeCount > 0`
   - Replace constraints placeholder: `graphData.constraintViolations === 0`
   - Replace entropy placeholder: `graphData.unreachableNodes === 0 && graphData.undocumentedFiles === 0`
   - Include counts in details strings

3. When `graphData` is not provided: existing placeholder behavior unchanged.
4. Also update `createSelfReview` in `self-review.ts` to accept and pass through optional graph data:

   ```typescript
   export async function createSelfReview(
     changes: CodeChanges,
     config: SelfReviewConfig,
     graphData?: { impact?: GraphImpactData; harness?: GraphHarnessCheckData }
   ): Promise<Result<ReviewChecklist, FeedbackError>>;
   ```

   Pass `graphData.harness` to `withHarnessChecks()` and `graphData.impact` to diff analysis if enabled.

5. Commit: `feat(core): enhance ChecklistBuilder with graph-based harness checks`

---

### Task 5: Enhance requestPeerReview with graph context

**Depends on:** Task 2
**Files:** packages/core/src/feedback/review/peer-review.ts

1. No signature change needed. The graph context is passed via `ReviewContext.metadata`:

   ```typescript
   // Callers (MCP tools) pre-assemble context and pass in metadata:
   const context: ReviewContext = {
     files: changedFiles,
     diff: diffString,
     metadata: {
       graphContext: {
         impactScope: 15,
         affectedTests: ['test1.ts', 'test2.ts'],
         affectedDocs: ['README.md'],
       },
     },
   };
   ```

2. The `requestPeerReview` function already passes `context` through to the executor. No code change needed — the metadata is already forwarded. This task is verification only.

3. Write a test confirming that metadata including `graphContext` is passed through to the spawned agent config.

4. Commit: `test(core): verify graph context passthrough in requestPeerReview`

---

### Task 6: Wire MCP validation and entropy tools to use graph

**Depends on:** none (uses adapters from Phases 4-6)
**Files:** packages/mcp-server/src/tools/entropy.ts, packages/mcp-server/src/tools/validate.ts

1. **detect_entropy** (`entropy.ts`):
   - Import `loadGraphStore` from `../utils/graph-loader.js`
   - After resolving projectPath, attempt `const store = await loadGraphStore(projectPath)`
   - If store loaded, import `GraphEntropyAdapter` from `@harness-engineering/graph`
   - Compute: `const adapter = new GraphEntropyAdapter(store)`
   - Pass graph options to `analyzer.analyze()`:
     ```typescript
     const graphOptions = store
       ? {
           graphDriftData: adapter.computeDriftData(),
           graphDeadCodeData: adapter.computeDeadCodeData(),
         }
       : undefined;
     const report = await analyzer.analyze(graphOptions);
     ```

2. **check_dependencies** (in `validate.ts` or relevant handler):
   - After loading config, attempt graph load
   - If store loaded, import `GraphConstraintAdapter` from `@harness-engineering/graph`
   - Compute: `const adapter = new GraphConstraintAdapter(store)`
   - Pass: `graphDependencyData: adapter.computeDependencyGraph()` in LayerConfig

3. **check_docs** (if it exists as MCP tool wrapping checkDocCoverage):
   - After loading config, attempt graph load
   - If store loaded, import `Assembler` from `@harness-engineering/graph`
   - Compute: `const assembler = new Assembler(store); const coverage = assembler.checkCoverage()`
   - Pass `graphCoverage` to `checkDocCoverage()`

4. All graph loading is optional — tools work without graph (existing behavior).
5. Commit: `feat(mcp): wire validation and entropy tools to use graph when available`

---

### Task 7: Wire MCP feedback tools to use graph

**Depends on:** Tasks 3, 4
**Files:** packages/mcp-server/src/tools/feedback.ts

1. **create_self_review**:
   - Import `loadGraphStore`
   - After resolving path, attempt graph load
   - If store loaded, import `GraphFeedbackAdapter` from `@harness-engineering/graph`
   - Compute impact and harness data
   - Pass to `createSelfReview(changes, config, { impact: impactData, harness: harnessData })`

2. **analyze_diff**:
   - Accept optional `path` parameter (may need schema update)
   - If path provided, attempt graph load
   - If store loaded, compute impact data
   - Pass to `analyzeDiff(changes, options, graphImpactData)`

3. **request_peer_review**:
   - After resolving path, attempt graph load
   - If store loaded, compute impact data
   - Add to context metadata: `context.metadata = { ...context.metadata, graphContext: impactData }`

4. Commit: `feat(mcp): wire feedback tools to use graph when available`

---

### Task 8: Update 7 Tier-1 skill SKILL.md files with graph notes

**Depends on:** none
**Files:** 7 SKILL.md files in agents/skills/claude-code/

1. For each of the 7 Tier-1 skills, add a brief note to the context gathering section. The note follows this template:

   ```markdown
   ### Graph-Enhanced Context (when available)

   When a knowledge graph exists at `.harness/graph/`, use graph queries
   for faster, more accurate context gathering:

   - `query_graph` — traverse dependencies from changed files
   - `get_impact` — find all affected tests, docs, and downstream code
   - `find_context_for` — assemble relevant context within token budget

   Graph queries replace manual grep/find commands and discover
   transitive dependencies that file search misses.
   ```

2. Skill-specific additions:
   - **harness-code-review**: Replace Context Assembly commands section with graph alternative
   - **validate-context-engineering**: Note that graph IS the source of truth for coverage
   - **harness-parallel-agents**: Note graph-based independence verification via `get_impact`
   - **harness-onboarding**: Note dynamic architecture mapping via `query_graph`
   - **detect-doc-drift**: Note `documents` edge staleness check replaces regex matching
   - **cleanup-dead-code**: Note graph reachability replaces static analysis
   - **enforce-architecture**: Note `imports` edge traversal against layer constraints

3. Commit: `docs(skills): add graph-aware context gathering notes to Tier-1 skills`

---

### Task 9: Write integration tests

**Depends on:** Tasks 3, 4, 5
**Files:** packages/core/tests/feedback/graph-integration.test.ts

1. Tests:
   - `analyzeDiff` with `graphImpactData` uses graph for test coverage (skips filename matching)
   - `analyzeDiff` without `graphImpactData` uses existing filename matching
   - `analyzeDiff` with `graphImpactData` flags broad impact scope
   - `ChecklistBuilder.withHarnessChecks` with `graphData` returns real check results
   - `ChecklistBuilder.withHarnessChecks` without `graphData` returns placeholders
   - `createSelfReview` with graph data passes through to builder and analyzer
   - `requestPeerReview` forwards metadata including graphContext

2. Use mock graph data matching the shapes defined in Task 2.
3. Commit: `test(core): add feedback graph-integration tests`

---

### Task 10: Build and test verification

**Depends on:** Tasks 1-9
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `cd packages/graph && npx vitest run`
2. Run: `cd packages/core && npx vitest run`
3. Run: `cd packages/mcp-server && npx vitest run`
4. Run: `pnpm build --filter @harness-engineering/graph`
5. Run: `pnpm build --filter @harness-engineering/core`
6. Run: `pnpm build --filter @harness-engineering/mcp-server`
7. Observe: all pass (MCP pre-existing failures excluded)
8. Commit: `chore: verify Phase 7 build and tests`

---

## Dependency Graph

```
Task 1 (GraphFeedbackAdapter) ──→ Task 7 (MCP feedback wiring) ──→ Task 10 (verify)
Task 2 (graph types) ──→ Task 3 (analyzeDiff) ──→ Task 9 (tests) ──→ Task 10
                     ──→ Task 4 (ChecklistBuilder) ──→│
                     ──→ Task 5 (requestPeerReview) ──→│
Task 6 (MCP validation/entropy wiring) ──→ Task 10
Task 8 (skill SKILL.md updates) ──→ Task 10
```

**Parallelizable:**

- Tasks 1, 2, 6, 8 (all independent — different packages/files)
- Tasks 3, 4, 5 (after Task 2 — different files)
- Task 7 depends on Tasks 1, 3, 4

## Traceability Matrix

| Observable Truth                      | Delivered By               |
| ------------------------------------- | -------------------------- |
| 1. Graph-enhanced analyzeDiff         | Task 3                     |
| 2. Graph-enhanced ChecklistBuilder    | Task 4                     |
| 3. Graph context in requestPeerReview | Task 5                     |
| 4. Backward compatibility             | Tasks 3-5 (fallback paths) |
| 5. MCP detect_entropy uses graph      | Task 6                     |
| 6. MCP check_dependencies uses graph  | Task 6                     |
| 7. MCP check_docs uses graph          | Task 6                     |
| 8. MCP feedback tools use graph       | Task 7                     |
| 9. Tier-1 skill SKILL.md updates      | Task 8                     |
| 10. Core tests pass                   | Task 10                    |
| 11. Graph tests pass                  | Task 10                    |
| 12. MCP tests pass (no regressions)   | Task 10                    |
| 13. Build succeeds                    | Task 10                    |
