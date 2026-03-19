# Plan: Tier-2 Skills & Remaining Connectors (Phase 9 of 10)

**Date:** 2026-03-18
**Spec:** .harness/architecture/graph-context-system/ADR-001.md
**Estimated tasks:** 8
**Estimated time:** 40-60 minutes

## Goal

Update 5 Tier-2 skill SKILL.md files with graph-aware context gathering notes, and implement 2 new graph connectors (ConfluenceConnector, CIConnector) following the established connector architecture from Phase 3.

## Observable Truths (Acceptance Criteria)

1. When the 5 Tier-2 skill SKILL.md files are reviewed, they shall contain "Graph-Enhanced Context" sections with skill-specific graph tool recommendations.
2. When `ConfluenceConnector.ingest()` is called with config containing `apiKeyEnv` and `spaceKey`, the system shall create `document` nodes linked to code via keyword matching. If the API key env var is missing, it shall return an error in IngestResult without throwing.
3. When `CIConnector.ingest()` is called with config containing `apiKeyEnv` and `repo`, the system shall create `build` and `test_result` nodes linked to code via file path matching. If the API key env var is missing, it shall return an error without throwing.
4. When connectors are registered with SyncManager and synced, results shall include nodes/edges added counts.
5. `pnpm test --filter @harness-engineering/graph` passes with all new tests.
6. `pnpm build --filter @harness-engineering/graph` succeeds.

## [ADDED] New Artifacts

- [ADDED] `ConfluenceConnector` in packages/graph — ingests Confluence pages as `document` nodes
- [ADDED] `CIConnector` in packages/graph — ingests CI build/test results as `build` and `test_result` nodes

## [MODIFIED] Changes to Existing Behavior

- [MODIFIED] `packages/graph/src/index.ts` — export ConfluenceConnector, CIConnector
- [MODIFIED] 5 Tier-2 skill SKILL.md files — add graph-aware context gathering notes

## File Map

```
CREATE packages/graph/src/ingest/connectors/ConfluenceConnector.ts
CREATE packages/graph/tests/ingest/connectors/ConfluenceConnector.test.ts
CREATE packages/graph/src/ingest/connectors/CIConnector.ts
CREATE packages/graph/tests/ingest/connectors/CIConnector.test.ts
MODIFY packages/graph/src/index.ts (export new connectors)
MODIFY agents/skills/claude-code/harness-execution/SKILL.md (graph notes)
MODIFY agents/skills/claude-code/harness-planning/SKILL.md (graph notes)
MODIFY agents/skills/claude-code/harness-architecture-advisor/SKILL.md (graph notes)
MODIFY agents/skills/claude-code/harness-refactoring/SKILL.md (graph notes)
MODIFY agents/skills/claude-code/align-documentation/SKILL.md (graph notes)
```

## Tasks

### Task 1: Implement ConfluenceConnector (TDD)

**Depends on:** none
**Files:** packages/graph/src/ingest/connectors/ConfluenceConnector.ts, packages/graph/tests/ingest/connectors/ConfluenceConnector.test.ts

1. Write tests first with mock HTTP client. Test cases:
   - Creates `document` nodes from Confluence pages with correct metadata (title, spaceKey, status)
   - Links documents to code nodes via `linkToCode` keyword matching
   - Returns error in IngestResult when API key env var is missing (no throw)
   - Handles pagination (Confluence uses `start` + `limit` pagination)

2. Implement `ConfluenceConnector` following JiraConnector pattern:

   ```typescript
   export class ConfluenceConnector implements GraphConnector {
     readonly name = 'confluence';
     readonly source = 'confluence';
     private readonly httpClient: HttpClient;

     constructor(httpClient?: HttpClient) {
       this.httpClient = httpClient ?? ((url, options) => fetch(url, options));
     }

     async ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult> {
       // Read API key from env
       // Fetch pages from Confluence REST API: /wiki/api/v2/pages?spaceId=<id>&limit=25
       // For each page: create document node with { title, spaceKey, url, status }
       // Link to code via linkToCode(store, node, pageTitle + bodyText)
       // Return IngestResult
     }
   }
   ```

   Config shape: `{ apiKeyEnv, baseUrlEnv, spaceKey }`

3. Run tests: `cd packages/graph && npx vitest run tests/ingest/connectors/ConfluenceConnector.test.ts`
4. Commit: `feat(graph): add ConfluenceConnector for documentation ingestion`

---

### Task 2: Implement CIConnector (TDD)

**Depends on:** none
**Files:** packages/graph/src/ingest/connectors/CIConnector.ts, packages/graph/tests/ingest/connectors/CIConnector.test.ts

