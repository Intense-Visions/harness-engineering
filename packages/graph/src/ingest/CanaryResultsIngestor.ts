import type { GraphStore } from '../store/GraphStore.js';
import type { IngestResult } from '../types.js';

/**
 * Structural input for {@link CanaryResultsIngestor}. Declared locally (NOT
 * imported from `@harness-engineering/intelligence`) so `@harness-engineering/graph`
 * carries zero canary coupling — the CLI layer reads records via the canary adapter
 * and passes them in, and a `CanaryTestResult` satisfies this shape structurally.
 *
 * Field names mirror Phase 1's canary zod schema so a `CanaryRunRecord[]` is
 * assignable without any transform. `name`/`status` are optional (the adapter's
 * schema marks them optional + passthrough) so a record with a missing field never
 * fails the type check.
 */
export interface CanaryTestResultInput {
  // `| undefined` is explicit so a `CanaryRunRecord` (whose optionals are
  // `T | undefined` from zod's ZodOptional output) assigns cleanly under the
  // repo's `exactOptionalPropertyTypes: true`.
  name?: string | undefined;
  status?: string | undefined;
  test_file?: string | undefined;
  failure_category?: string | undefined;
  retry_count?: number | undefined;
  flaky?: boolean | undefined;
  suite?: string | undefined;
}

export interface CanaryRunRecordInput {
  run_id?: string | undefined;
  timestamp?: string | undefined;
  exit_code?: number | undefined;
  passed?: number | undefined;
  failed?: number | undefined;
  flaky?: number | undefined;
  skipped?: number | undefined;
  tests?: readonly CanaryTestResultInput[] | undefined;
}

/** Running node/edge tally, threaded through the module-level helpers. */
interface Counts {
  nodesAdded: number;
  edgesAdded: number;
}

/**
 * Resolve a `test_file` path to an existing `file:`/`module:` node id, or
 * undefined. Both candidates must EXIST in the graph (no dangling edges) — the
 * id conventions mirror `CodeIngestor` (`file:<relpath>`) and `TopologicalLinker`
 * (`module:<dir>`).
 */
function resolveFileNode(store: GraphStore, testFile?: string): string | undefined {
  if (!testFile) return undefined;
  for (const candidate of [`file:${testFile}`, `module:${testFile}`]) {
    if (store.getNode(candidate)) return candidate;
  }
  return undefined;
}

/** Write the per-run `test_result` node; returns its node id. */
function ingestRun(store: GraphStore, run: CanaryRunRecordInput, runKey: string): string {
  const runNodeId = `test_result:canary-run:${runKey}`;
  store.addNode({
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
  return runNodeId;
}

/**
 * Write one per-test `test_result` node plus its edges, mutating `counts`:
 * a `tested_by` edge to the resolved `file`/`module` node (guarded, no dangling
 * edges) and a `failed_in` edge to the run node for any non-passing test.
 */
function ingestTest(
  store: GraphStore,
  test: CanaryTestResultInput,
  ctx: { runId?: string | undefined; runKey: string; runNodeId: string; index: number },
  counts: Counts
): void {
  const testNodeId = `test_result:canary-test:${ctx.runKey}:${test.name || ctx.index}`;
  store.addNode({
    id: testNodeId,
    type: 'test_result',
    name: `${test.status ?? 'unknown'}: ${test.name ?? '(unnamed)'}`,
    metadata: {
      source: 'canary',
      kind: 'test',
      runId: ctx.runId,
      status: test.status,
      suite: test.suite,
      testFile: test.test_file,
      failureCategory: test.failure_category,
      retryCount: test.retry_count,
      flaky: test.flaky,
    },
  });
  counts.nodesAdded++;

  const fileNode = resolveFileNode(store, test.test_file);
  if (fileNode) {
    store.addEdge({ from: testNodeId, to: fileNode, type: 'tested_by' });
    counts.edgesAdded++;
  }

  if (test.status !== 'passed') {
    store.addEdge({ from: testNodeId, to: ctx.runNodeId, type: 'failed_in' });
    counts.edgesAdded++;
  }
}

/**
 * Turns canary run history (`CanaryRunRecordInput[]`, supplied by the CLI layer)
 * into knowledge-graph nodes/edges. Mirrors `CIConnector`'s node-writing shape:
 * `store.addNode`/`store.addEdge`, module-level helpers, and a well-formed
 * {@link IngestResult}.
 *
 * Writes, reusing existing graph node/edge types (no schema bump):
 * - one `test_result` node **per run** (`test_result:canary-run:<key>`);
 * - one `test_result` node **per embedded test** (`test_result:canary-test:<key>:<name>`);
 * - a `--tested_by-->` edge from each per-test node to the resolved `file`/`module`
 *   node — only when `test_file` resolves to an existing node (no dangling edges);
 * - a `--failed_in-->` edge from each non-passing per-test node to its run node.
 */
export class CanaryResultsIngestor {
  constructor(
    private readonly store: GraphStore,
    private readonly records: readonly CanaryRunRecordInput[]
  ) {}

  ingest(): IngestResult {
    const start = Date.now();
    const counts: Counts = { nodesAdded: 0, edgesAdded: 0 };

    this.records.forEach((run, idx) => {
      const runKey = run.run_id ?? run.timestamp ?? String(idx);
      const runNodeId = ingestRun(this.store, run, runKey);
      counts.nodesAdded++;

      (run.tests ?? []).forEach((test, tIdx) => {
        ingestTest(this.store, test, { runId: run.run_id, runKey, runNodeId, index: tIdx }, counts);
      });
    });

    return {
      nodesAdded: counts.nodesAdded,
      nodesUpdated: 0,
      edgesAdded: counts.edgesAdded,
      edgesUpdated: 0,
      errors: [],
      durationMs: Date.now() - start,
    };
  }
}
