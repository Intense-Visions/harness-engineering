import * as path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';
import { KnowledgeIngestor } from '../../src/ingest/KnowledgeIngestor.js';
import { GraphEntropyAdapter } from '../../src/entropy/GraphEntropyAdapter.js';
import type {
  GraphDriftData,
  GraphDeadCodeData,
  GraphSnapshotSummary,
} from '../../src/entropy/GraphEntropyAdapter.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

describe('GraphEntropyAdapter', () => {
  let store: GraphStore;
  let adapter: GraphEntropyAdapter;

  beforeEach(async () => {
    store = new GraphStore();

    // Ingest code from sample-project fixture
    const codeIngestor = new CodeIngestor(store);
    await codeIngestor.ingest(FIXTURE_DIR);

    // Ingest knowledge (ADRs create `documents` edges)
    const knowledgeIngestor = new KnowledgeIngestor(store);
    const adrDir = path.join(FIXTURE_DIR, 'docs', 'adr');
    await knowledgeIngestor.ingestADRs(adrDir);

    adapter = new GraphEntropyAdapter(store);
  });

  describe('computeDriftData', () => {
    it('should return stale edges when timestamps are missing (conservative)', () => {
      const drift = adapter.computeDriftData();

      // Documents edges without lastModified timestamps are conservatively stale
      const totalDocEdges = drift.staleEdges.length + drift.freshEdges;
      expect(totalDocEdges).toBeGreaterThan(0);

      // Each stale edge should have valid structure
      for (const edge of drift.staleEdges) {
        expect(edge.docNodeId).toBeTruthy();
        expect(edge.codeNodeId).toBeTruthy();
        expect(edge.edgeType).toBe('documents');

        // The target code node should still exist in the store
        const targetNode = store.getNode(edge.codeNodeId);
        expect(targetNode).not.toBeNull();
      }
    });

    it('should mark edge as fresh when doc is newer than code', () => {
      // Add a code node with a lastModified timestamp
      store.addNode({
        id: 'function:fresh-test.ts:freshFn',
        type: 'function',
        name: 'freshFn',
        path: 'fresh-test.ts',
        metadata: {},
        lastModified: '2024-01-01T00:00:00Z',
      });

      // Add a doc node with a NEWER lastModified timestamp
      store.addNode({
        id: 'adr:ADR-FRESH',
        type: 'adr',
        name: 'ADR-FRESH',
        metadata: {},
        lastModified: '2024-06-01T00:00:00Z',
      });

      store.addEdge({
        from: 'adr:ADR-FRESH',
        to: 'function:fresh-test.ts:freshFn',
        type: 'documents',
      });

      const drift = adapter.computeDriftData();

      // This edge should NOT appear in staleEdges
      const freshEdge = drift.staleEdges.find(
        (e) => e.codeNodeId === 'function:fresh-test.ts:freshFn'
      );
      expect(freshEdge).toBeUndefined();
      expect(drift.freshEdges).toBeGreaterThan(0);
    });

    it('should mark edge as stale when code is newer than doc', () => {
      // Add a code node modified AFTER the doc
      store.addNode({
        id: 'function:stale-test.ts:staleFn',
        type: 'function',
        name: 'staleFn',
        path: 'stale-test.ts',
        metadata: {},
        lastModified: '2024-06-01T00:00:00Z',
      });

      // Add a doc node with an OLDER lastModified timestamp
      store.addNode({
        id: 'adr:ADR-STALE',
        type: 'adr',
        name: 'ADR-STALE',
        metadata: {},
        lastModified: '2024-01-01T00:00:00Z',
      });

      store.addEdge({
        from: 'adr:ADR-STALE',
        to: 'function:stale-test.ts:staleFn',
        type: 'documents',
      });

      const drift = adapter.computeDriftData();

      const staleEdge = drift.staleEdges.find(
        (e) => e.codeNodeId === 'function:stale-test.ts:staleFn'
      );
      expect(staleEdge).toBeDefined();
      expect(staleEdge!.codeLastModified).toBe('2024-06-01T00:00:00Z');
      expect(staleEdge!.docLastModified).toBe('2024-01-01T00:00:00Z');
    });

    it('should mark edge as fresh when timestamps are equal', () => {
      const timestamp = '2024-03-15T12:00:00Z';

      store.addNode({
        id: 'function:equal-test.ts:equalFn',
        type: 'function',
        name: 'equalFn',
        path: 'equal-test.ts',
        metadata: {},
        lastModified: timestamp,
      });

      store.addNode({
        id: 'adr:ADR-EQUAL',
        type: 'adr',
        name: 'ADR-EQUAL',
        metadata: {},
        lastModified: timestamp,
      });

      store.addEdge({
        from: 'adr:ADR-EQUAL',
        to: 'function:equal-test.ts:equalFn',
        type: 'documents',
      });

      const drift = adapter.computeDriftData();

      const equalEdge = drift.staleEdges.find(
        (e) => e.codeNodeId === 'function:equal-test.ts:equalFn'
      );
      expect(equalEdge).toBeUndefined();
    });

    it('should return missingTargets when a documents edge points to a deleted node', () => {
      // Add a documents edge pointing to a non-existent node
      store.addEdge({
        from: 'adr:ADR-001',
        to: 'function:deleted-file.ts:deletedFunction',
        type: 'documents',
      });

      const drift = adapter.computeDriftData();

      expect(drift.missingTargets).toContain('function:deleted-file.ts:deletedFunction');
    });
  });

  describe('computeDeadCodeData', () => {
    it('should identify entry points (index.ts files)', () => {
      const deadCode = adapter.computeDeadCodeData();

      // The fixture has src/index.ts which should be an entry point
      expect(deadCode.entryPoints.length).toBeGreaterThan(0);

      const indexEntryPoint = deadCode.entryPoints.find((ep) => ep.includes('index.ts'));
      expect(indexEntryPoint).toBeDefined();
    });

    it('should mark unreachable nodes when an orphan node is added', () => {
      // Add an orphan function node that is not connected to anything
      store.addNode({
        id: 'function:orphan.ts:orphanFunction',
        type: 'function',
        name: 'orphanFunction',
        path: 'orphan.ts',
        metadata: {},
      });

      const deadCode = adapter.computeDeadCodeData();

      const orphan = deadCode.unreachableNodes.find(
        (n) => n.id === 'function:orphan.ts:orphanFunction'
      );
      expect(orphan).toBeDefined();
      expect(orphan!.name).toBe('orphanFunction');
      expect(orphan!.type).toBe('function');
    });

    it('should mark connected nodes as reachable', () => {
      const deadCode = adapter.computeDeadCodeData();

      // The index.ts file itself should be reachable
      const indexFileId = deadCode.entryPoints.find((ep) => ep.includes('index.ts'));
      expect(indexFileId).toBeDefined();
      expect(deadCode.reachableNodeIds.has(indexFileId!)).toBe(true);

      // Nodes imported from index.ts should be reachable (not in unreachable list)
      // index.ts imports from services/user-service, services/auth-service, utils/hash
      const unreachableIds = new Set(deadCode.unreachableNodes.map((n) => n.id));

      // The index.ts entry point and anything it reaches should NOT be unreachable
      expect(unreachableIds.has(indexFileId!)).toBe(false);
    });
  });

  describe('computeSnapshotSummary', () => {
    it('should return correct counts by type', () => {
      const summary = adapter.computeSnapshotSummary();

      // nodeCount and edgeCount should match the store
      expect(summary.nodeCount).toBe(store.nodeCount);
      expect(summary.edgeCount).toBe(store.edgeCount);

      // Should have file nodes from the fixture
      expect(summary.nodesByType['file']).toBeGreaterThan(0);

      // Should have contains edges (file -> symbols)
      expect(summary.edgesByType['contains']).toBeGreaterThan(0);

      // Should have documents edges from KnowledgeIngestor
      expect(summary.edgesByType['documents']).toBeGreaterThan(0);

      // Sum of nodesByType should equal total nodeCount
      const nodeSum = Object.values(summary.nodesByType).reduce((a, b) => a + b, 0);
      expect(nodeSum).toBe(summary.nodeCount);

      // Sum of edgesByType should equal total edgeCount
      const edgeSum = Object.values(summary.edgesByType).reduce((a, b) => a + b, 0);
      expect(edgeSum).toBe(summary.edgeCount);
    });
  });
});
