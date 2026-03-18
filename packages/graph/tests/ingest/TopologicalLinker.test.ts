import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';
import { TopologicalLinker } from '../../src/ingest/TopologicalLinker.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

describe('TopologicalLinker', () => {
  it('resolves cross-module import references', async () => {
    const store = new GraphStore();
    const ingestor = new CodeIngestor(store);
    await ingestor.ingest(FIXTURE_DIR);

    const linker = new TopologicalLinker(store);
    const result = linker.link();

    expect(result.edgesAdded).toBeGreaterThan(0);
  });

  it('detects circular dependencies', async () => {
    const store = new GraphStore();

    // Create a cycle: A -> B -> C -> A
    store.batchAddNodes([
      { id: 'file:a.ts', type: 'file', name: 'a.ts', metadata: {} },
      { id: 'file:b.ts', type: 'file', name: 'b.ts', metadata: {} },
      { id: 'file:c.ts', type: 'file', name: 'c.ts', metadata: {} },
    ]);
    store.batchAddEdges([
      { from: 'file:a.ts', to: 'file:b.ts', type: 'imports' },
      { from: 'file:b.ts', to: 'file:c.ts', type: 'imports' },
      { from: 'file:c.ts', to: 'file:a.ts', type: 'imports' },
    ]);

    const linker = new TopologicalLinker(store);
    const result = linker.link();

    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it('reports no cycles for acyclic graph', async () => {
    const store = new GraphStore();
    const ingestor = new CodeIngestor(store);
    await ingestor.ingest(FIXTURE_DIR);

    const linker = new TopologicalLinker(store);
    const result = linker.link();

    expect(result.cycles).toHaveLength(0);
  });
});
