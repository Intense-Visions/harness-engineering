import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncConstraintNodes } from '../../src/architecture/sync-constraints';
import type { ConstraintNodeStore } from '../../src/architecture/sync-constraints';
import type { ConstraintRule, MetricResult } from '../../src/architecture/types';

function createMockStore(): ConstraintNodeStore & {
  nodes: Map<string, Record<string, unknown>>;
} {
  const nodes = new Map<string, Record<string, unknown>>();
  return {
    nodes,
    findNodes(query: { type: string }) {
      return [...nodes.values()].filter((n) => n.type === query.type) as Array<{
        id: string;
        [key: string]: unknown;
      }>;
    },
    upsertNode(node: Record<string, unknown>) {
      nodes.set(node.id as string, { ...node });
    },
    removeNode(id: string) {
      nodes.delete(id);
    },
  };
}

const rule1: ConstraintRule = {
  id: 'rule-1',
  category: 'circular-deps',
  description: 'No circular dependencies',
  scope: 'project',
};

const rule2: ConstraintRule = {
  id: 'rule-2',
  category: 'complexity',
  description: 'Complexity within thresholds',
  scope: 'project',
};

describe('syncConstraintNodes', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
  });

  it('creates constraint nodes for each rule', () => {
    syncConstraintNodes(store, [rule1, rule2], []);
    expect(store.nodes.size).toBe(2);
    expect(store.nodes.get('rule-1')?.type).toBe('constraint');
    expect(store.nodes.get('rule-2')?.type).toBe('constraint');
  });

  it('sets createdAt on first insert', () => {
    syncConstraintNodes(store, [rule1], []);
    const node = store.nodes.get('rule-1')!;
    expect(node.createdAt).toBeDefined();
    expect(typeof node.createdAt).toBe('string');
  });

  it('preserves createdAt on subsequent syncs', () => {
    syncConstraintNodes(store, [rule1], []);
    const originalCreatedAt = store.nodes.get('rule-1')!.createdAt;

    syncConstraintNodes(store, [rule1], []);
    expect(store.nodes.get('rule-1')!.createdAt).toBe(originalCreatedAt);
  });

  it('updates lastViolatedAt when violations match', () => {
    syncConstraintNodes(store, [rule1], []);
    expect(store.nodes.get('rule-1')!.lastViolatedAt).toBeNull();

    const violations: MetricResult[] = [
      {
        category: 'circular-deps',
        scope: 'project',
        value: 1,
        violations: [
          {
            id: 'v1',
            file: 'src/a.ts',
            detail: 'cycle found',
            severity: 'error',
          },
        ],
      },
    ];

    syncConstraintNodes(store, [rule1], violations);
    expect(store.nodes.get('rule-1')!.lastViolatedAt).toBeDefined();
    expect(typeof store.nodes.get('rule-1')!.lastViolatedAt).toBe('string');
  });

  it('does not update lastViolatedAt when no violations match', () => {
    syncConstraintNodes(store, [rule1], []);
    const firstLastViolated = store.nodes.get('rule-1')!.lastViolatedAt;

    const violations: MetricResult[] = [
      {
        category: 'complexity',
        scope: 'project',
        value: 1,
        violations: [
          {
            id: 'v1',
            file: 'src/a.ts',
            detail: 'too complex',
            severity: 'warning',
          },
        ],
      },
    ];

    syncConstraintNodes(store, [rule1], violations);
    expect(store.nodes.get('rule-1')!.lastViolatedAt).toBe(firstLastViolated);
  });

  it('prunes orphaned constraint nodes', () => {
    syncConstraintNodes(store, [rule1, rule2], []);
    expect(store.nodes.size).toBe(2);

    syncConstraintNodes(store, [rule1], []);
    expect(store.nodes.size).toBe(1);
    expect(store.nodes.has('rule-1')).toBe(true);
    expect(store.nodes.has('rule-2')).toBe(false);
  });

  it('stores rule metadata on constraint nodes', () => {
    syncConstraintNodes(store, [rule1], []);
    const node = store.nodes.get('rule-1')!;
    expect(node.name).toBe('No circular dependencies');
    expect(node.category).toBe('circular-deps');
    expect(node.scope).toBe('project');
  });

  it('matches scoped rules when violation file starts with rule scope', () => {
    const scopedRule: ConstraintRule = {
      id: 'rule-scoped',
      category: 'complexity',
      description: 'Scoped complexity check',
      scope: 'src/api',
    };
    const violations: MetricResult[] = [
      {
        category: 'complexity',
        scope: 'project',
        value: 1,
        violations: [
          { id: 'v1', file: 'src/api/handler.ts', detail: 'too complex', severity: 'error' },
        ],
      },
    ];
    syncConstraintNodes(store, [scopedRule], violations);
    expect(store.nodes.get('rule-scoped')!.lastViolatedAt).toBeDefined();
    expect(typeof store.nodes.get('rule-scoped')!.lastViolatedAt).toBe('string');
  });

  it('does not match scoped rules when no violation file matches scope', () => {
    const scopedRule: ConstraintRule = {
      id: 'rule-scoped-miss',
      category: 'complexity',
      description: 'Scoped complexity check',
      scope: 'src/api',
    };
    const violations: MetricResult[] = [
      {
        category: 'complexity',
        scope: 'project',
        value: 1,
        violations: [
          { id: 'v1', file: 'src/lib/util.ts', detail: 'too complex', severity: 'error' },
        ],
      },
    ];
    syncConstraintNodes(store, [scopedRule], violations);
    expect(store.nodes.get('rule-scoped-miss')!.lastViolatedAt).toBeNull();
  });
});
