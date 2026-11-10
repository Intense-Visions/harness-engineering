import { describe, it, expect } from 'vitest';
import { detectCircularDeps } from '../../src/constraints/circular-deps';
import type { DependencyGraph } from '../../src/constraints/types';

/**
 * Regression coverage for #2329: the reported cycle chain must close on its
 * FIRST node (`b -> a -> b`), not repeat its last one (`b -> a -> a`).
 *
 * The chain is a data contract, not just rendering: `check-deps` prints it,
 * `--json` carries it, and the arch `circular-deps` collector hashes it into
 * a violation id. Every consecutive pair must therefore be a real import edge.
 */
function edgesOf(graph: DependencyGraph): Set<string> {
  return new Set(graph.edges.map((e) => `${e.from}=>${e.to}`));
}

function expectClosedRealChain(graph: DependencyGraph, size: number): string[] {
  const result = detectCircularDeps(graph);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('unreachable');
  expect(result.value.cycles).toHaveLength(1);
  const { cycle } = result.value.cycles[0]!;
  expect(cycle).toHaveLength(size + 1);
  expect(cycle[cycle.length - 1]).toBe(cycle[0]);
  // No node other than the closing one repeats.
  expect(new Set(cycle.slice(0, -1)).size).toBe(size);
  const edges = edgesOf(graph);
  for (let i = 0; i < cycle.length - 1; i++) {
    expect(edges.has(`${cycle[i]}=>${cycle[i + 1]}`)).toBe(true);
  }
  return cycle;
}

describe('detectCircularDeps chain shape (#2329)', () => {
  it('closes a 2-file cycle on its first node', () => {
    const cycle = expectClosedRealChain(
      {
        nodes: ['b.ts', 'a.ts'],
        edges: [
          { from: 'b.ts', to: 'a.ts', importType: 'static', line: 1 },
          { from: 'a.ts', to: 'b.ts', importType: 'static', line: 1 },
        ],
      },
      2
    );
    expect(cycle).toEqual(['b.ts', 'a.ts', 'b.ts']);
  });

  it('closes a 3-file cycle on its first node', () => {
    const cycle = expectClosedRealChain(
      {
        nodes: ['a.ts', 'b.ts', 'c.ts'],
        edges: [
          { from: 'a.ts', to: 'b.ts', importType: 'static', line: 1 },
          { from: 'b.ts', to: 'c.ts', importType: 'static', line: 1 },
          { from: 'c.ts', to: 'a.ts', importType: 'static', line: 1 },
        ],
      },
      3
    );
    expect(cycle).toEqual(['a.ts', 'b.ts', 'c.ts', 'a.ts']);
  });

  it('closes a self-import on itself', () => {
    const result = detectCircularDeps({
      nodes: ['a.ts'],
      edges: [{ from: 'a.ts', to: 'a.ts', importType: 'static', line: 1 }],
    });
    expect(result.ok && result.value.cycles[0]!.cycle).toEqual(['a.ts', 'a.ts']);
  });
});
