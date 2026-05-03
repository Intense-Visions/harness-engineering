# Plan: Graph Knowledge Layer (Phase 2a of 10)

**Date:** 2026-03-18
**Spec:** .harness/architecture/graph-context-system/ADR-001.md
**Estimated tasks:** 10
**Estimated time:** 40-60 minutes

## Goal

Add KnowledgeIngestor (ADR/doc/learning/failure ingestion), GitIngestor (commit/blame/co-change analysis), and FusionLayer (keyword + semantic score fusion) to `packages/graph` — completing the knowledge layer that enables non-code context to be linked to code nodes.

## Observable Truths (Acceptance Criteria)

1. When `KnowledgeIngestor.ingestADRs(dirPath)` is called with a directory of markdown ADR files, the system shall create `adr` nodes with metadata (date, status, title) and `documents` edges linking them to code nodes mentioned in their content via keyword matching.
2. When `KnowledgeIngestor.ingestLearnings(projectPath)` is called, the system shall parse `.harness/learnings.md` and create `learning` nodes with `applies_to` edges to relevant code nodes.
3. When `KnowledgeIngestor.ingestFailures(projectPath)` is called, the system shall parse `.harness/failures.md` and create `failure` nodes with `caused_by` edges.
4. When `GitIngestor.ingest(rootDir)` is called, the system shall create `commit` nodes from git log and `co_changes_with` edges between files frequently modified together.
5. When `FusionLayer.search(query, store)` is called with a natural language query, the system shall return ranked results combining keyword matching (against node names/paths) and optional vector similarity.
6. When no VectorStore is provided to FusionLayer, the system shall fall back to 100% keyword signal without errors.
7. `pnpm test --filter @harness-engineering/graph` passes with all new tests.
8. `pnpm build --filter @harness-engineering/graph` succeeds.

## File Map

```
CREATE packages/graph/src/ingest/KnowledgeIngestor.ts
CREATE packages/graph/src/ingest/GitIngestor.ts
CREATE packages/graph/src/search/FusionLayer.ts
CREATE packages/graph/tests/ingest/KnowledgeIngestor.test.ts
CREATE packages/graph/tests/ingest/GitIngestor.test.ts
CREATE packages/graph/tests/search/FusionLayer.test.ts
CREATE packages/graph/__fixtures__/sample-project/docs/adr/ADR-001.md
CREATE packages/graph/__fixtures__/sample-project/.harness/learnings.md
CREATE packages/graph/__fixtures__/sample-project/.harness/failures.md
MODIFY packages/graph/src/index.ts (add exports)
```

## Tasks

### Task 1: Create knowledge fixtures

**Depends on:** none
**Files:** packages/graph/**fixtures**/sample-project/docs/adr/ADR-001.md, .harness/learnings.md, .harness/failures.md

1. Create fixture ADR at `__fixtures__/sample-project/docs/adr/ADR-001.md`:

   ```markdown
   # ADR-001: Use AuthService for authentication

   **Date:** 2026-01-15
   **Status:** Accepted

   ## Context

   We need a centralized authentication service. The UserService currently handles auth inline.

   ## Decision

   Extract authentication into AuthService in src/services/auth-service.ts using hashPassword from src/utils/hash.ts.

   ## Consequences

   - AuthService owns all auth logic
   - UserService delegates to AuthService
   ```

2. Create fixture learnings at `__fixtures__/sample-project/.harness/learnings.md`:

   ```markdown
   ## 2026-01-20 — Task 3: Auth refactor

   - [skill:harness-execution] [outcome:gotcha] hashPassword in hash.ts uses SHA-256 which is not suitable for production password hashing
   - [skill:harness-execution] [outcome:success] AuthService correctly delegates token generation
   ```

3. Create fixture failures at `__fixtures__/sample-project/.harness/failures.md`:

   ```markdown
   ## 2026-01-22 — Failure

   - **Date:** 2026-01-22
   - **Skill:** harness-execution
   - **Type:** test-failure
   - **Description:** UserService.login fails when user not found — missing null check before calling auth.authenticate
   ```

