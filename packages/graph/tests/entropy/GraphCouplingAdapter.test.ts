import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { GraphCouplingAdapter } from '../../src/entropy/GraphCouplingAdapter.js';
import type {
  GraphCouplingFileData,
  GraphCouplingResult,
} from '../../src/entropy/GraphCouplingAdapter.js';

describe('GraphCouplingAdapter', () => {
  let store: GraphStore;
  let adapter: GraphCouplingAdapter;

  beforeEach(() => {
    store = new GraphStore();
    adapter = new GraphCouplingAdapter(store);
  });

  describe('computeCouplingData', () => {
    it('computes fan-in and fan-out correctly', () => {
      // Setup: a imports b and c (fan-out for a = 2)
      //        c imports b         (fan-in for b = 2)
      store.addNode({ id: 'file:a', type: 'file', name: 'a.ts', path: 'src/a.ts', metadata: {} });
      store.addNode({ id: 'file:b', type: 'file', name: 'b.ts', path: 'src/b.ts', metadata: {} });
      store.addNode({ id: 'file:c', type: 'file', name: 'c.ts', path: 'src/c.ts', metadata: {} });

      store.addEdge({ from: 'file:a', to: 'file:b', type: 'imports' });
      store.addEdge({ from: 'file:a', to: 'file:c', type: 'imports' });
      store.addEdge({ from: 'file:c', to: 'file:b', type: 'imports' });

      const result = adapter.computeCouplingData();
      const byFile = new Map(result.files.map((f) => [f.file, f]));

      // a: fan-out=2, fan-in=0
      const a = byFile.get('src/a.ts')!;
      expect(a).toBeDefined();
      expect(a.fanOut).toBe(2);
      expect(a.fanIn).toBe(0);
      expect(a.couplingRatio).toBe(1.0); // 2 / (0 + 2)

      // b: fan-out=0, fan-in=2
      const b = byFile.get('src/b.ts')!;
      expect(b).toBeDefined();
      expect(b.fanOut).toBe(0);
      expect(b.fanIn).toBe(2);
      expect(b.couplingRatio).toBe(0.0); // 0 / (2 + 0)

      // c: fan-out=1, fan-in=1
      const c = byFile.get('src/c.ts')!;
      expect(c).toBeDefined();
      expect(c.fanOut).toBe(1);
      expect(c.fanIn).toBe(1);
      expect(c.couplingRatio).toBe(0.5); // 1 / (1 + 1)
    });

    it('computes transitive dependency depth via BFS', () => {
      // Chain: a -> b -> c -> d
      store.addNode({ id: 'file:a', type: 'file', name: 'a.ts', path: 'src/a.ts', metadata: {} });
      store.addNode({ id: 'file:b', type: 'file', name: 'b.ts', path: 'src/b.ts', metadata: {} });
      store.addNode({ id: 'file:c', type: 'file', name: 'c.ts', path: 'src/c.ts', metadata: {} });
      store.addNode({ id: 'file:d', type: 'file', name: 'd.ts', path: 'src/d.ts', metadata: {} });

      store.addEdge({ from: 'file:a', to: 'file:b', type: 'imports' });
      store.addEdge({ from: 'file:b', to: 'file:c', type: 'imports' });
      store.addEdge({ from: 'file:c', to: 'file:d', type: 'imports' });

      const result = adapter.computeCouplingData();
      const byFile = new Map(result.files.map((f) => [f.file, f]));

      expect(byFile.get('src/a.ts')!.transitiveDepth).toBe(3);
      expect(byFile.get('src/b.ts')!.transitiveDepth).toBe(2);
      expect(byFile.get('src/c.ts')!.transitiveDepth).toBe(1);
      expect(byFile.get('src/d.ts')!.transitiveDepth).toBe(0);
    });

    it('returns empty result for empty graph', () => {
      const result = adapter.computeCouplingData();

      expect(result.files).toEqual([]);
    });
  });
});
