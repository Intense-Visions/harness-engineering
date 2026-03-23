import { describe, it, expect, vi } from 'vitest';
import { ForbiddenImportCollector } from '../../../src/architecture/collectors/forbidden-imports';
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

describe('ForbiddenImportCollector', () => {
  const collector = new ForbiddenImportCollector();

  it('has category "forbidden-imports"', () => {
    expect(collector.category).toBe('forbidden-imports');
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

  it('returns only FORBIDDEN_IMPORT violations', async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      value: {
        valid: false,
        violations: [
          {
            file: '/project/src/api/handler.ts',
            imports: '/project/src/internal/secret.ts',
            fromLayer: 'api',
            toLayer: 'internal',
            reason: 'FORBIDDEN_IMPORT',
            line: 7,
            suggestion: 'Use the public API instead',
          },
          {
            file: '/project/src/api/handler.ts',
            imports: '/project/src/db/connection.ts',
            fromLayer: 'api',
            toLayer: 'db',
            reason: 'WRONG_LAYER',
            line: 5,
            suggestion: 'Fix layer',
          },
        ],
        graph: { nodes: [], edges: [] },
      },
    } as any);

    const results = await collector.collect(baseConfig, '/project');
    expect(results[0]!.value).toBe(1);
    expect(results[0]!.violations).toHaveLength(1);
    expect(results[0]!.violations[0]!.detail).toContain('secret.ts');
  });

  it('produces stable violation IDs', async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      value: {
        valid: false,
        violations: [
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

    const r1 = await collector.collect(baseConfig, '/project');
    const r2 = await collector.collect(baseConfig, '/project');
    expect(r1[0]!.violations[0]!.id).toBe(r2[0]!.violations[0]!.id);
  });
});
