import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { VectorStore } from '../../src/store/VectorStore.js';
import { FusionLayer } from '../../src/search/FusionLayer.js';
import type { FusionResult } from '../../src/search/FusionLayer.js';

describe('FusionLayer', () => {
  let store: GraphStore;
  let fusion: FusionLayer;

  beforeEach(() => {
    store = new GraphStore();

    store.addNode({
      id: 'file:auth.ts',
      type: 'file',
      name: 'auth-service.ts',
      path: 'src/services/auth-service.ts',
      metadata: { language: 'typescript' },
    });
    store.addNode({
      id: 'class:AuthService',
      type: 'class',
      name: 'AuthService',
      path: 'src/services/auth-service.ts',
      metadata: {},
    });
    store.addNode({
      id: 'fn:hashPassword',
      type: 'function',
      name: 'hashPassword',
      path: 'src/utils/hash.ts',
      metadata: {},
    });
    store.addNode({
      id: 'file:types.ts',
      type: 'file',
      name: 'types.ts',
      path: 'src/types.ts',
      metadata: {},
    });
    store.addNode({
      id: 'iface:User',
      type: 'interface',
      name: 'User',
      path: 'src/types.ts',
      metadata: {},
    });

    fusion = new FusionLayer(store);
  });

  // Test 1: Keyword search returns nodes matching query terms
  it('should return nodes matching query terms — exact name match first', () => {
    const results = fusion.search('AuthService');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.nodeId).toBe('class:AuthService');
    expect(results[0]!.signals.keyword).toBe(1.0);
  });

  // Test 2: Partial match works
  it('should match partially — "auth" matches auth-service.ts and AuthService', () => {
    const results = fusion.search('auth');
    const ids = results.map((r) => r.nodeId);
    expect(ids).toContain('file:auth.ts');
    expect(ids).toContain('class:AuthService');
  });

  // Test 3: Path matching works
  it('should match on path — "services" matches files in services directory', () => {
    const results = fusion.search('services');
    const ids = results.map((r) => r.nodeId);
    expect(ids).toContain('file:auth.ts');
    expect(ids).toContain('class:AuthService');
  });

  // Test 4: Results are ranked (exact > partial > path)
  it('should rank results: exact name match > partial name > path match', () => {
    // Search "auth" which is a partial match for multiple nodes
    // "auth" partial-matches name "auth-service.ts" (0.7) and "AuthService" (0.7)
    // and path-matches anything in services/auth-service.ts (0.5)
    // Add a node that only matches via path to demonstrate ranking
    store.addNode({
      id: 'file:auth-config.ts',
      type: 'file',
      name: 'config.ts',
      path: 'src/auth/config.ts',
      metadata: {},
    });
    // Add an exact name match
    store.addNode({
      id: 'module:auth',
      type: 'module',
      name: 'auth',
      path: 'src/modules/auth.ts',
      metadata: {},
    });

    const results = fusion.search('auth');
    expect(results.length).toBeGreaterThanOrEqual(3);
    // Exact name match (1.0) should be first
    expect(results[0]!.nodeId).toBe('module:auth');
    expect(results[0]!.signals.keyword).toBe(1.0);
    // Partial name matches (0.7) next
    const partialMatches = results.filter((r) => r.signals.keyword === 0.7);
    expect(partialMatches.length).toBeGreaterThanOrEqual(2);
    // Path-only match (0.5) should be ranked lower
    const configResult = results.find((r) => r.nodeId === 'file:auth-config.ts');
    expect(configResult).toBeDefined();
    expect(configResult!.signals.keyword).toBe(0.5);
    expect(results.indexOf(configResult!)).toBeGreaterThan(
      results.indexOf(results.find((r) => r.signals.keyword === 0.7)!)
    );
  });

  // Test 5: Without VectorStore, uses 100% keyword signal
  it('should use 100% keyword signal when no VectorStore is provided', () => {
    const results = fusion.search('AuthService');
    for (const result of results) {
      expect(result.signals.semantic).toBe(0);
      expect(result.score).toBe(result.signals.keyword);
    }
  });

  // Test 6: With VectorStore, blends scores
  it('should blend keyword and semantic scores when VectorStore is provided', () => {
    const vectorStore = new VectorStore(3);

    // Add embeddings for nodes
    vectorStore.add('file:auth.ts', [1.0, 0.0, 0.0]);
    vectorStore.add('class:AuthService', [0.9, 0.1, 0.0]);
    vectorStore.add('fn:hashPassword', [0.5, 0.5, 0.0]);
    vectorStore.add('file:types.ts', [0.0, 0.0, 1.0]);
    vectorStore.add('iface:User', [0.0, 1.0, 0.0]);

    // Also add embeddings to nodes so the FusionLayer can detect them
    store.addNode({
      id: 'file:auth.ts',
      type: 'file',
      name: 'auth-service.ts',
      path: 'src/services/auth-service.ts',
      metadata: { language: 'typescript' },
      embedding: [1.0, 0.0, 0.0],
    });
    store.addNode({
      id: 'class:AuthService',
      type: 'class',
      name: 'AuthService',
      path: 'src/services/auth-service.ts',
      metadata: {},
      embedding: [0.9, 0.1, 0.0],
    });
    store.addNode({
      id: 'fn:hashPassword',
      type: 'function',
      name: 'hashPassword',
      path: 'src/utils/hash.ts',
      metadata: {},
      embedding: [0.5, 0.5, 0.0],
    });

    const fusionWithVectors = new FusionLayer(store, vectorStore);
    const results = fusionWithVectors.search('auth');

    // Should have semantic scores for matched nodes
    const authResult = results.find((r) => r.nodeId === 'file:auth.ts');
    expect(authResult).toBeDefined();
    expect(authResult!.signals.semantic).toBeGreaterThan(0);
    expect(authResult!.signals.keyword).toBeGreaterThan(0);
    // Score should be a blend
    expect(authResult!.score).toBeCloseTo(
      0.6 * authResult!.signals.keyword + 0.4 * authResult!.signals.semantic,
      5
    );
  });

  // Test 7: Empty query returns empty results
  it('should return empty results for empty query', () => {
    expect(fusion.search('')).toEqual([]);
  });

  // Test 8: No matches returns empty results
  it('should return empty results when nothing matches', () => {
    expect(fusion.search('zzzznonexistent')).toEqual([]);
  });

  // Test 9: Respects topK limit
  it('should respect topK limit', () => {
    // "ts" appears in multiple node names/paths
    // Add enough nodes to test limiting
    for (let i = 0; i < 15; i++) {
      store.addNode({
        id: `file:extra${i}.ts`,
        type: 'file',
        name: `extra${i}.ts`,
        path: `src/extra${i}.ts`,
        metadata: {},
      });
    }
    const results = fusion.search('extra', 5);
    expect(results.length).toBe(5);
  });

  // Test 10: Filters out zero-score nodes
  it('should filter out zero-score nodes', () => {
    const results = fusion.search('auth');
    for (const result of results) {
      expect(result.score).toBeGreaterThan(0);
    }
    // Nodes like types.ts and User should not appear (no "auth" in name/path/metadata)
    const ids = results.map((r) => r.nodeId);
    expect(ids).not.toContain('file:types.ts');
    expect(ids).not.toContain('iface:User');
  });

  // Additional: metadata matching
  it('should match on metadata values', () => {
    const results = fusion.search('typescript');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const authFile = results.find((r) => r.nodeId === 'file:auth.ts');
    expect(authFile).toBeDefined();
    expect(authFile!.signals.keyword).toBe(0.3);
  });

  // Additional: stop words are filtered
  it('should filter stop words from query', () => {
    // "the" and "is" are stop words, only "user" should be searched
    const results = fusion.search('the user is');
    const ids = results.map((r) => r.nodeId);
    expect(ids).toContain('iface:User');
  });
});
