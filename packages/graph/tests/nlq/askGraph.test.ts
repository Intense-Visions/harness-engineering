import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { askGraph } from '../../src/nlq/index.js';
import type { GraphNode, GraphEdge } from '../../src/types.js';

describe('askGraph (integration)', () => {
  let store: GraphStore;

  const authService: GraphNode = {
    id: 'class:AuthService',
    type: 'class',
    name: 'AuthService',
    path: 'src/services/auth-service.ts',
    metadata: {},
  };

  const userService: GraphNode = {
    id: 'class:UserService',
    type: 'class',
    name: 'UserService',
    path: 'src/services/user-service.ts',
    metadata: {},
  };

  const hashPassword: GraphNode = {
    id: 'fn:hashPassword',
    type: 'function',
    name: 'hashPassword',
    path: 'src/utils/hash.ts',
    metadata: {},
  };

  const middleware: GraphNode = {
    id: 'file:middleware.ts',
    type: 'file',
    name: 'middleware.ts',
    path: 'src/auth/middleware.ts',
    metadata: {},
  };

  const authTest: GraphNode = {
    id: 'test:auth.test.ts',
    type: 'test_result',
    name: 'auth.test.ts',
    path: 'tests/auth.test.ts',
    metadata: {},
  };

  const authAdr: GraphNode = {
    id: 'doc:auth-adr',
    type: 'adr',
    name: 'auth-adr',
    path: 'docs/adr/auth.md',
    metadata: {},
  };

  const edges: GraphEdge[] = [
    { from: 'file:middleware.ts', to: 'class:AuthService', type: 'imports', metadata: {} },
    { from: 'class:AuthService', to: 'fn:hashPassword', type: 'calls', metadata: {} },
    { from: 'test:auth.test.ts', to: 'class:AuthService', type: 'references', metadata: {} },
    { from: 'doc:auth-adr', to: 'class:AuthService', type: 'documents', metadata: {} },
    { from: 'class:UserService', to: 'class:AuthService', type: 'calls', metadata: {} },
  ];

  beforeEach(() => {
    store = new GraphStore();
    store.addNode(authService);
    store.addNode(userService);
    store.addNode(hashPassword);
    store.addNode(middleware);
    store.addNode(authTest);
    store.addNode(authAdr);
    for (const edge of edges) {
      store.addEdge(edge);
    }
  });

  it('handles impact intent end-to-end', async () => {
    const result = await askGraph(store, 'what breaks if I change AuthService?');
    expect(result.intent).toBe('impact');
    expect(result.intentConfidence).toBeGreaterThan(0.3);
    expect(result.entities.length).toBeGreaterThanOrEqual(1);
    expect(result.entities[0]!.nodeId).toBe('class:AuthService');

    const data = result.data as Record<string, unknown[]>;
    expect(data).toHaveProperty('code');
    expect(data).toHaveProperty('tests');
    expect(data).toHaveProperty('docs');
    expect(data).toHaveProperty('other');
    expect(result.summary).toBeTruthy();
    expect(result.summary).toContain('AuthService');
  });

  it('handles find intent end-to-end', async () => {
    const result = await askGraph(store, 'where is hashPassword?');
    expect(result.intent).toBe('find');
    expect(result.intentConfidence).toBeGreaterThan(0.3);
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as unknown[]).length).toBeGreaterThan(0);
    expect(result.summary).toContain('match');
  });

  it('handles relationships intent end-to-end', async () => {
    const result = await askGraph(store, 'what calls AuthService?');
    expect(result.intent).toBe('relationships');
    expect(result.intentConfidence).toBeGreaterThan(0.3);

    const data = result.data as { nodes: unknown[]; edges: unknown[] };
    expect(data).toHaveProperty('nodes');
    expect(data).toHaveProperty('edges');
    expect(result.summary).toContain('AuthService');
  });

  it('handles explain intent end-to-end', async () => {
    const result = await askGraph(store, 'what is AuthService?');
    expect(result.intent).toBe('explain');
    expect(result.intentConfidence).toBeGreaterThan(0.3);

    const data = result.data as { searchResults: unknown[]; context: unknown[] };
    expect(data).toHaveProperty('searchResults');
    expect(data).toHaveProperty('context');
    expect(result.summary).toContain('AuthService');
  });

  it('handles anomaly intent end-to-end', async () => {
    const result = await askGraph(store, 'what looks wrong in the codebase?');
    expect(result.intent).toBe('anomaly');
    expect(result.intentConfidence).toBeGreaterThan(0.3);

    const data = result.data as { statisticalOutliers: unknown[]; articulationPoints: unknown[] };
    expect(data).toHaveProperty('statisticalOutliers');
    expect(data).toHaveProperty('articulationPoints');
    expect(result.summary.toLowerCase()).toContain('anomal');
  });

  it('returns suggestions when confidence is low', async () => {
    const result = await askGraph(store, 'hello world');
    expect(result.intentConfidence).toBeLessThan(0.3);
    expect(result.suggestions).toBeDefined();
    expect(result.suggestions!.length).toBeGreaterThan(0);
    expect(result.data).toBeNull();
  });

  it('returns helpful message when entity cannot be resolved for entity-requiring intent', async () => {
    const result = await askGraph(store, 'what breaks if I change NonExistentThing?');
    expect(result.intent).toBe('impact');
    expect(result.entities).toHaveLength(0);
    expect(result.data).toBeNull();
    expect(result.summary).toContain('Could not find');
  });

  it('always returns a valid AskGraphResult shape', async () => {
    const questions = [
      'what breaks if I change AuthService?',
      'where is hashPassword?',
      'what calls UserService?',
      'what is AuthService?',
      'what looks wrong?',
      'hello world',
    ];

    for (const q of questions) {
      const result = await askGraph(store, q);
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('intentConfidence');
      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('data');
      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(0);
    }
  });
});
