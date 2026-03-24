import { describe, it, expect, beforeEach } from 'vitest';
import { detectStaleConstraints } from '../../src/architecture/detect-stale';
import type { ConstraintNodeStore } from '../../src/architecture/sync-constraints';

function createMockStore(nodes: Array<Record<string, unknown>>): ConstraintNodeStore {
  const nodeMap = new Map(nodes.map((n) => [n.id as string, n]));
  return {
    findNodes(query: { type: string }) {
      return [...nodeMap.values()].filter((n) => n.type === query.type) as Array<{
        id: string;
        [key: string]: unknown;
      }>;
    },
    upsertNode(node: Record<string, unknown>) {
      nodeMap.set(node.id as string, node);
    },
    removeNode(id: string) {
      nodeMap.delete(id);
    },
  };
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('detectStaleConstraints', () => {
  it('returns empty when no constraints exist', () => {
    const store = createMockStore([]);
    const result = detectStaleConstraints(store, 30);
    expect(result.staleConstraints).toEqual([]);
    expect(result.totalConstraints).toBe(0);
    expect(result.windowDays).toBe(30);
  });

  it('detects constraints with lastViolatedAt older than window', () => {
    const store = createMockStore([
      {
        id: 'r1',
        type: 'constraint',
        name: 'No circular deps',
        category: 'circular-deps',
        scope: 'project',
        createdAt: daysAgo(60),
        lastViolatedAt: daysAgo(45),
      },
    ]);

    const result = detectStaleConstraints(store, 30);
    expect(result.staleConstraints).toHaveLength(1);
    expect(result.staleConstraints[0]!.id).toBe('r1');
    expect(result.staleConstraints[0]!.daysSinceLastViolation).toBeGreaterThanOrEqual(44);
  });

  it('does not flag constraints violated within window', () => {
    const store = createMockStore([
      {
        id: 'r1',
        type: 'constraint',
        name: 'No circular deps',
        category: 'circular-deps',
        scope: 'project',
        createdAt: daysAgo(60),
        lastViolatedAt: daysAgo(5),
      },
    ]);

    const result = detectStaleConstraints(store, 30);
    expect(result.staleConstraints).toHaveLength(0);
  });

  it('uses createdAt when lastViolatedAt is null (never violated)', () => {
    const store = createMockStore([
      {
        id: 'r1',
        type: 'constraint',
        name: 'No circular deps',
        category: 'circular-deps',
        scope: 'project',
        createdAt: daysAgo(60),
        lastViolatedAt: null,
      },
    ]);

    const result = detectStaleConstraints(store, 30);
    expect(result.staleConstraints).toHaveLength(1);
    expect(result.staleConstraints[0]!.lastViolatedAt).toBeNull();
  });

  it('does not flag recently created constraints that were never violated', () => {
    const store = createMockStore([
      {
        id: 'r1',
        type: 'constraint',
        name: 'New rule',
        category: 'complexity',
        scope: 'project',
        createdAt: daysAgo(5),
        lastViolatedAt: null,
      },
    ]);

    const result = detectStaleConstraints(store, 30);
    expect(result.staleConstraints).toHaveLength(0);
  });

  it('filters by category when provided', () => {
    const store = createMockStore([
      {
        id: 'r1',
        type: 'constraint',
        name: 'No circular deps',
        category: 'circular-deps',
        scope: 'project',
        createdAt: daysAgo(60),
        lastViolatedAt: null,
      },
      {
        id: 'r2',
        type: 'constraint',
        name: 'Complexity check',
        category: 'complexity',
        scope: 'project',
        createdAt: daysAgo(60),
        lastViolatedAt: null,
      },
    ]);

    const result = detectStaleConstraints(store, 30, 'circular-deps');
    expect(result.staleConstraints).toHaveLength(1);
    expect(result.staleConstraints[0]!.category).toBe('circular-deps');
    expect(result.totalConstraints).toBe(1);
  });

  it('sorts results by most stale first', () => {
    const store = createMockStore([
      {
        id: 'r1',
        type: 'constraint',
        name: 'Rule A',
        category: 'circular-deps',
        scope: 'project',
        createdAt: daysAgo(90),
        lastViolatedAt: daysAgo(40),
      },
      {
        id: 'r2',
        type: 'constraint',
        name: 'Rule B',
        category: 'complexity',
        scope: 'project',
        createdAt: daysAgo(90),
        lastViolatedAt: daysAgo(80),
      },
    ]);

    const result = detectStaleConstraints(store, 30);
    expect(result.staleConstraints).toHaveLength(2);
    expect(result.staleConstraints[0]!.id).toBe('r2'); // older = more stale
    expect(result.staleConstraints[1]!.id).toBe('r1');
  });

  it('defaults windowDays to 30', () => {
    const store = createMockStore([]);
    const result = detectStaleConstraints(store);
    expect(result.windowDays).toBe(30);
  });
});
