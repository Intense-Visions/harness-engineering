# Plan: Phase 2 — `CanaryResultsIngestor` + `ingest_source` `test-results` branch

**Date:** 2026-08-07 | **Spec:** `docs/changes/canary-results-ingest/proposal.md` | **Tasks:** 5 | **Time:** ~22 min | **Integration Tier:** large | **Depends on:** Phase 1

## Phase Overview

Turn canary `CanaryRunRecord[]` (supplied by the CLI layer, which reads them via the Phase 1 adapter) into knowledge-graph nodes/edges. A new `CanaryResultsIngestor` in `packages/graph/src/ingest/CanaryResultsIngestor.ts` mirrors `CIConnector`'s node-writing shape (`store.addNode`/`store.addEdge` → `IngestResult`) and writes:

- one `test_result` node **per run** (carrying `exit_code`/`passed`/`failed`/`flaky`/`skipped` in metadata);
- one `test_result` node **per embedded test** (carrying `status`/`failure_category`/`retry_count`/`flaky`);
- `--tested_by-->` edge from each per-test node to the resolved `file`/`module` node (only when `test_file` resolves to an existing node);
- `--failed_in-->` edge from each failing per-test node to its run node.

**Hard boundary:** `CanaryResultsIngestor` lives in `@harness-engineering/graph` and **MUST NOT import canary or the adapter**. Records are passed into the constructor. The `ingest_source` handler (CLI/MCP layer) reads records via `createCanaryAdapter().readRunHistory()` and drives the ingestor — that is the only place canary coupling touches graph ingest.

**No schema bump:** Verified in `packages/graph/src/types.ts` — `test_result` node (line 27), `tested_by` (line 92), `failed_in` (line 79) all already exist in `NODE_TYPES`/`EDGE_TYPES`. No `NODE_TYPES`/`EDGE_TYPES` edit → no graph schema-version bump (avoids the rebuild/commit-hang hazard).

Grounding facts:

- `CIConnector` (`packages/graph/src/ingest/connectors/CIConnector.ts`) is the shape to mirror: `store.addNode({ id, type, name, metadata })`, `store.addEdge({ from, to, type })`, `emptyResult(errors, start)`, returns `IngestResult` (`nodesAdded/nodesUpdated/edgesAdded/edgesUpdated/errors/durationMs`, `packages/graph/src/types.ts:173`).
- Graph barrel `packages/graph/src/index.ts` exports ingestors (e.g. `CIConnector` line 122). Add `CanaryResultsIngestor` there.
- `ingest_source` handler: `packages/cli/src/mcp/tools/graph/ingest-source.ts` — `source` enum (line 15), branch structure (lines 44-79), combined `IngestResult` reduce (lines 85-96). Dynamic `await import('@harness-engineering/graph')` (line 31).

## Observable Truths (Acceptance Criteria)

1. `new CanaryResultsIngestor(store, records).ingest()` creates one `test_result` node per run + one per embedded test, with `status`/`failure_category`/`retry_count`/`flaky` in per-test metadata.
2. A per-test node gets a `--tested_by-->` edge to a `file`/`module` node **only when** `test_file` resolves to an existing node; unresolved `test_file` adds no edge (no dangling edge).
3. A failing per-test node (`status` not `passed`) gets a `--failed_in-->` edge to its run node.
4. `ingest()` returns a well-formed `IngestResult` with accurate `nodesAdded`/`edgesAdded`.
5. `ingest_source({ source: 'test-results' })` drives the ingestor from adapter-read records and is a **no-op** (0 nodes, no throw) when no history file exists (adapter returns `[]`).
6. `CanaryResultsIngestor` has zero import of `canary`/`@harness-engineering/intelligence` (boundary preserved).

## File Map

- CREATE `packages/graph/src/ingest/CanaryResultsIngestor.ts`
- CREATE `packages/graph/src/ingest/CanaryResultsIngestor.test.ts`
- MODIFY `packages/graph/src/index.ts` (barrel export `CanaryResultsIngestor` + its record types)
- MODIFY `packages/cli/src/mcp/tools/graph/ingest-source.ts` (add `test-results` to source enum + branch)
- MODIFY `packages/cli/src/mcp/tools/graph/ingest-source.test.ts` (or nearest existing test) — no-op + drive-through cases
- CREATE `.changeset/canary-results-ingestor.md` (`@harness-engineering/graph` minor, `@harness-engineering/cli` patch)

