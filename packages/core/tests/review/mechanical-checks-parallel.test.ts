import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/context/agents-map', () => ({
  validateAgentsMap: vi.fn().mockResolvedValue({
    ok: true,
    value: { valid: true },
  }),
}));

vi.mock('../../src/constraints/dependencies', () => ({
  validateDependencies: vi.fn().mockResolvedValue({
    ok: true,
    value: { valid: true, violations: [], graph: { nodes: [], edges: [] } },
  }),
  defineLayer: vi.fn().mockReturnValue({ name: 'test', patterns: [], allowed: [] }),
}));

vi.mock('../../src/context/doc-coverage', () => ({
  checkDocCoverage: vi.fn().mockResolvedValue({
    ok: true,
    value: {
      domain: 'test',
      documented: [],
      undocumented: [],
      coveragePercentage: 100,
      gaps: [],
    },
  }),
}));

vi.mock('../../src/security/scanner', () => ({
  SecurityScanner: class {
    configureForProject = vi.fn();
    scanFiles = vi.fn().mockResolvedValue({
      findings: [],
      scannedFiles: 0,
      rulesApplied: 0,
      externalToolsUsed: [],
      coverage: 'baseline',
    });
  },
}));

vi.mock('../../src/security/config', () => ({
  parseSecurityConfig: vi
    .fn()
    .mockReturnValue({ enabled: true, strict: false, exclude: ['**/node_modules/**'] }),
}));

vi.mock('../../src/shared/parsers', () => ({
  TypeScriptParser: class {},
}));

import { runMechanicalChecks } from '../../src/review/mechanical-checks';

describe('runMechanicalChecks parallelization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces all check statuses (validates parallel execution collects all results)', async () => {
    const result = await runMechanicalChecks({
      projectRoot: '/fake',
      config: {},
      changedFiles: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.checks.validate).toBe('pass');
    expect(result.value.checks.checkDeps).toBe('pass');
    expect(result.value.checks.checkDocs).toBe('pass');
    expect(result.value.checks.securityScan).toBe('pass');
  });

  it('still stops pipeline when validate fails even with parallel warning checks', async () => {
    const { validateAgentsMap } = await import('../../src/context/agents-map');
    vi.mocked(validateAgentsMap).mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'AGENTS.md broken',
        details: {},
        suggestions: [],
      },
    });

    const result = await runMechanicalChecks({
      projectRoot: '/fake',
      config: {},
      changedFiles: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stopPipeline).toBe(true);
    expect(result.value.checks.validate).toBe('fail');
  });

  it('skips checks when listed in skip array', async () => {
    const result = await runMechanicalChecks({
      projectRoot: '/fake',
      config: {},
      changedFiles: [],
      skip: ['validate', 'check-docs'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.checks.validate).toBe('skip');
    expect(result.value.checks.checkDocs).toBe('skip');
    expect(result.value.checks.checkDeps).toBe('pass');
  });
});
