import { describe, it, expect } from 'vitest';
import { queryTraceability } from '../../src/query/Traceability.js';
import { GraphStore } from '../../src/store/GraphStore.js';
import type { GraphNode, GraphEdge } from '../../src/types.js';

function makeRequirement(
  overrides: Partial<GraphNode> & { metadata: Record<string, unknown> }
): GraphNode {
  return {
    id: overrides.id ?? 'req-1',
    type: 'requirement',
    name: overrides.name ?? 'Some requirement',
    metadata: overrides.metadata,
    ...overrides,
  };
}

function makeFileNode(id: string, path: string): GraphNode {
  return { id, type: 'file', name: path.split('/').pop() ?? id, path, metadata: {} };
}

function makeEdge(
  from: string,
  to: string,
  type: 'requires' | 'verified_by',
  confidence = 0.8,
  method = 'convention'
): GraphEdge {
  return { from, to, type, metadata: { confidence, method } };
}

describe('queryTraceability', () => {
  it('returns empty array when no requirement nodes exist', () => {
    const store = new GraphStore();
    store.addNode({
      id: 'file-1',
      type: 'file',
      name: 'index.ts',
      path: 'src/index.ts',
      metadata: {},
    });

    const results = queryTraceability(store);
    expect(results).toEqual([]);
  });

  it('computes correct coverage for fully traced requirements', () => {
    const store = new GraphStore();
    const req = makeRequirement({
      id: 'req-auth-1',
      name: 'User can log in',
      metadata: { specPath: 'docs/specs/auth.md', featureName: 'auth', index: 0 },
    });
    const codeFile = makeFileNode('file-auth', 'src/auth/login.ts');
    const testFile = makeFileNode('file-auth-test', 'src/auth/login.test.ts');

    store.addNode(req);
    store.addNode(codeFile);
    store.addNode(testFile);
    store.addEdge(makeEdge('req-auth-1', 'file-auth', 'requires', 0.9, 'annotation'));
    store.addEdge(makeEdge('req-auth-1', 'file-auth-test', 'verified_by', 1.0, 'annotation'));

    const results = queryTraceability(store);
    expect(results).toHaveLength(1);

    const result = results[0];
    expect(result.specPath).toBe('docs/specs/auth.md');
    expect(result.featureName).toBe('auth');
    expect(result.requirements).toHaveLength(1);

    const coverage = result.requirements[0];
    expect(coverage.status).toBe('full');
    expect(coverage.codeFiles).toHaveLength(1);
    expect(coverage.codeFiles[0].path).toBe('src/auth/login.ts');
    expect(coverage.codeFiles[0].confidence).toBe(0.9);
    expect(coverage.codeFiles[0].method).toBe('annotation');
    expect(coverage.testFiles).toHaveLength(1);
    expect(coverage.testFiles[0].path).toBe('src/auth/login.test.ts');
    expect(coverage.testFiles[0].confidence).toBe(1.0);
    expect(coverage.maxConfidence).toBe(1.0);
  });

  it('computes correct coverage for code-only requirements', () => {
    const store = new GraphStore();
    const req = makeRequirement({
      id: 'req-nav-1',
      name: 'Navigation works',
      metadata: { specPath: 'docs/specs/nav.md', featureName: 'nav', index: 0 },
    });
    const codeFile = makeFileNode('file-nav', 'src/nav/router.ts');

    store.addNode(req);
    store.addNode(codeFile);
    store.addEdge(makeEdge('req-nav-1', 'file-nav', 'requires', 0.7, 'plan-file-map'));

    const results = queryTraceability(store);
    expect(results).toHaveLength(1);

    const coverage = results[0].requirements[0];
    expect(coverage.status).toBe('code-only');
    expect(coverage.codeFiles).toHaveLength(1);
    expect(coverage.testFiles).toHaveLength(0);
    expect(coverage.maxConfidence).toBe(0.7);
  });

  it('handles untraceable requirements (no edges)', () => {
    const store = new GraphStore();
    const req = makeRequirement({
      id: 'req-orphan-1',
      name: 'Orphan requirement',
      metadata: { specPath: 'docs/specs/orphan.md', featureName: 'orphan', index: 0 },
    });
    store.addNode(req);

    const results = queryTraceability(store);
    expect(results).toHaveLength(1);

    const coverage = results[0].requirements[0];
    expect(coverage.status).toBe('none');
    expect(coverage.codeFiles).toHaveLength(0);
    expect(coverage.testFiles).toHaveLength(0);
    expect(coverage.maxConfidence).toBe(0);
  });

  it('filters by specPath', () => {
    const store = new GraphStore();
    store.addNode(
      makeRequirement({
        id: 'req-a',
        name: 'A',
        metadata: { specPath: 'docs/a.md', featureName: 'a', index: 0 },
      })
    );
    store.addNode(
      makeRequirement({
        id: 'req-b',
        name: 'B',
        metadata: { specPath: 'docs/b.md', featureName: 'b', index: 0 },
      })
    );

    const results = queryTraceability(store, { specPath: 'docs/a.md' });
    expect(results).toHaveLength(1);
    expect(results[0].specPath).toBe('docs/a.md');
  });

  it('filters by featureName', () => {
    const store = new GraphStore();
    store.addNode(
      makeRequirement({
        id: 'req-x',
        name: 'X',
        metadata: { specPath: 'docs/x.md', featureName: 'feature-x', index: 0 },
      })
    );
    store.addNode(
      makeRequirement({
        id: 'req-y',
        name: 'Y',
        metadata: { specPath: 'docs/y.md', featureName: 'feature-y', index: 0 },
      })
    );

    const results = queryTraceability(store, { featureName: 'feature-y' });
    expect(results).toHaveLength(1);
    expect(results[0].featureName).toBe('feature-y');
  });

  it('summary statistics are correct', () => {
    const store = new GraphStore();
    const spec = 'docs/specs/stats.md';
    const feature = 'stats';

    // Fully traced requirement
    store.addNode(
      makeRequirement({
        id: 'req-s-1',
        name: 'R1',
        metadata: { specPath: spec, featureName: feature, index: 0 },
      })
    );
    store.addNode(makeFileNode('f1', 'src/a.ts'));
    store.addNode(makeFileNode('t1', 'src/a.test.ts'));
    store.addEdge(makeEdge('req-s-1', 'f1', 'requires'));
    store.addEdge(makeEdge('req-s-1', 't1', 'verified_by'));

    // Code-only requirement
    store.addNode(
      makeRequirement({
        id: 'req-s-2',
        name: 'R2',
        metadata: { specPath: spec, featureName: feature, index: 1 },
      })
    );
    store.addNode(makeFileNode('f2', 'src/b.ts'));
    store.addEdge(makeEdge('req-s-2', 'f2', 'requires'));

    // Test-only requirement
    store.addNode(
      makeRequirement({
        id: 'req-s-3',
        name: 'R3',
        metadata: { specPath: spec, featureName: feature, index: 2 },
      })
    );
    store.addNode(makeFileNode('t3', 'src/c.test.ts'));
    store.addEdge(makeEdge('req-s-3', 't3', 'verified_by'));

    // Untraceable requirement
    store.addNode(
      makeRequirement({
        id: 'req-s-4',
        name: 'R4',
        metadata: { specPath: spec, featureName: feature, index: 3 },
      })
    );

    const results = queryTraceability(store);
    expect(results).toHaveLength(1);

    const summary = results[0].summary;
    expect(summary.total).toBe(4);
    expect(summary.withCode).toBe(2); // R1, R2
    expect(summary.withTests).toBe(2); // R1, R3
    expect(summary.fullyTraced).toBe(1); // R1
    expect(summary.untraceable).toBe(1); // R4
    expect(summary.coveragePercent).toBe(25); // 1/4 = 25%

    // Verify requirements are sorted by index
    const reqNames = results[0].requirements.map((r) => r.requirementName);
    expect(reqNames).toEqual(['R1', 'R2', 'R3', 'R4']);
  });
});
