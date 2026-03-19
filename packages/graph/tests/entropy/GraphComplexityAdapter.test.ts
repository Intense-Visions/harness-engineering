import { describe, it, expect } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore';
import { GraphComplexityAdapter } from '../../src/entropy/GraphComplexityAdapter';

describe('GraphComplexityAdapter', () => {
  it('computes hotspot scores from function metadata and commit frequency', () => {
    const store = new GraphStore();

    // Add a file node
    store.addNode({
      id: 'file:src/service.ts',
      type: 'file',
      name: 'service.ts',
      path: 'src/service.ts',
      metadata: {},
    });

    // Add a function node with complexity metadata
    store.addNode({
      id: 'function:src/service.ts:processData',
      type: 'function',
      name: 'processData',
      path: 'src/service.ts',
      metadata: { cyclomaticComplexity: 8 },
    });

    // File contains the function
    store.addEdge({
      from: 'file:src/service.ts',
      to: 'function:src/service.ts:processData',
      type: 'contains',
    });

    // Add commit nodes that reference the file
    for (let i = 0; i < 5; i++) {
      const commitId = `commit:abc${i}`;
      store.addNode({
        id: commitId,
        type: 'commit',
        name: `commit ${i}`,
        metadata: {},
      });
      store.addEdge({
        from: commitId,
        to: 'file:src/service.ts',
        type: 'references',
      });
    }

    const adapter = new GraphComplexityAdapter(store);
    const result = adapter.computeComplexityHotspots();

    expect(result.hotspots).toHaveLength(1);
    expect(result.hotspots[0]!.file).toBe('src/service.ts');
    expect(result.hotspots[0]!.function).toBe('processData');
    expect(result.hotspots[0]!.changeFrequency).toBe(5);
    expect(result.hotspots[0]!.complexity).toBe(8);
    expect(result.hotspots[0]!.hotspotScore).toBe(40); // 5 * 8
    expect(result.percentile95Score).toBe(40);
  });

  it('computes 95th percentile correctly with 20 functions', () => {
    const store = new GraphStore();

    // Create 20 functions with varying churn
    for (let i = 0; i < 20; i++) {
      const filePath = `src/file${i}.ts`;
      const fileId = `file:${filePath}`;
      const fnId = `function:${filePath}:fn${i}`;

      store.addNode({
        id: fileId,
        type: 'file',
        name: `file${i}.ts`,
        path: filePath,
        metadata: {},
      });

      store.addNode({
        id: fnId,
        type: 'function',
        name: `fn${i}`,
        path: filePath,
        metadata: { cyclomaticComplexity: i + 1 },
      });

      store.addEdge({
        from: fileId,
        to: fnId,
        type: 'contains',
      });

      // Each function's file gets (i + 1) commits
      for (let c = 0; c < i + 1; c++) {
        const commitId = `commit:file${i}-${c}`;
        store.addNode({
          id: commitId,
          type: 'commit',
          name: `commit for file${i}`,
          metadata: {},
        });
        store.addEdge({
          from: commitId,
          to: fileId,
          type: 'references',
        });
      }
    }

    const adapter = new GraphComplexityAdapter(store);
    const result = adapter.computeComplexityHotspots();

    expect(result.hotspots).toHaveLength(20);
    // Sorted descending by hotspotScore
    expect(result.hotspots[0]!.hotspotScore).toBe(400); // fn19: 20 * 20
    expect(result.hotspots[19]!.hotspotScore).toBe(1); // fn0: 1 * 1

    // 95th percentile: index = ceil(0.95 * 20) - 1 = 19 - 1 = 18 -> score at index 18
    // Sorted descending: scores are 400, 361, 324, 289, 256, 225, 196, 169, 144, 121, 100, 81, 64, 49, 36, 25, 16, 9, 4, 1
    // Index 18 in 0-based = 4 (the 19th value from top is 4)
    // Actually: 95th percentile = value at position ceil(0.95 * N) in ascending order
    // Ascending: 1, 4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144, 169, 196, 225, 256, 289, 324, 361, 400
    // ceil(0.95 * 20) = ceil(19) = 19 -> index 18 (0-based) = 361
    expect(result.percentile95Score).toBe(361);
  });

  it('returns empty result for empty graph', () => {
    const store = new GraphStore();
    const adapter = new GraphComplexityAdapter(store);
    const result = adapter.computeComplexityHotspots();

    expect(result.hotspots).toEqual([]);
    expect(result.percentile95Score).toBe(0);
  });
});
