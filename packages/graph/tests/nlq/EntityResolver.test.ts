import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { EntityResolver } from '../../src/nlq/EntityResolver.js';
import type { FusionLayer, FusionResult } from '../../src/search/FusionLayer.js';
import type { GraphNode } from '../../src/types.js';

describe('EntityResolver', () => {
  let store: GraphStore;

  const classNode: GraphNode = {
    id: 'class:AuthService',
    type: 'class',
    name: 'AuthService',
    path: 'src/services/auth-service.ts',
    metadata: {},
  };

  const fnNode: GraphNode = {
    id: 'fn:hashPassword',
    type: 'function',
    name: 'hashPassword',
    path: 'src/utils/hash.ts',
    metadata: {},
  };

  const fileNode: GraphNode = {
    id: 'file:middleware.ts',
    type: 'file',
    name: 'middleware.ts',
    path: 'src/auth/middleware.ts',
    metadata: {},
  };

  const fileNode2: GraphNode = {
    id: 'file:auth-service.ts',
    type: 'file',
    name: 'auth-service.ts',
    path: 'src/services/auth-service.ts',
    metadata: {},
  };

  beforeEach(() => {
    store = new GraphStore();
    store.addNode(classNode);
    store.addNode(fnNode);
    store.addNode(fileNode);
    store.addNode(fileNode2);
  });

  describe('Step 1: exact name match', () => {
    it('resolves by exact name with confidence 1.0', () => {
      const resolver = new EntityResolver(store);
      const results = resolver.resolve(['AuthService']);
      expect(results).toHaveLength(1);
      expect(results[0]!.raw).toBe('AuthService');
      expect(results[0]!.nodeId).toBe('class:AuthService');
      expect(results[0]!.confidence).toBe(1.0);
      expect(results[0]!.method).toBe('exact');
    });

    it('resolves exact name match before other strategies', () => {
      const resolver = new EntityResolver(store);
      const results = resolver.resolve(['hashPassword']);
      expect(results[0]!.method).toBe('exact');
      expect(results[0]!.confidence).toBe(1.0);
    });

    it('returns the first matching node when multiple nodes share the same name', () => {
      const resolver = new EntityResolver(store);
      const results = resolver.resolve(['AuthService']);
      expect(results).toHaveLength(1);
      expect(results[0]!.nodeId).toBe('class:AuthService');
    });
  });

  describe('Step 2: FusionLayer search', () => {
    it('resolves via FusionLayer when exact match fails and score > 0.5', () => {
      const mockFusion = {
        search: vi.fn().mockReturnValue([
          {
            nodeId: 'class:AuthService',
            node: classNode,
            score: 0.8,
            signals: { keyword: 0.8, semantic: 0 },
          },
        ] satisfies FusionResult[]),
      } as unknown as FusionLayer;

      const resolver = new EntityResolver(store, mockFusion);
      const results = resolver.resolve(['auth']);
      expect(results).toHaveLength(1);
      expect(results[0]!.method).toBe('fusion');
      expect(results[0]!.confidence).toBe(0.8);
      expect(results[0]!.nodeId).toBe('class:AuthService');
    });

    it('skips FusionLayer result when score <= 0.5', () => {
      const mockFusion = {
        search: vi.fn().mockReturnValue([
          {
            nodeId: 'class:AuthService',
            node: classNode,
            score: 0.3,
            signals: { keyword: 0.3, semantic: 0 },
          },
        ] satisfies FusionResult[]),
      } as unknown as FusionLayer;

      const resolver = new EntityResolver(store, mockFusion);
      const results = resolver.resolve(['nonexistent-thing']);
      expect(results).toHaveLength(0);
    });

    it('rejects FusionLayer result at exactly 0.5 boundary', () => {
      const mockFusion = {
        search: vi.fn().mockReturnValue([
          {
            nodeId: 'class:AuthService',
            node: classNode,
            score: 0.5,
            signals: { keyword: 0.5, semantic: 0 },
          },
        ] satisfies FusionResult[]),
      } as unknown as FusionLayer;

      const resolver = new EntityResolver(store, mockFusion);
      const results = resolver.resolve(['nonexistent-thing']);
      expect(results).toHaveLength(0);
    });

    it('calls FusionLayer with topK=5', () => {
      const mockFusion = {
        search: vi.fn().mockReturnValue([]),
      } as unknown as FusionLayer;

      const resolver = new EntityResolver(store, mockFusion);
      resolver.resolve(['something']);
      expect(mockFusion.search).toHaveBeenCalledWith('something', 5);
    });
  });

  describe('Step 3: path match', () => {
    it('resolves via path match when exact and fusion fail', () => {
      const resolver = new EntityResolver(store);
      // "middleware" is not a node name (the name is "middleware.ts")
      // but the path src/auth/middleware.ts includes "middleware"
      const results = resolver.resolve(['middleware']);
      // "middleware" matches exact name "middleware.ts"? No -- findNodes({name}) is exact.
      // So it falls through to path match.
      expect(results).toHaveLength(1);
      expect(results[0]!.method).toBe('path');
      expect(results[0]!.confidence).toBe(0.6);
      expect(results[0]!.nodeId).toBe('file:middleware.ts');
    });

    it('matches file paths by substring inclusion', () => {
      const resolver = new EntityResolver(store);
      const results = resolver.resolve(['src/auth']);
      expect(results).toHaveLength(1);
      expect(results[0]!.method).toBe('path');
      expect(results[0]!.nodeId).toBe('file:middleware.ts');
    });

    it('returns the first file node matching path', () => {
      const resolver = new EntityResolver(store);
      const results = resolver.resolve(['auth']);
      // "auth" substring matches paths:
      // - src/auth/middleware.ts (file:middleware.ts)
      // - src/services/auth-service.ts (file:auth-service.ts)
      // Should return the first match
      expect(results).toHaveLength(1);
      expect(results[0]!.method).toBe('path');
      expect(results[0]!.confidence).toBe(0.6);
    });
  });

  describe('unresolved entities', () => {
    it('does not include entities that match no cascade step', () => {
      const resolver = new EntityResolver(store);
      const results = resolver.resolve(['CompletelyUnknownThing']);
      expect(results).toHaveLength(0);
    });

    it('resolves some entities and skips unresolved ones', () => {
      const resolver = new EntityResolver(store);
      const results = resolver.resolve(['AuthService', 'UnknownEntity']);
      expect(results).toHaveLength(1);
      expect(results[0]!.raw).toBe('AuthService');
    });
  });

  describe('no FusionLayer provided', () => {
    it('skips Step 2 and goes directly to path match', () => {
      const resolver = new EntityResolver(store);
      // "auth" has no exact name match, no FusionLayer, falls to path match
      const results = resolver.resolve(['auth']);
      expect(results).toHaveLength(1);
      expect(results[0]!.method).toBe('path');
    });
  });

  describe('multiple entities', () => {
    it('resolves multiple entities in a single call', () => {
      const resolver = new EntityResolver(store);
      const results = resolver.resolve(['AuthService', 'hashPassword']);
      expect(results).toHaveLength(2);
      expect(results[0]!.raw).toBe('AuthService');
      expect(results[1]!.raw).toBe('hashPassword');
    });

    it('each entity resolved independently through the cascade', () => {
      const mockFusion = {
        search: vi.fn().mockReturnValue([
          {
            nodeId: 'fn:hashPassword',
            node: fnNode,
            score: 0.75,
            signals: { keyword: 0.75, semantic: 0 },
          },
        ] satisfies FusionResult[]),
      } as unknown as FusionLayer;

      const resolver = new EntityResolver(store, mockFusion);
      // "AuthService" matches exact, "hash" matches via fusion
      const results = resolver.resolve(['AuthService', 'hash']);
      expect(results).toHaveLength(2);
      expect(results[0]!.method).toBe('exact');
      expect(results[1]!.method).toBe('fusion');
    });
  });

  describe('ResolvedEntity shape', () => {
    it('includes raw, nodeId, node, confidence, and method', () => {
      const resolver = new EntityResolver(store);
      const results = resolver.resolve(['AuthService']);
      const entity = results[0]!;
      expect(entity).toHaveProperty('raw');
      expect(entity).toHaveProperty('nodeId');
      expect(entity).toHaveProperty('node');
      expect(entity).toHaveProperty('confidence');
      expect(entity).toHaveProperty('method');
      expect(entity.node.id).toBe(entity.nodeId);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      const resolver = new EntityResolver(store);
      const results = resolver.resolve([]);
      expect(results).toEqual([]);
    });

    it('handles empty store gracefully', () => {
      const emptyStore = new GraphStore();
      const resolver = new EntityResolver(emptyStore);
      const results = resolver.resolve(['AuthService']);
      expect(results).toHaveLength(0);
    });

    it('rejects very short strings from path matching to avoid false positives', () => {
      const resolver = new EntityResolver(store);
      // "a" would match nearly every path — should be rejected by min length guard
      const results = resolver.resolve(['a']);
      expect(results).toHaveLength(0);
    });
  });
});
