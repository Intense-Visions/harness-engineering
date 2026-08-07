import { describe, it, expect } from 'vitest';
import { GraphStore } from '../store/GraphStore.js';
import { CanaryResultsIngestor, type CanaryRunRecordInput } from './CanaryResultsIngestor.js';

describe('CanaryResultsIngestor', () => {
  it('writes one run node + one test node per embedded test, with tested_by only on a resolved file node', () => {
    const store = new GraphStore();
    // Pre-seed a file node so the passing test's test_file resolves.
    store.addNode({ id: 'file:src/foo.test.ts', type: 'file', name: 'foo.test.ts', metadata: {} });

    const records: CanaryRunRecordInput[] = [
      {
        run_id: 'run-1',
        timestamp: '2026-08-07T00:00:00Z',
        exit_code: 0,
        passed: 1,
        failed: 0,
        flaky: 0,
        skipped: 0,
        tests: [
          {
            name: 'foo works',
            status: 'passed',
            test_file: 'src/foo.test.ts',
            retry_count: 0,
            flaky: false,
          },
        ],
      },
    ];

    const result = new CanaryResultsIngestor(store, records).ingest();

    // Run node.
    const runNode = store.getNode('test_result:canary-run:run-1');
    expect(runNode).not.toBeNull();
    expect(runNode!.type).toBe('test_result');
    expect(runNode!.metadata).toMatchObject({
      source: 'canary',
      kind: 'run',
      exitCode: 0,
      passed: 1,
    });

    // Per-test node carries status/failure_category/retry_count/flaky.
    const testNode = store.getNode('test_result:canary-test:run-1:foo works');
    expect(testNode).not.toBeNull();
    expect(testNode!.metadata).toMatchObject({
      source: 'canary',
      kind: 'test',
      status: 'passed',
      retryCount: 0,
      flaky: false,
    });

    // tested_by edge to the seeded file node.
    const testedBy = store.getEdges({
      from: 'test_result:canary-test:run-1:foo works',
      type: 'tested_by',
    });
    expect(testedBy).toHaveLength(1);
    expect(testedBy[0]!.to).toBe('file:src/foo.test.ts');

    // No failed_in for a passing test.
    const failedIn = store.getEdges({
      from: 'test_result:canary-test:run-1:foo works',
      type: 'failed_in',
    });
    expect(failedIn).toHaveLength(0);

    // Exact counts: 1 run + 1 test node, 1 tested_by edge.
    expect(result.nodesAdded).toBe(2);
    expect(result.edgesAdded).toBe(1);
    expect(result.nodesUpdated).toBe(0);
    expect(result.edgesUpdated).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('adds a failed_in edge from a failing per-test node to its run node', () => {
    const store = new GraphStore();
    const records: CanaryRunRecordInput[] = [
      {
        run_id: 'run-2',
        tests: [{ name: 'boom', status: 'failed', failure_category: 'assertion', retry_count: 2 }],
      },
    ];

    const result = new CanaryResultsIngestor(store, records).ingest();

    const failedIn = store.getEdges({
      from: 'test_result:canary-test:run-2:boom',
      type: 'failed_in',
    });
    expect(failedIn).toHaveLength(1);
    expect(failedIn[0]!.to).toBe('test_result:canary-run:run-2');

    const testNode = store.getNode('test_result:canary-test:run-2:boom');
    expect(testNode!.metadata).toMatchObject({
      status: 'failed',
      failureCategory: 'assertion',
      retryCount: 2,
    });

    // 2 nodes, 1 failed_in edge (no tested_by since no file node).
    expect(result.nodesAdded).toBe(2);
    expect(result.edgesAdded).toBe(1);
  });

  it('adds no tested_by edge when the test_file does not resolve to an existing node', () => {
    const store = new GraphStore();
    const records: CanaryRunRecordInput[] = [
      {
        run_id: 'run-3',
        tests: [{ name: 'orphan', status: 'passed', test_file: 'src/missing.test.ts' }],
      },
    ];

    const result = new CanaryResultsIngestor(store, records).ingest();

    const testedBy = store.getEdges({
      from: 'test_result:canary-test:run-3:orphan',
      type: 'tested_by',
    });
    expect(testedBy).toHaveLength(0);
    // Run + test node only, no edges (passing + unresolved file).
    expect(result.nodesAdded).toBe(2);
    expect(result.edgesAdded).toBe(0);
  });

  it('resolves a test_file to a module node when no file node exists', () => {
    const store = new GraphStore();
    store.addNode({ id: 'module:src/pkg', type: 'module', name: 'pkg', metadata: {} });
    const records: CanaryRunRecordInput[] = [
      { run_id: 'run-4', tests: [{ name: 't', status: 'passed', test_file: 'src/pkg' }] },
    ];

    new CanaryResultsIngestor(store, records).ingest();

    const testedBy = store.getEdges({ from: 'test_result:canary-test:run-4:t', type: 'tested_by' });
    expect(testedBy).toHaveLength(1);
    expect(testedBy[0]!.to).toBe('module:src/pkg');
  });

  it('is a no-op on empty records (0 nodes, no throw)', () => {
    const store = new GraphStore();
    const result = new CanaryResultsIngestor(store, []).ingest();
    expect(result.nodesAdded).toBe(0);
    expect(result.edgesAdded).toBe(0);
    expect(store.nodeCount).toBe(0);
    expect(result.errors).toEqual([]);
  });
});
