import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LayerViolationCollector } from '../../../src/architecture/collectors/layer-violations';
import { ForbiddenImportCollector } from '../../../src/architecture/collectors/forbidden-imports';
import type { ArchConfig } from '../../../src/architecture/types';

/**
 * #2098, sibling sweep. Both of these collectors call `validateDependencies`
 * with `fallbackBehavior: 'skip'` — the one policy that CAN return
 * `Ok({ skipped: true })` — and then read only `result.value.violations`,
 * emitting `{ value: 0, violations: [] }`: a clean metric for an analysis that
 * abstained. The PR body originally claimed "No consumer read `skipped`";
 * these two did, and dropped it.
 *
 * HONEST SCOPE, pinned here so nobody reads more into it: this records the
 * abstention on the same `metadata` channel the collectors' `!result.ok` branch
 * already uses. Nothing downstream consumes it yet — `check-arch` compares
 * `value` against a baseline and has no abstention channel (#2268). These tests pin
 * the record, not a gate.
 */
const baseConfig: ArchConfig = {
  enabled: true,
  baselinePath: '.harness/arch/baselines.json',
  thresholds: {},
  modules: {},
};

vi.mock('../../../src/constraints/dependencies', () => ({
  validateDependencies: vi.fn(),
}));

import { validateDependencies } from '../../../src/constraints/dependencies';
const mockValidate = vi.mocked(validateDependencies);

describe('dependency collectors record an abstention (#2098)', () => {
  beforeEach(() => {
    mockValidate.mockReset();
  });

  const COLLECTORS = [
    ['layer-violations', new LayerViolationCollector()],
    ['forbidden-imports', new ForbiddenImportCollector()],
  ] as const;

  it.each(COLLECTORS)('%s marks the metric abstained when the engine skipped', async (_n, c) => {
    mockValidate.mockResolvedValue({
      ok: true,
      value: {
        valid: true,
        violations: [],
        graph: { nodes: [], edges: [] },
        skipped: true,
        reason: 'Parser unavailable',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const [metric] = await c.collect(baseConfig, '/tmp/project');

    expect(metric).toBeDefined();
    expect(metric!.metadata?.abstained).toBe(true);
    expect(metric!.metadata?.reason).toBe('Parser unavailable');
  });

  it.each(COLLECTORS)('%s leaves a real clean run unmarked', async (_n, c) => {
    mockValidate.mockResolvedValue({
      ok: true,
      value: { valid: true, violations: [], graph: { nodes: [], edges: [] } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const [metric] = await c.collect(baseConfig, '/tmp/project');

    expect(metric).toBeDefined();
    expect(metric!.value).toBe(0);
    // A genuinely clean analysis must stay distinguishable from an abstention.
    expect(metric!.metadata?.abstained).toBeUndefined();
  });
});
