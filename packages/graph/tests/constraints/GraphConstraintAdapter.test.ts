import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import {
  GraphConstraintAdapter,
  type GraphDependencyData,
  type GraphLayerViolation,
} from '../../src/constraints/GraphConstraintAdapter.js';

describe('GraphConstraintAdapter', () => {
  let store: GraphStore;
  let adapter: GraphConstraintAdapter;

  const ROOT_DIR = '/project';

  // File paths used across tests
  const HANDLER = '/project/src/api/handler.ts';
  const USER = '/project/src/domain/user.ts';
  const UTILS = '/project/src/shared/utils.ts';

  // Layer config: api -> [domain, shared], domain -> [shared], shared -> []
  const LAYERS = [
    { name: 'api', patterns: ['src/api/**'], allowedDependencies: ['domain', 'shared'] },
    { name: 'domain', patterns: ['src/domain/**'], allowedDependencies: ['shared'] },
    { name: 'shared', patterns: ['src/shared/**'], allowedDependencies: [] },
  ];

  function seedGraph(): void {
    // File nodes
    store.addNode({
      id: `file:${HANDLER}`,
      type: 'file',
      name: 'handler.ts',
      path: HANDLER,
      metadata: {},
    });
    store.addNode({ id: `file:${USER}`, type: 'file', name: 'user.ts', path: USER, metadata: {} });
    store.addNode({
      id: `file:${UTILS}`,
      type: 'file',
      name: 'utils.ts',
      path: UTILS,
      metadata: {},
    });

    // Imports edges: handler -> user, user -> utils, handler -> utils
    store.addEdge({
      from: `file:${HANDLER}`,
      to: `file:${USER}`,
      type: 'imports',
      metadata: { importType: 'static', line: 1 },
    });
    store.addEdge({
      from: `file:${USER}`,
      to: `file:${UTILS}`,
      type: 'imports',
      metadata: { importType: 'dynamic', line: 3 },
    });
    store.addEdge({
      from: `file:${HANDLER}`,
      to: `file:${UTILS}`,
      type: 'imports',
      metadata: { importType: 'type-only', line: 2 },
    });
  }

  beforeEach(() => {
    store = new GraphStore();
    adapter = new GraphConstraintAdapter(store);
  });

  describe('computeDependencyGraph', () => {
    it('returns file nodes as string paths in nodes array', () => {
      seedGraph();
      const result = adapter.computeDependencyGraph();

      expect(result.nodes).toContain(HANDLER);
      expect(result.nodes).toContain(USER);
      expect(result.nodes).toContain(UTILS);
      expect(result.nodes).toHaveLength(3);
    });

    it('returns imports edges as { from, to, importType, line } objects', () => {
      seedGraph();
      const result = adapter.computeDependencyGraph();

      expect(result.edges).toHaveLength(3);

      const handlerToUser = result.edges.find((e) => e.from === HANDLER && e.to === USER);
      expect(handlerToUser).toBeDefined();
      expect(handlerToUser!.importType).toBe('static');
      expect(handlerToUser!.line).toBe(1);

      const userToUtils = result.edges.find((e) => e.from === USER && e.to === UTILS);
      expect(userToUtils).toBeDefined();
      expect(userToUtils!.importType).toBe('dynamic');
      expect(userToUtils!.line).toBe(3);

      const handlerToUtils = result.edges.find((e) => e.from === HANDLER && e.to === UTILS);
      expect(handlerToUtils).toBeDefined();
      expect(handlerToUtils!.importType).toBe('type-only');
      expect(handlerToUtils!.line).toBe(2);
    });

    it('handles empty graph (no file nodes)', () => {
      const result = adapter.computeDependencyGraph();

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('handles file nodes with no imports edges', () => {
      store.addNode({
        id: `file:${HANDLER}`,
        type: 'file',
        name: 'handler.ts',
        path: HANDLER,
        metadata: {},
      });
      store.addNode({
        id: `file:${USER}`,
        type: 'file',
        name: 'user.ts',
        path: USER,
        metadata: {},
      });

      const result = adapter.computeDependencyGraph();

      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(0);
    });
  });

  describe('computeLayerViolations', () => {
    it('detects cross-layer violations', () => {
      seedGraph();

      // Add a violation: domain imports api (not allowed)
      store.addEdge({
        from: `file:${USER}`,
        to: `file:${HANDLER}`,
        type: 'imports',
        metadata: { importType: 'static', line: 10 },
      });

      const violations = adapter.computeLayerViolations(LAYERS, ROOT_DIR);

      expect(violations).toHaveLength(1);
      expect(violations[0]).toEqual({
        file: USER,
        imports: HANDLER,
        fromLayer: 'domain',
        toLayer: 'api',
        reason: 'WRONG_LAYER',
        line: 10,
      });
    });

    it('returns empty array when all imports are within allowed layers', () => {
      seedGraph();

      const violations = adapter.computeLayerViolations(LAYERS, ROOT_DIR);

      expect(violations).toHaveLength(0);
    });

    it('handles files not in any layer', () => {
      seedGraph();

      // Add a file outside any layer
      const outsideFile = '/project/src/scripts/build.ts';
      store.addNode({
        id: `file:${outsideFile}`,
        type: 'file',
        name: 'build.ts',
        path: outsideFile,
        metadata: {},
      });
      store.addEdge({
        from: `file:${outsideFile}`,
        to: `file:${HANDLER}`,
        type: 'imports',
        metadata: { importType: 'static', line: 1 },
      });

      const violations = adapter.computeLayerViolations(LAYERS, ROOT_DIR);

      // Edges involving files not in any layer should not produce violations
      expect(violations).toHaveLength(0);
    });

    it('detects violations when shared imports domain', () => {
      seedGraph();

      // shared -> domain is not allowed
      store.addEdge({
        from: `file:${UTILS}`,
        to: `file:${USER}`,
        type: 'imports',
        metadata: { importType: 'static', line: 5 },
      });

      const violations = adapter.computeLayerViolations(LAYERS, ROOT_DIR);

      expect(violations).toHaveLength(1);
      expect(violations[0].fromLayer).toBe('shared');
      expect(violations[0].toLayer).toBe('domain');
    });

    it('ignores same-layer imports', () => {
      // Two files in the same layer
      const handler2 = '/project/src/api/routes.ts';
      store.addNode({
        id: `file:${HANDLER}`,
        type: 'file',
        name: 'handler.ts',
        path: HANDLER,
        metadata: {},
      });
      store.addNode({
        id: `file:${handler2}`,
        type: 'file',
        name: 'routes.ts',
        path: handler2,
        metadata: {},
      });
      store.addEdge({
        from: `file:${HANDLER}`,
        to: `file:${handler2}`,
        type: 'imports',
        metadata: { importType: 'static', line: 1 },
      });

      const violations = adapter.computeLayerViolations(LAYERS, ROOT_DIR);

      expect(violations).toHaveLength(0);
    });
  });
});
