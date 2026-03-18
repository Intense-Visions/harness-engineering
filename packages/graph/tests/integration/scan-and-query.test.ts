import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';
import { TopologicalLinker } from '../../src/ingest/TopologicalLinker.js';
import { ContextQL } from '../../src/query/ContextQL.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

describe('Integration: scan and query', () => {
  it('full pipeline: ingest → link → query → persist → reload', async () => {
    // 1. Ingest
    const store = new GraphStore();
    const ingestor = new CodeIngestor(store);
    const ingestResult = await ingestor.ingest(FIXTURE_DIR);
    expect(ingestResult.errors).toHaveLength(0);
    expect(store.nodeCount).toBeGreaterThan(5);

    // 2. Link
    const linker = new TopologicalLinker(store);
    const linkResult = linker.link();
    expect(linkResult.cycles).toHaveLength(0);

    // 3. Query: find everything reachable from user-service
    const cql = new ContextQL(store);
    const userServiceFile = store
      .findNodes({ type: 'file' })
      .find((n) => n.path?.includes('user-service'));
    expect(userServiceFile).toBeDefined();

    const result = cql.execute({
      rootNodeIds: [userServiceFile!.id],
      maxDepth: 3,
    });

    // user-service imports auth-service and types
    // auth-service imports types and hash
    const paths = result.nodes.map((n) => n.path).filter(Boolean);
    expect(paths.some((p) => p!.includes('auth-service'))).toBe(true);
    expect(paths.some((p) => p!.includes('types'))).toBe(true);

    // 4. Persist and reload
    const tmpDir = path.join(os.tmpdir(), `graph-integration-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      await store.save(tmpDir);

      const loaded = new GraphStore();
      const loadSuccess = await loaded.load(tmpDir);
      expect(loadSuccess).toBe(true);
      expect(loaded.nodeCount).toBe(store.nodeCount);
      expect(loaded.edgeCount).toBe(store.edgeCount);

      // Query works on reloaded graph
      const reloadedCql = new ContextQL(loaded);
      const reloadedResult = reloadedCql.execute({
        rootNodeIds: [userServiceFile!.id],
        maxDepth: 3,
      });
      expect(reloadedResult.nodes.length).toBe(result.nodes.length);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('noise pruning reduces context size', async () => {
    const store = new GraphStore();
    const ingestor = new CodeIngestor(store);
    await ingestor.ingest(FIXTURE_DIR);

    // Add observability noise
    store.addNode({ id: 'span:req1', type: 'span', name: 'HTTP GET', metadata: {} });
    store.addNode({ id: 'metric:latency', type: 'metric', name: 'p99', metadata: {} });
    const someFile = store.findNodes({ type: 'file' })[0]!;
    store.addEdge({ from: 'span:req1', to: someFile.id, type: 'executed_by' });
    store.addEdge({ from: 'metric:latency', to: someFile.id, type: 'measured_by' });

    const cql = new ContextQL(store);

    // With pruning (default)
    const pruned = cql.execute({
      rootNodeIds: [someFile.id],
      maxDepth: 2,
      bidirectional: true,
    });

    // Without pruning
    const unpruned = cql.execute({
      rootNodeIds: [someFile.id],
      maxDepth: 2,
      bidirectional: true,
      pruneObservability: false,
    });

    expect(pruned.nodes.length).toBeLessThan(unpruned.nodes.length);
    expect(pruned.stats.pruned).toBeGreaterThan(0);
  });
});
