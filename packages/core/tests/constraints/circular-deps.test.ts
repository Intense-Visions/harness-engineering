import { describe, it, expect } from 'vitest';
import { detectCircularDeps, detectCircularDepsInFiles } from '../../src/constraints/circular-deps';
import { TypeScriptParser } from '../../src/shared/parsers';
import type { DependencyGraph } from '../../src/constraints/types';
import { join } from 'path';

describe('detectCircularDeps', () => {
  it('should detect cycles in dependency graph', () => {
    const graph: DependencyGraph = {
      nodes: ['a.ts', 'b.ts', 'c.ts'],
      edges: [
        { from: 'a.ts', to: 'b.ts', importType: 'static', line: 1 },
        { from: 'b.ts', to: 'c.ts', importType: 'static', line: 1 },
        { from: 'c.ts', to: 'a.ts', importType: 'static', line: 1 },
      ],
    };

    const result = detectCircularDeps(graph);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hasCycles).toBe(true);
      expect(result.value.cycles.length).toBeGreaterThan(0);
      expect(result.value.largestCycle).toBe(3);
    }
  });

  it('should return no cycles for acyclic graph', () => {
    const graph: DependencyGraph = {
      nodes: ['a.ts', 'b.ts', 'c.ts'],
      edges: [
        { from: 'a.ts', to: 'b.ts', importType: 'static', line: 1 },
        { from: 'b.ts', to: 'c.ts', importType: 'static', line: 1 },
      ],
    };

    const result = detectCircularDeps(graph);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hasCycles).toBe(false);
      expect(result.value.cycles).toHaveLength(0);
      expect(result.value.largestCycle).toBe(0);
    }
  });

  it('should detect self-referential cycle', () => {
    const graph: DependencyGraph = {
      nodes: ['a.ts'],
      edges: [
        { from: 'a.ts', to: 'a.ts', importType: 'static', line: 1 },
      ],
    };

    const result = detectCircularDeps(graph);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hasCycles).toBe(true);
    }
  });

  it('should handle disconnected nodes', () => {
    const graph: DependencyGraph = {
      nodes: ['a.ts', 'b.ts', 'c.ts', 'd.ts'], // d.ts has no edges
      edges: [
        { from: 'a.ts', to: 'b.ts', importType: 'static', line: 1 },
        { from: 'b.ts', to: 'c.ts', importType: 'static', line: 1 },
      ],
    };

    const result = detectCircularDeps(graph);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hasCycles).toBe(false);
    }
  });
});

describe('detectCircularDepsInFiles', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../fixtures/circular-deps');

  it('should detect cycles from actual files', async () => {
    const files = [
      join(fixturesDir, 'a.ts'),
      join(fixturesDir, 'b.ts'),
      join(fixturesDir, 'c.ts'),
    ];

    const result = await detectCircularDepsInFiles(files, parser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hasCycles).toBe(true);
      expect(result.value.cycles.length).toBeGreaterThan(0);
    }
  });
});