4. Commit: `test(graph): add knowledge fixtures for ADR, learnings, and failures`

---

### Task 2: Implement KnowledgeIngestor (TDD)

**Depends on:** Task 1
**Files:** packages/graph/src/ingest/KnowledgeIngestor.ts, packages/graph/tests/ingest/KnowledgeIngestor.test.ts

1. Create test file with cases:
   - Ingests ADR files as `adr` nodes with metadata (date, status, title)
   - Creates `documents` edges from ADR to code nodes mentioned in ADR content (by matching file paths and symbol names against existing graph nodes)
   - Ingests learnings.md as `learning` nodes with skill/outcome metadata
   - Creates `applies_to` edges from learnings to relevant code nodes
   - Ingests failures.md as `failure` nodes with skill/type metadata
   - Creates `caused_by` edges from failures to relevant code nodes
   - Returns IngestResult with counts
   - Handles missing files gracefully (returns empty result, no errors)

   Tests should first ingest code via CodeIngestor (to have code nodes to link to), then run KnowledgeIngestor.

2. Implement KnowledgeIngestor with:
   - `ingestADRs(adrDir: string): Promise<IngestResult>` — find .md files, parse frontmatter-style metadata, create nodes, link to code via keyword matching
   - `ingestLearnings(projectPath: string): Promise<IngestResult>` — parse `.harness/learnings.md`, create nodes per entry
   - `ingestFailures(projectPath: string): Promise<IngestResult>` — parse `.harness/failures.md`, create nodes per entry
   - `ingestAll(projectPath: string): Promise<IngestResult>` — convenience method calling all three
   - Private `linkToCode(content: string, sourceNodeId: string, edgeType: EdgeType)` — scan content for references to existing graph node names/paths, create edges

3. Run tests, fix until passing.
4. Commit: `feat(graph): implement KnowledgeIngestor for ADR, learning, and failure ingestion`

---

### Task 3: Implement GitIngestor (TDD)

**Depends on:** none (independent of Task 2)
**Files:** packages/graph/src/ingest/GitIngestor.ts, packages/graph/tests/ingest/GitIngestor.test.ts

1. Create test file. Since we can't run real git commands in fixtures, mock the git output:
   - Creates commit nodes from git log output
   - Creates `co_changes_with` edges between files changed in same commit
   - Handles empty git log gracefully
   - Returns IngestResult with counts

2. Implement GitIngestor with:
   - `ingest(rootDir: string): Promise<IngestResult>` — runs `git log`, parses output, creates nodes/edges
   - Private `parseGitLog(output: string)` — parses `git log --format` output into structured data
   - Private `computeCoChanges(commits)` — for files appearing in 2+ commits together, create `co_changes_with` edges
   - Uses `child_process.execFile` for git commands (testable via dependency injection or process mock)

3. Run tests, fix until passing.
4. Commit: `feat(graph): implement GitIngestor for commit nodes and co-change edges`

---

### Task 4: Implement FusionLayer (TDD)

**Depends on:** none (independent of Tasks 2-3)
**Files:** packages/graph/src/search/FusionLayer.ts, packages/graph/tests/search/FusionLayer.test.ts

1. Create test file:
   - Keyword search returns nodes matching query terms against names/paths
   - Results are ranked by match quality (exact name match > partial path match)
   - With VectorStore, combines keyword + semantic scores
   - Without VectorStore, uses 100% keyword signal
   - Handles empty query gracefully
   - Handles no matches gracefully
   - Respects topK limit

2. Implement FusionLayer with:
   - Constructor takes `GraphStore` and optional `VectorStore`
   - `search(query: string, topK?: number): FusionResult[]` — extract keywords, score nodes, optionally blend with vector similarity
   - Private `keywordScore(query: string, node: GraphNode): number` — score based on name match, path match, metadata match
   - Private `extractKeywords(query: string): string[]` — tokenize, remove stop words
   - Private `fuseScores(keywordScore: number, vectorScore: number): number` — weighted combination (default 60% keyword / 40% semantic)

   Export `FusionResult`: `{ nodeId: string; node: GraphNode; score: number; signals: { keyword: number; semantic: number } }`