1. Write tests first with mock HTTP client. Test cases:
   - Creates `build` nodes from CI workflow runs with metadata (status, conclusion, branch)
   - Creates `test_result` nodes from test failures
   - Links failed tests to code nodes via file path matching
   - Links builds to commit nodes via SHA matching
   - Returns error in IngestResult when API key env var is missing (no throw)

2. Implement `CIConnector` following JiraConnector pattern:

   ```typescript
   export class CIConnector implements GraphConnector {
     readonly name = 'ci';
     readonly source = 'github-actions';
     private readonly httpClient: HttpClient;

     constructor(httpClient?: HttpClient) {
       this.httpClient = httpClient ?? ((url, options) => fetch(url, options));
     }

     async ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult> {
       // Read API key from env (GITHUB_TOKEN)
       // Fetch workflow runs: GET /repos/{owner}/{repo}/actions/runs?per_page=10
       // For each run: create build node with { status, conclusion, branch, sha }
       // Link build to commit node via SHA: build --triggered_by--> commit
       // If conclusion === 'failure': create test_result nodes
       //   Link failures to code: test_result --failed_in--> file
       // Return IngestResult
     }
   }
   ```

   Config shape: `{ apiKeyEnv, repo, maxRuns? }`

3. Run tests: `cd packages/graph && npx vitest run tests/ingest/connectors/CIConnector.test.ts`
4. Commit: `feat(graph): add CIConnector for build/test result ingestion`

---

### Task 3: Export new connectors from graph package

**Depends on:** Tasks 1, 2
**Files:** packages/graph/src/index.ts

1. Add exports:

   ```typescript
   export { ConfluenceConnector } from './ingest/connectors/ConfluenceConnector.js';
   export { CIConnector } from './ingest/connectors/CIConnector.js';
   ```

2. Run build: `pnpm --filter @harness-engineering/graph build`
3. Commit: `feat(graph): export ConfluenceConnector and CIConnector`

---

### Task 4: Update 5 Tier-2 skill SKILL.md files with graph notes

**Depends on:** none
**Files:** 5 SKILL.md files in agents/skills/claude-code/

1. For each skill, add a "Graph-Enhanced Context" subsection after the context gathering section:

   **harness-execution**:
   - `query_graph` — check file overlap between current and next task for conflict detection
   - `get_impact` — understand blast radius before executing a task
   - Note: Enables smarter execution ordering and blockage detection

   **harness-planning**:
   - `query_graph` — discover module dependencies for realistic task decomposition
   - `get_impact` — estimate which modules a feature touches and their dependencies
   - Note: Enables accurate effort estimation and sequencing

   **harness-architecture-advisor**:
   - `query_graph` — discover how similar features are structured in the codebase
   - `search_similar` — find analogous patterns and implementations
   - Note: Replaces manual Glob/Grep exploration with graph pattern discovery

   **harness-refactoring**:
   - `get_impact` — precise impact analysis: "if I move this function, what breaks?"
   - `query_graph` — find all transitive consumers, not just direct importers
   - Note: Catches indirect consumers that grep misses

   **align-documentation**:
   - `query_graph` — find `documents` edges pointing to nodes changed in this diff
   - `get_impact` — auto-suggest which docs need updating after code changes
   - Note: Replaces manual doc-to-code correlation

2. Commit: `docs(skills): add graph-aware context gathering notes to Tier-2 skills`

---

### Task 5: Run full graph test suite

**Depends on:** Tasks 1, 2, 3
**Files:** none (verification)

1. Run: `cd packages/graph && npx vitest run`
2. Verify all tests pass (168 existing + new connector tests)
3. Run: `pnpm --filter @harness-engineering/graph build`
4. Verify build succeeds

---

### Task 6: Run full test suite verification

**Depends on:** Task 5
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `cd packages/graph && npx vitest run`
2. Run: `cd packages/core && npx vitest run`
3. Run: `cd packages/mcp-server && npx vitest run`
4. Run: `pnpm --filter @harness-engineering/graph build`
5. Observe: all pass
6. Commit: `chore: verify Phase 9 build and tests`

---

## Dependency Graph

```
Task 1 (ConfluenceConnector) ──→ Task 3 (exports) ──→ Task 5 (graph tests) ──→ Task 6 (verify)
Task 2 (CIConnector) ──→ Task 3 ──→│
Task 4 (Tier-2 skill SKILL.md updates) ──→ Task 6
```

**Parallelizable:**

- Tasks 1, 2, 4 (all independent — different files/packages)

## Traceability Matrix

| Observable Truth                 | Delivered By |
| -------------------------------- | ------------ |
| 1. Tier-2 skill SKILL.md updates | Task 4       |
| 2. ConfluenceConnector           | Task 1       |
| 3. CIConnector                   | Task 2       |
| 4. SyncManager integration       | Tasks 1, 2   |
| 5. Graph tests pass              | Task 6       |
| 6. Graph build succeeds          | Task 6       |
