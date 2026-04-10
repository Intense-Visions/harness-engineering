import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { normalizeIntent, PackedSummaryCache } from '../../src/store/PackedSummaryCache.js';
import type { GraphNode } from '../../src/types.js';

function makeNode(
  overrides: Partial<GraphNode> & { id: string; type: GraphNode['type']; name: string }
): GraphNode {
  return { metadata: {}, ...overrides };
}

describe('normalizeIntent', () => {
  it('lowercases and trims', () => {
    expect(normalizeIntent('  Understand Auth  ')).toBe('understand auth');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeIntent('understand   the   auth   flow')).toBe('understand the auth flow');
  });

  it('produces deterministic node IDs', () => {
    const a = normalizeIntent('Understand Auth');
    const b = normalizeIntent('understand  auth');
    expect(a).toBe(b);
  });
});

describe('PackedSummaryCache', () => {
  let store: GraphStore;
  let cache: PackedSummaryCache;

  beforeEach(() => {
    store = new GraphStore();
    cache = new PackedSummaryCache(store);
  });

  describe('get', () => {
    it('returns null when no cache node exists', () => {
      expect(cache.get('anything')).toBeNull();
    });

    it('returns cached envelope when node exists and is fresh', () => {
      const intent = 'understand auth';
      const envelope = {
        meta: {
          strategy: ['structural'],
          originalTokenEstimate: 100,
          compactedTokenEstimate: 50,
          reductionPct: 50,
          cached: false,
        },
        sections: [{ source: 'file:auth.ts', content: 'compacted' }],
      };

      cache.set(intent, envelope, ['file:auth.ts']);

      const result = cache.get(intent);
      expect(result).not.toBeNull();
      expect(result!.meta.cached).toBe(true);
      expect(result!.sections).toEqual(envelope.sections);
    });

    it('returns null when cache node is expired (TTL exceeded)', () => {
      const intent = 'understand auth';
      const envelope = {
        meta: {
          strategy: ['structural'],
          originalTokenEstimate: 100,
          compactedTokenEstimate: 50,
          reductionPct: 50,
          cached: false,
        },
        sections: [{ source: 'file:auth.ts', content: 'compacted' }],
      };

      cache.set(intent, envelope, ['file:auth.ts']);

      // Manually backdate the node to simulate expiry
      const nodeId = `packed_summary:${normalizeIntent(intent)}`;
      store.addNode({
        id: nodeId,
        type: 'packed_summary',
        name: intent,
        metadata: {
          envelope: JSON.stringify(envelope),
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        },
      });

      const result = cache.get(intent);
      expect(result).toBeNull();
    });

    it('returns null when source node was modified after cache creation', () => {
      // Add a source node with a recent lastModified
      store.addNode(
        makeNode({
          id: 'file:auth.ts',
          type: 'file',
          name: 'auth.ts',
          lastModified: new Date().toISOString(),
        })
      );

      const intent = 'understand auth';
      const envelope = {
        meta: {
          strategy: ['structural'],
          originalTokenEstimate: 100,
          compactedTokenEstimate: 50,
          reductionPct: 50,
          cached: false,
        },
        sections: [{ source: 'file:auth.ts', content: 'compacted' }],
      };

      // Backdate cache creation to before the source modification
      const nodeId = `packed_summary:${normalizeIntent(intent)}`;
      const pastTime = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
      store.addNode({
        id: nodeId,
        type: 'packed_summary',
        name: intent,
        metadata: {
          envelope: JSON.stringify(envelope),
          createdAt: pastTime,
        },
      });
      store.addEdge({ from: nodeId, to: 'file:auth.ts', type: 'caches' });

      const result = cache.get(intent);
      expect(result).toBeNull();
    });

    it('returns cached envelope when source nodes have no lastModified', () => {
      store.addNode(
        makeNode({
          id: 'file:auth.ts',
          type: 'file',
          name: 'auth.ts',
          // no lastModified
        })
      );

      const intent = 'understand auth';
      const envelope = {
        meta: {
          strategy: ['structural'],
          originalTokenEstimate: 100,
          compactedTokenEstimate: 50,
          reductionPct: 50,
          cached: false,
        },
        sections: [{ source: 'file:auth.ts', content: 'compacted' }],
      };

      cache.set(intent, envelope, ['file:auth.ts']);

      const result = cache.get(intent);
      expect(result).not.toBeNull();
      expect(result!.meta.cached).toBe(true);
    });

    it('returns cached envelope when source node lastModified is before cache creation', () => {
      const pastTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
      store.addNode(
        makeNode({
          id: 'file:auth.ts',
          type: 'file',
          name: 'auth.ts',
          lastModified: pastTime,
        })
      );

      const intent = 'understand auth';
      const envelope = {
        meta: {
          strategy: ['structural'],
          originalTokenEstimate: 100,
          compactedTokenEstimate: 50,
          reductionPct: 50,
          cached: false,
        },
        sections: [{ source: 'file:auth.ts', content: 'compacted' }],
      };

      cache.set(intent, envelope, ['file:auth.ts']);

      const result = cache.get(intent);
      expect(result).not.toBeNull();
      expect(result!.meta.cached).toBe(true);
    });

    it('returns null when any one of multiple source nodes is modified', () => {
      // One source old, one source fresh
      store.addNode(
        makeNode({
          id: 'file:auth.ts',
          type: 'file',
          name: 'auth.ts',
          lastModified: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        })
      );
      store.addNode(
        makeNode({
          id: 'file:user.ts',
          type: 'file',
          name: 'user.ts',
          lastModified: new Date().toISOString(), // just now
        })
      );

      const intent = 'understand auth and users';
      const envelope = {
        meta: {
          strategy: ['structural'],
          originalTokenEstimate: 200,
          compactedTokenEstimate: 80,
          reductionPct: 60,
          cached: false,
        },
        sections: [
          { source: 'file:auth.ts', content: 'auth' },
          { source: 'file:user.ts', content: 'user' },
        ],
      };

      // Backdate cache
      const nodeId = `packed_summary:${normalizeIntent(intent)}`;
      store.addNode({
        id: nodeId,
        type: 'packed_summary',
        name: normalizeIntent(intent),
        metadata: {
          envelope: JSON.stringify(envelope),
          createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        },
      });
      store.addEdge({ from: nodeId, to: 'file:auth.ts', type: 'caches' });
      store.addEdge({ from: nodeId, to: 'file:user.ts', type: 'caches' });

      const result = cache.get(intent);
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('creates a packed_summary node and caches edges', () => {
      const intent = 'understand auth';
      const envelope = {
        meta: {
          strategy: ['structural'],
          originalTokenEstimate: 100,
          compactedTokenEstimate: 50,
          reductionPct: 50,
          cached: false,
        },
        sections: [{ source: 'file:auth.ts', content: 'compacted' }],
      };

      cache.set(intent, envelope, ['file:auth.ts', 'file:user.ts']);

      const nodeId = `packed_summary:${normalizeIntent(intent)}`;
      const node = store.getNode(nodeId);
      expect(node).not.toBeNull();
      expect(node!.type).toBe('packed_summary');

      const edges = store.getEdges({ from: nodeId, type: 'caches' });
      expect(edges).toHaveLength(2);
      expect(edges.map((e) => e.to).sort()).toEqual(['file:auth.ts', 'file:user.ts']);
    });

    it('overwrites existing cache node on re-set', () => {
      const intent = 'understand auth';
      const envelope1 = {
        meta: {
          strategy: ['structural'],
          originalTokenEstimate: 100,
          compactedTokenEstimate: 50,
          reductionPct: 50,
          cached: false,
        },
        sections: [{ source: 'file:auth.ts', content: 'v1' }],
      };
      const envelope2 = {
        meta: {
          strategy: ['structural'],
          originalTokenEstimate: 200,
          compactedTokenEstimate: 80,
          reductionPct: 60,
          cached: false,
        },
        sections: [{ source: 'file:auth.ts', content: 'v2' }],
      };

      cache.set(intent, envelope1, ['file:auth.ts']);
      cache.set(intent, envelope2, ['file:auth.ts']);

      const result = cache.get(intent);
      expect(result).not.toBeNull();
      expect(result!.sections[0].content).toBe('v2');
    });
  });

  describe('invalidate', () => {
    it('removes cache node by intent', () => {
      const intent = 'understand auth';
      const envelope = {
        meta: {
          strategy: ['structural'],
          originalTokenEstimate: 100,
          compactedTokenEstimate: 50,
          reductionPct: 50,
          cached: false,
        },
        sections: [{ source: 'file:auth.ts', content: 'compacted' }],
      };

      cache.set(intent, envelope, ['file:auth.ts']);
      cache.invalidate(intent);

      expect(cache.get(intent)).toBeNull();
    });
  });
});