## Tasks

### Task 1: Define the ingestor's record input types (graph-local, no canary import)

**Depends on:** none (Phase 1 merged) | **Files:** `packages/graph/src/ingest/CanaryResultsIngestor.ts`

**Inputs:** The `CanaryRunRecord`/`CanaryTestResult` **shape** from Phase 1 — but graph MUST NOT import intelligence. Declare a structurally-compatible local input interface so records passed by the CLI satisfy it by shape.

**Outputs / files touched:**

- CREATE `CanaryResultsIngestor.ts` with the input contract at the top:

  ```ts
  import type { GraphStore } from '../store/GraphStore.js';
  import type { IngestResult } from '../types.js';

  /**
   * Structural input for CanaryResultsIngestor. Declared locally (NOT imported
   * from @harness-engineering/intelligence) so @harness-engineering/graph carries
   * zero canary coupling — the CLI layer reads records via the adapter and passes
   * them in, and they satisfy this shape structurally.
   */
  export interface CanaryTestResultInput {
    name: string;
    status: string;
    test_file?: string;
    failure_category?: string;
    retry_count?: number;
    flaky?: boolean;
  }
  export interface CanaryRunRecordInput {
    run_id?: string;
    timestamp?: string;
    exit_code?: number;
    passed?: number;
    failed?: number;
    flaky?: number;
    skipped?: number;
    tests?: CanaryTestResultInput[];
  }
  ```

**Implementation notes:** Keep field names identical to Phase 1's zod schema so the CLI passes `CanaryRunRecord[]` directly. Structural typing means no runtime coupling. Do NOT add `import ... intelligence` anywhere in this file.

**Verification (type-only at this stage):**

```
npx tsc -p packages/graph/tsconfig.json --noEmit
```

### Task 2: Implement `CanaryResultsIngestor.ingest()` (mirror CIConnector node/edge shape)

**Depends on:** Task 1 | **Files:** `packages/graph/src/ingest/CanaryResultsIngestor.ts`, `packages/graph/src/ingest/CanaryResultsIngestor.test.ts`

**Inputs:** `GraphStore`, `CanaryRunRecordInput[]`. Reuse existing `test_result` node type + `tested_by`/`failed_in` edges.

**Outputs / files touched:**

- MODIFY `CanaryResultsIngestor.ts` — add the class, mirroring `CIConnector`'s counting + `emptyResult` pattern:

  ```ts
  export class CanaryResultsIngestor {
    constructor(
      private readonly store: GraphStore,
      private readonly records: readonly CanaryRunRecordInput[]
    ) {}

    ingest(): IngestResult {
      const start = Date.now();
      const errors: string[] = [];
      let nodesAdded = 0;
      let edgesAdded = 0;

      this.records.forEach((run, idx) => {
        const runKey = run.run_id ?? run.timestamp ?? String(idx);
        const runNodeId = `test_result:canary-run:${runKey}`;
        this.store.addNode({
          id: runNodeId,
          type: 'test_result',
          name: `canary run ${runKey}`,
          metadata: {
            source: 'canary',
            kind: 'run',
            runId: run.run_id,
            timestamp: run.timestamp,
            exitCode: run.exit_code,
            passed: run.passed,
            failed: run.failed,
            flaky: run.flaky,
            skipped: run.skipped,
          },
        });
        nodesAdded++;

        for (const [tIdx, test] of (run.tests ?? []).entries()) {
          const testNodeId = `test_result:canary-test:${runKey}:${test.name || tIdx}`;
          this.store.addNode({
            id: testNodeId,
            type: 'test_result',
            name: `${test.status}: ${test.name}`,
            metadata: {
              source: 'canary',
              kind: 'test',
              runId: run.run_id,
              status: test.status,
              testFile: test.test_file,
              failureCategory: test.failure_category,
              retryCount: test.retry_count,
              flaky: test.flaky,
            },
          });
          nodesAdded++;

          // tested_by → file/module, only when the path resolves to a known node.
          const fileNode = this.resolveFileNode(test.test_file);
          if (fileNode) {
            this.store.addEdge({ from: testNodeId, to: fileNode, type: 'tested_by' });
            edgesAdded++;
          }

          // failed_in → run node for any non-passing test.
          if (test.status !== 'passed') {
            this.store.addEdge({ from: testNodeId, to: runNodeId, type: 'failed_in' });
            edgesAdded++;
          }
        }
      });

      return {
        nodesAdded,
        nodesUpdated: 0,
        edgesAdded,
        edgesUpdated: 0,
        errors,
        durationMs: Date.now() - start,
      };
    }

    /** Resolve a test_file path to an existing file/module node id, or undefined. */
    private resolveFileNode(testFile?: string): string | undefined {
      if (!testFile) return undefined;
      // Try the conventional file: id first, then a module: id; both must EXIST
      // in the graph (no dangling edges — mirrors CIConnector's getNode guard).
      for (const candidate of [`file:${testFile}`, `module:${testFile}`]) {
        if (this.store.getNode(candidate)) return candidate;
      }
      return undefined;
    }
  }
  ```

