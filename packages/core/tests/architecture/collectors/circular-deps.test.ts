import { describe, it, expect, vi } from 'vitest';
import { CircularDepsCollector } from '../../../src/architecture/collectors/circular-deps';
import type { ArchConfig } from '../../../src/architecture/types';

const baseConfig: ArchConfig = {
  enabled: true,
  baselinePath: '.harness/arch/baselines.json',
  thresholds: {},
  modules: {},
};

// Mock buildDependencyGraph and detectCircularDeps
vi.mock('../../../src/constraints/dependencies', () => ({
  buildDependencyGraph: vi.fn(),
}));
vi.mock('../../../src/constraints/circular-deps', () => ({
  detectCircularDeps: vi.fn(),
}));

import { buildDependencyGraph } from '../../../src/constraints/dependencies';
import { detectCircularDeps } from '../../../src/constraints/circular-deps';

const mockBuild = vi.mocked(buildDependencyGraph);
const mockDetect = vi.mocked(detectCircularDeps);

describe('CircularDepsCollector', () => {
  const collector = new CircularDepsCollector();

  it('has category "circular-deps"', () => {
    expect(collector.category).toBe('circular-deps');
  });

  it('returns empty results when no cycles found', async () => {
    mockBuild.mockResolvedValue({
      ok: true,
      value: { nodes: ['a.ts', 'b.ts'], edges: [] },
    } as any);
    mockDetect.mockReturnValue({
      ok: true,
      value: { hasCycles: false, cycles: [], largestCycle: 0 },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results).toHaveLength(1);
    expect(results[0]!.category).toBe('circular-deps');
    expect(results[0]!.scope).toBe('project');
    expect(results[0]!.value).toBe(0);
    expect(results[0]!.violations).toHaveLength(0);
  });

  it('returns one violation per cycle', async () => {
    mockBuild.mockResolvedValue({
      ok: true,
      value: {
        nodes: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
        edges: [
          { from: 'src/a.ts', to: 'src/b.ts', importType: 'static', line: 1 },
          { from: 'src/b.ts', to: 'src/a.ts', importType: 'static', line: 1 },
        ],
      },
    } as any);
    mockDetect.mockReturnValue({
      ok: true,
      value: {
        hasCycles: true,
        cycles: [{ cycle: ['src/a.ts', 'src/b.ts', 'src/a.ts'], severity: 'error', size: 2 }],
        largestCycle: 2,
      },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe(1);
    expect(results[0]!.violations).toHaveLength(1);
    expect(results[0]!.violations[0]!.severity).toBe('error');
    expect(results[0]!.violations[0]!.id).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces stable violation IDs', async () => {
    mockBuild.mockResolvedValue({
      ok: true,
      value: { nodes: ['src/a.ts', 'src/b.ts'], edges: [] },
    } as any);
    mockDetect.mockReturnValue({
      ok: true,
      value: {
        hasCycles: true,
        cycles: [{ cycle: ['src/a.ts', 'src/b.ts', 'src/a.ts'], severity: 'error', size: 2 }],
        largestCycle: 2,
      },
    } as any);

    const r1 = await collector.collect(baseConfig, '/project');
    const r2 = await collector.collect(baseConfig, '/project');
    expect(r1[0]!.violations[0]!.id).toBe(r2[0]!.violations[0]!.id);
  });

  it('includes metadata with largestCycle', async () => {
    mockBuild.mockResolvedValue({
      ok: true,
      value: { nodes: [], edges: [] },
    } as any);
    mockDetect.mockReturnValue({
      ok: true,
      value: {
        hasCycles: true,
        cycles: [{ cycle: ['a.ts', 'b.ts', 'c.ts', 'a.ts'], severity: 'error', size: 3 }],
        largestCycle: 3,
      },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results[0]!.metadata).toEqual({ largestCycle: 3, cycleCount: 1 });
  });
});