3. Run tests, fix until passing.
4. Commit: `feat(graph): implement FusionLayer with keyword + semantic score fusion`

---

### Task 5: Create search directory and update index.ts

**Depends on:** Tasks 2, 3, 4
**Files:** packages/graph/src/index.ts

1. Add new exports to index.ts:

   ```typescript
   // Ingest (additions)
   export { KnowledgeIngestor } from './ingest/KnowledgeIngestor.js';
   export { GitIngestor } from './ingest/GitIngestor.js';

   // Search
   export { FusionLayer } from './search/FusionLayer.js';
   export type { FusionResult } from './search/FusionLayer.js';
   ```

2. Run: `pnpm build --filter @harness-engineering/graph`
3. Verify build succeeds with new exports in .d.ts
4. Commit: `feat(graph): export KnowledgeIngestor, GitIngestor, and FusionLayer`

---

### Task 6: Integration test — knowledge pipeline

**Depends on:** Tasks 2, 3, 4, 5
**Files:** packages/graph/tests/integration/scan-and-query.test.ts (modify)

1. Add a new integration test to the existing file:

   ```typescript
   it('knowledge pipeline: code + ADRs + learnings → linked graph', async () => {
     const store = new GraphStore();
     // 1. Ingest code
     const codeIngestor = new CodeIngestor(store);
     await codeIngestor.ingest(FIXTURE_DIR);
     // 2. Ingest knowledge
     const knowledgeIngestor = new KnowledgeIngestor(store);
     await knowledgeIngestor.ingestAll(FIXTURE_DIR);
     // 3. Verify ADR nodes exist and link to code
     const adrNodes = store.findNodes({ type: 'adr' });
     expect(adrNodes.length).toBeGreaterThan(0);
     const adrEdges = store.getEdges({ type: 'documents' });
     expect(adrEdges.length).toBeGreaterThan(0);
     // 4. Verify learning nodes link to code
     const learningNodes = store.findNodes({ type: 'learning' });
     expect(learningNodes.length).toBeGreaterThan(0);
     // 5. Verify FusionLayer can find relevant context
     const fusion = new FusionLayer(store);
     const results = fusion.search('authentication service');
     expect(results.length).toBeGreaterThan(0);
     expect(results[0].node.name).toMatch(/auth/i);
   });
   ```

2. Run full test suite: `npx vitest run`
3. Commit: `test(graph): add knowledge pipeline integration test`

---

### Task 7: Run full test suite and build verification

**Depends on:** Task 6
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `cd packages/graph && npx vitest run`
2. Run: `pnpm build --filter @harness-engineering/graph`
3. Observe: all tests pass, build succeeds
4. Commit: `chore(graph): verify Phase 2a build and tests pass`

---

## Dependency Graph

```
Task 1 (fixtures) ──→ Task 2 (KnowledgeIngestor)  ──┐
                                                      │
Task 3 (GitIngestor)  ───────────────────────────────→ Task 5 (exports) ──→ Task 6 (integration) ──→ Task 7 (verify)
                                                      │
Task 4 (FusionLayer)  ───────────────────────────────┘
```

**Parallelizable:** Tasks 2, 3, 4 can all run in parallel (after Task 1 creates fixtures).

## Traceability Matrix

| Observable Truth                     | Delivered By |
| ------------------------------------ | ------------ |
| 1. KnowledgeIngestor ADRs            | Task 2       |
| 2. KnowledgeIngestor learnings       | Task 2       |
| 3. KnowledgeIngestor failures        | Task 2       |
| 4. GitIngestor commits + co-change   | Task 3       |
| 5. FusionLayer keyword + semantic    | Task 4       |
| 6. FusionLayer keyword-only fallback | Task 4       |
| 7. Tests pass                        | Task 7       |
| 8. Build succeeds                    | Task 7       |
