import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import {
  GraphFeedbackAdapter,
  type GraphImpactData,
  type GraphHarnessCheckData,
} from '../../src/feedback/GraphFeedbackAdapter.js';

describe('GraphFeedbackAdapter', () => {
  let store: GraphStore;
  let adapter: GraphFeedbackAdapter;

  // File paths used across tests
  const HANDLER = '/project/src/api/handler.ts';
  const USER = '/project/src/domain/user.ts';
  const UTILS = '/project/src/shared/utils.ts';
  const INDEX = '/project/src/index.ts';
  const TEST_HANDLER = '/project/tests/api/handler.test.ts';
  const DOC_API_GUIDE = 'doc:api-guide';

  function seedGraph(): void {
    // File nodes
    store.addNode({
      id: `file:${HANDLER}`,
      type: 'file',
      name: 'handler.ts',
      path: HANDLER,
      metadata: {},
    });
    store.addNode({
      id: `file:${USER}`,
      type: 'file',
      name: 'user.ts',
      path: USER,
      metadata: {},
    });
    store.addNode({
      id: `file:${UTILS}`,
      type: 'file',
      name: 'utils.ts',
      path: UTILS,
      metadata: {},
    });
    store.addNode({
      id: `file:${INDEX}`,
      type: 'file',
      name: 'index.ts',
      path: INDEX,
      metadata: {},
    });

    // Test file node
    store.addNode({
      id: `file:${TEST_HANDLER}`,
      type: 'file',
      name: 'handler.test.ts',
      path: TEST_HANDLER,
      metadata: {},
    });

    // Doc node
    store.addNode({
      id: DOC_API_GUIDE,
      type: 'document',
      name: 'api-guide',
      metadata: {},
    });

    // Imports edges: handler -> user, user -> utils
    store.addEdge({
      from: `file:${HANDLER}`,
      to: `file:${USER}`,
      type: 'imports',
    });
    store.addEdge({
      from: `file:${USER}`,
      to: `file:${UTILS}`,
      type: 'imports',
    });

    // Test imports handler: handler.test -> handler
    store.addEdge({
      from: `file:${TEST_HANDLER}`,
      to: `file:${HANDLER}`,
      type: 'imports',
    });

    // Doc documents handler: api-guide -> handler
    store.addEdge({
      from: DOC_API_GUIDE,
      to: `file:${HANDLER}`,
      type: 'documents',
    });

    // Violates edge for constraint testing: handler violates some constraint
    store.addEdge({
      from: `file:${HANDLER}`,
      to: `file:${UTILS}`,
      type: 'violates',
    });
  }

  beforeEach(() => {
    store = new GraphStore();
    adapter = new GraphFeedbackAdapter(store);
  });

  describe('computeImpactData', () => {
    it('returns affected tests for files connected via inbound imports edges with "test" in path', () => {
      seedGraph();
      const result = adapter.computeImpactData([HANDLER]);

      expect(result.affectedTests).toHaveLength(1);
      expect(result.affectedTests[0]).toEqual({
        testFile: TEST_HANDLER,
        coversFile: HANDLER,
      });
    });

    it('returns affected docs for files connected via inbound documents edges', () => {
      seedGraph();
      const result = adapter.computeImpactData([HANDLER]);

      expect(result.affectedDocs).toHaveLength(1);
      expect(result.affectedDocs[0]).toEqual({
        docFile: 'api-guide',
        documentsFile: HANDLER,
      });
    });

    it('returns impact scope as count of downstream dependent nodes via inbound imports edges', () => {
      seedGraph();
      // handler has 1 inbound imports edge (from handler.test)
      const result = adapter.computeImpactData([HANDLER]);
      expect(result.impactScope).toBe(1);
    });

    it('accumulates impact scope across multiple changed files', () => {
      seedGraph();
      // handler has 1 inbound imports (handler.test), user has 1 inbound imports (handler)
      const result = adapter.computeImpactData([HANDLER, USER]);
      expect(result.impactScope).toBe(2);
    });

    it('returns empty arrays for files not in graph', () => {
      seedGraph();
      const result = adapter.computeImpactData(['/project/src/unknown.ts']);

      expect(result.affectedTests).toHaveLength(0);
      expect(result.affectedDocs).toHaveLength(0);
      expect(result.impactScope).toBe(0);
    });

    it('handles empty changedFiles array', () => {
      seedGraph();
      const result = adapter.computeImpactData([]);

      expect(result.affectedTests).toHaveLength(0);
      expect(result.affectedDocs).toHaveLength(0);
      expect(result.impactScope).toBe(0);
    });

    it('does not count non-test importers as affected tests', () => {
      seedGraph();
      // user imports utils, but user is not a test file
      const result = adapter.computeImpactData([UTILS]);

      expect(result.affectedTests).toHaveLength(0);
      // user imports utils, so impactScope should be 1
      expect(result.impactScope).toBe(1);
    });
  });

  describe('computeHarnessCheckData', () => {
    it('returns graphExists true with correct node and edge counts', () => {
      seedGraph();
      const result = adapter.computeHarnessCheckData();

      expect(result.graphExists).toBe(true);
      expect(result.nodeCount).toBe(store.nodeCount);
      expect(result.edgeCount).toBe(store.edgeCount);
    });

    it('returns undocumentedFiles count (file nodes with no inbound documents edge)', () => {
      seedGraph();
      const result = adapter.computeHarnessCheckData();

      // handler has a documents edge, but user, utils, index, handler.test do not
      expect(result.undocumentedFiles).toBe(4);
    });

    it('returns unreachableNodes count (file nodes with no inbound imports and not index.ts)', () => {
      seedGraph();
      const result = adapter.computeHarnessCheckData();

      // handler has inbound imports (from handler.test), user has inbound (from handler),
      // utils has inbound (from user), index.ts is entry point (excluded).
      // handler.test has NO inbound imports and is not index.ts -> unreachable
      expect(result.unreachableNodes).toBe(1);
    });

    it('returns constraintViolations count (edges of type violates)', () => {
      seedGraph();
      const result = adapter.computeHarnessCheckData();

      expect(result.constraintViolations).toBe(1);
    });

    it('handles empty graph', () => {
      const result = adapter.computeHarnessCheckData();

      expect(result.graphExists).toBe(true);
      expect(result.nodeCount).toBe(0);
      expect(result.edgeCount).toBe(0);
      expect(result.constraintViolations).toBe(0);
      expect(result.undocumentedFiles).toBe(0);
      expect(result.unreachableNodes).toBe(0);
    });

    it('does not count index.ts files as unreachable even without inbound imports', () => {
      seedGraph();
      // index.ts has no inbound imports but should not be counted as unreachable
      const result = adapter.computeHarnessCheckData();

      // Only handler.test.ts should be unreachable
      expect(result.unreachableNodes).toBe(1);
    });

    it('counts multiple violates edges', () => {
      seedGraph();
      store.addEdge({
        from: `file:${USER}`,
        to: `file:${HANDLER}`,
        type: 'violates',
      });

      const result = adapter.computeHarnessCheckData();
      expect(result.constraintViolations).toBe(2);
    });
  });
});
