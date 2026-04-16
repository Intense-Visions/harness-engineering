import { describe, it, expect } from 'vitest';
import type { GraphNode, GraphEdge } from '@harness-engineering/graph';
import { GraphStore } from '@harness-engineering/graph';
import { GraphValidator } from '../../src/sel/graph-validator.js';

function makeModuleNode(
  id: string,
  name: string,
  metadata: Record<string, unknown> = {}
): GraphNode {
  return {
    id,
    type: 'module',
    name,
    metadata,
  };
}

function makeFileNode(id: string, name: string): GraphNode {
  return {
    id,
    type: 'file',
    name,
    path: `src/${name}.ts`,
    metadata: {},
  };
}

function makeTestEdge(from: string, to: string): GraphEdge {
  return { from, to, type: 'tested_by' };
}

function makeDependencyEdge(from: string, to: string): GraphEdge {
  return { from, to, type: 'imports' };
}

describe('GraphValidator', () => {
  it('resolves a known module to a graph node', () => {
    const store = new GraphStore();
    store.addNode(makeModuleNode('mod-auth', 'auth-service', { owner: 'security-team' }));
    store.addEdge(makeTestEdge('mod-auth', 'test-auth-1'));
    store.addNode({ id: 'test-auth-1', type: 'file', name: 'auth.test.ts', metadata: {} });
    store.addEdge(makeTestEdge('mod-auth', 'test-auth-2'));
    store.addNode({
      id: 'test-auth-2',
      type: 'file',
      name: 'auth.integration.test.ts',
      metadata: {},
    });

    const validator = new GraphValidator(store);
    const results = validator.validate([{ name: 'auth-service' }]);

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('auth-service');
    expect(results[0]!.graphNodeId).toBe('mod-auth');
    expect(results[0]!.confidence).toBeGreaterThan(0);
    expect(results[0]!.testCoverage).toBe(2);
    expect(results[0]!.owner).toBe('security-team');
  });

  it('returns null graphNodeId with confidence 0 for unknown modules', () => {
    const store = new GraphStore();
    store.addNode(makeModuleNode('mod-api', 'api-gateway'));

    const validator = new GraphValidator(store);
    const results = validator.validate([{ name: 'totally-unknown-system' }]);

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('totally-unknown-system');
    expect(results[0]!.graphNodeId).toBeNull();
    expect(results[0]!.confidence).toBe(0);
    expect(results[0]!.transitiveDeps).toEqual([]);
    expect(results[0]!.testCoverage).toBe(0);
    expect(results[0]!.owner).toBeNull();
  });

  it('handles multiple systems with some found and some not', () => {
    const store = new GraphStore();
    store.addNode(makeModuleNode('mod-api', 'api-gateway'));
    store.addNode(makeModuleNode('mod-db', 'database-layer'));

    const validator = new GraphValidator(store);
    const results = validator.validate([
      { name: 'api-gateway' },
      { name: 'nonexistent-service' },
      { name: 'database-layer' },
    ]);

    expect(results).toHaveLength(3);

    // api-gateway: found
    expect(results[0]!.name).toBe('api-gateway');
    expect(results[0]!.graphNodeId).toBe('mod-api');
    expect(results[0]!.confidence).toBeGreaterThan(0);

    // nonexistent-service: not found
    expect(results[1]!.name).toBe('nonexistent-service');
    expect(results[1]!.graphNodeId).toBeNull();
    expect(results[1]!.confidence).toBe(0);

    // database-layer: found
    expect(results[2]!.name).toBe('database-layer');
    expect(results[2]!.graphNodeId).toBe('mod-db');
    expect(results[2]!.confidence).toBeGreaterThan(0);
  });

  it('resolves transitive dependencies via CascadeSimulator', () => {
    const store = new GraphStore();
    store.addNode(makeModuleNode('mod-api', 'api-gateway'));
    store.addNode(makeModuleNode('mod-auth', 'auth-service'));
    store.addNode(makeFileNode('file-utils', 'utils'));
    store.addEdge(makeDependencyEdge('mod-api', 'mod-auth'));
    store.addEdge(makeDependencyEdge('mod-auth', 'file-utils'));

    const validator = new GraphValidator(store);
    const results = validator.validate([{ name: 'api-gateway' }]);

    expect(results[0]!.graphNodeId).toBe('mod-api');
    // CascadeSimulator should find transitive deps
    expect(results[0]!.transitiveDeps.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.transitiveDeps).toContain('mod-auth');
  });

  it('matches file nodes when no module matches', () => {
    const store = new GraphStore();
    store.addNode(makeFileNode('file-config', 'config'));

    const validator = new GraphValidator(store);
    const results = validator.validate([{ name: 'config' }]);

    expect(results[0]!.graphNodeId).toBe('file-config');
    expect(results[0]!.confidence).toBeGreaterThan(0);
  });

  it('returns owner as null when node has no owner metadata', () => {
    const store = new GraphStore();
    store.addNode(makeModuleNode('mod-api', 'api-gateway'));

    const validator = new GraphValidator(store);
    const results = validator.validate([{ name: 'api-gateway' }]);

    expect(results[0]!.owner).toBeNull();
  });

  it('handles empty systems array', () => {
    const store = new GraphStore();
    const validator = new GraphValidator(store);
    const results = validator.validate([]);

    expect(results).toEqual([]);
  });
});