**Implementation notes:** Mirror `CIConnector` exactly for the `getNode` existence guard before adding an edge (CIConnector line 57-61) — this is what prevents dangling `tested_by` edges (Truth 2). Confirm the actual `file`/`module` node id convention used by `CodeIngestor` when wiring `resolveFileNode` (the `file:<relpath>` form is the CIConnector-style assumption; adjust the candidate prefixes to match `CodeIngestor`'s scheme discovered while reading it). `GraphStore.addNode` upserts by id, so re-ingesting the same run is idempotent (would count as update, not duplicate). Node/edge types are string-literals from the existing unions — no `NODE_TYPES`/`EDGE_TYPES` edit.

**Verification:** Write `CanaryResultsIngestor.test.ts` first (TDD) using a real `GraphStore`: (a) pre-seed a `file:src/foo.test.ts` node, ingest a run with one passing test whose `test_file` is `src/foo.test.ts` → run node + test node + `tested_by` edge, no `failed_in`; (b) a failing test → `failed_in` edge to run node; (c) unresolved `test_file` → no `tested_by` edge; (d) `nodesAdded`/`edgesAdded` counts exact; (e) empty `records: []` → 0 nodes, no throw. Run:

```
npx vitest run packages/graph/src/ingest/CanaryResultsIngestor.test.ts
```

### Task 3: Export `CanaryResultsIngestor` from the graph barrel

**Depends on:** Task 2 | **Files:** `packages/graph/src/index.ts`

**Inputs:** New class + input types.

**Outputs / files touched:**

- MODIFY `packages/graph/src/index.ts` — beside the other ingestor exports (near line 46-57), add:
  ```ts
  export { CanaryResultsIngestor } from './ingest/CanaryResultsIngestor.js';
  export type {
    CanaryRunRecordInput,
    CanaryTestResultInput,
  } from './ingest/CanaryResultsIngestor.js';
  ```

**Implementation notes:** Place it with the top-level ingestors (CodeIngestor/GitIngestor block), not the `connectors` block, since the file lives in `ingest/` not `ingest/connectors/`. This is what makes it importable by the `ingest_source` handler's `await import('@harness-engineering/graph')`.

**Verification:**

```
npx tsc -p packages/graph/tsconfig.json --noEmit
```

### Task 4: Wire the `test-results` branch into `ingest_source` (adapter read in CLI layer)

**Depends on:** Task 3 | **Files:** `packages/cli/src/mcp/tools/graph/ingest-source.ts`

**Inputs:** `CanaryResultsIngestor` (graph barrel) + `createCanaryAdapter` (`@harness-engineering/intelligence`).

**Outputs / files touched:**

- MODIFY `ingest-source.ts`:
  1. Add `'test-results'` to the `source` enum in `ingestSourceDefinition` (line 15) and to the `input.source` union type (line 24-25). Update the description to mention canary test results.
  2. Add a branch (after the `diagrams` branch, before `store.save`, lines 74-79 region):
     ```ts
     if (input.source === 'test-results' || input.source === 'all') {
       // Canary coupling stays in the CLI layer: read records via the adapter,
       // then drive the graph-only ingestor (graph imports NO canary).
       const { createCanaryAdapter } = await import('@harness-engineering/intelligence');
       const { CanaryResultsIngestor } = await import('@harness-engineering/graph');
       const records = await createCanaryAdapter().readRunHistory({ cwd: projectPath });
       const canaryResult = new CanaryResultsIngestor(store, records).ingest();
       results.push(canaryResult);
     }
     ```

**Implementation notes:** The adapter is total — `readRunHistory` returns `[]` when no store exists, so the ingestor runs on `[]` and adds 0 nodes (the no-op, Truth 5). This keeps the whole branch degrade-safe with no extra guards. Confirm `@harness-engineering/intelligence` is a dependency of `packages/cli` (Phase 1 already imports it in `tools/canary.ts`, so it is). Do NOT add canary to `@harness-engineering/graph`'s deps.

**Verification:**

```
npx tsc -p packages/cli/tsconfig.json --noEmit
```

### Task 5: `ingest_source` no-op + drive-through test, changeset, docs (Phase 5 DoD fold-in)

**Depends on:** Task 4 | **Files:** `packages/cli/src/mcp/tools/graph/ingest-source.test.ts` (or nearest), `.changeset/canary-results-ingestor.md`, `docs/knowledge/graph/node-edge-taxonomy.md`

**Inputs:** Wired handler + ingestor.

**Outputs / files touched:**

- MODIFY/CREATE the `ingest-source` test — assert `ingest_source({ path, source: 'test-results' })` in a temp project **without** `test-results/reports/history-v2.jsonl` returns a combined result with `nodesAdded: 0` and does not throw (Truth 5). (If a full handler test is too heavy, cover the branch via a unit test that injects a fake adapter returning `[]` and a fake returning records, asserting the ingestor is driven.)
- CREATE `.changeset/canary-results-ingestor.md`:

  ```md
  ---
  '@harness-engineering/graph': minor
  '@harness-engineering/cli': patch
  ---

  Add `CanaryResultsIngestor` — turns canary run history into `test_result` nodes
  (per run + per test) with `tested_by`/`failed_in` edges, reusing existing graph
  node/edge types (no schema bump). Wire `ingest_source({ source: 'test-results' })`
  to read records via the canary adapter (CLI layer) and drive the graph-only
  ingestor; a no-op when canary has produced no results.
  ```

- MODIFY `docs/knowledge/graph/node-edge-taxonomy.md` — add canary to the Ingestor Responsibility Map as a `test_result` producer (run + per-test), noting `tested_by`/`failed_in` edges and the graph-imports-no-canary boundary.

**Implementation notes:** No `NODE_TYPES`/`EDGE_TYPES` change means `.harness/arch/baselines.json` and the graph schema version stay untouched — verify this explicitly in the DoD.

**Verification:**

```
npx vitest run packages/cli/src/mcp/tools/graph/ingest-source.test.ts
harness validate
npx prettier --check ".changeset/canary-results-ingestor.md" "docs/knowledge/graph/node-edge-taxonomy.md"
```

## Dependency Ordering

- Task 1 (record types) → Task 2 (ingestor impl + tests) → Task 3 (graph barrel) → Task 4 (`ingest_source` wiring) → Task 5 (handler test + changeset + docs).
- Linear. Task 4 depends on both Task 3 (graph barrel export) and Phase 1's `readRunHistory` being on the published adapter.

## Verification / Definition of Done

- [ ] `npx vitest run packages/graph/src/ingest/CanaryResultsIngestor.test.ts` — run/test nodes, `tested_by` only on resolved paths, `failed_in` on failures, exact counts, empty-input no-op (Truths 1-4).
- [ ] `ingest_source({ source: 'test-results' })` no-op with no history file (Truth 5).
- [ ] `grep -rn "canary\|intelligence" packages/graph/src/ingest/CanaryResultsIngestor.ts` returns nothing → boundary preserved (Truth 6).
- [ ] `NODE_TYPES`/`EDGE_TYPES` in `packages/graph/src/types.ts` unchanged; graph schema version unchanged.
- [ ] `npx tsc -p packages/graph/tsconfig.json --noEmit` and `npx tsc -p packages/cli/tsconfig.json --noEmit` clean.
- [ ] `harness validate` exit 0; `.harness/arch/baselines.json` byte-identical to origin/main.
- [ ] Changeset present (`@harness-engineering/graph` minor, `@harness-engineering/cli` patch); `node-edge-taxonomy.md` updated; `format:check` clean.
