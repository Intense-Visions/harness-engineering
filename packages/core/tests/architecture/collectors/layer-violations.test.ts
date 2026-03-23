import { describe, it, expect, vi } from 'vitest';
import { LayerViolationCollector } from '../../../src/architecture/collectors/layer-violations';
import type { ArchConfig } from '../../../src/architecture/types';

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

describe('LayerViolationCollector', () => {
  const collector = new LayerViolationCollector();

  it('has category "layer-violations"', () => {
    expect(collector.category).toBe('layer-violations');
  });

  it('returns empty results when no violations', async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      value: { valid: true, violations: [], graph: { nodes: [], edges: [] } },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe(0);
    expect(results[0]!.violations).toHaveLength(0);
  });

  it('returns one violation per WRONG_LAYER dependency violation', async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      value: {
        valid: false,
        violations: [
          {
            file: '/project/src/api/handler.ts',
            imports: '/project/src/db/connection.ts',
            fromLayer: 'api',
            toLayer: 'db',
            reason: 'WRONG_LAYER',
            line: 5,
            suggestion: 'Move to allowed layer',
          },
        ],
        graph: { nodes: [], edges: [] },
      },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe(1);
    expect(results[0]!.violations).toHaveLength(1);
    expect(results[0]!.violations[0]!.severity).toBe('error');
    expect(results[0]!.violations[0]!.id).toMatch(/^[a-f0-9]{64}$/);
    expect(results[0]!.violations[0]!.detail).toContain('api');
    expect(results[0]!.violations[0]!.detail).toContain('db');
  });

  it('excludes FORBIDDEN_IMPORT violations (those go to ForbiddenImportCollector)', async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      value: {
        valid: false,
        violations: [
          {
            file: '/project/src/api/handler.ts',
            imports: '/project/src/db/connection.ts',
            fromLayer: 'api',
            toLayer: 'db',
            reason: 'WRONG_LAYER',
            line: 5,
            suggestion: 'Fix',
          },
          {
            file: '/project/src/api/handler.ts',
            imports: '/project/src/internal/secret.ts',
            fromLayer: 'api',
            toLayer: 'internal',
            reason: 'FORBIDDEN_IMPORT',
            line: 7,
            suggestion: 'Fix',
          },
        ],
        graph: { nodes: [], edges: [] },
      },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results[0]!.value).toBe(1);
    expect(results[0]!.violations).toHaveLength(1);
  });

  it('produces stable violation IDs', async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      value: {
        valid: false,
        violations: [
          {
            file: '/project/src/api/handler.ts',
            imports: '/project/src/db/conn.ts',
            fromLayer: 'api',
            toLayer: 'db',
            reason: 'WRONG_LAYER',
            line: 5,
            suggestion: 'Fix',
          },
        ],
        graph: { nodes: [], edges: [] },
      },
    } as any);

    const r1 = await collector.collect(baseConfig, '/project');
    const r2 = await collector.collect(baseConfig, '/project');
    expect(r1[0]!.violations[0]!.id).toBe(r2[0]!.violations[0]!.id);
  });
});
