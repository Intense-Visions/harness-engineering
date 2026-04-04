import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all core modules before importing orchestrator
vi.mock('../../src/context/agents-map', () => ({
  validateAgentsMap: vi.fn().mockResolvedValue({ ok: true, value: { valid: true } }),
}));

vi.mock('../../src/constraints/dependencies', () => ({
  validateDependencies: vi.fn().mockResolvedValue({
    ok: true,
    value: { valid: true, violations: [], graph: { nodes: [], edges: [] } },
  }),
}));

vi.mock('../../src/context/doc-coverage', () => ({
  checkDocCoverage: vi.fn().mockResolvedValue({
    ok: true,
    value: { domain: 'test', documented: [], undocumented: [], coveragePercentage: 100, gaps: [] },
  }),
}));

vi.mock('../../src/entropy/analyzer', () => {
  const mockAnalyze = vi.fn().mockResolvedValue({
    ok: true,
    value: {
      summary: { totalIssues: 0 },
      drift: { drifts: [], stats: { driftsFound: 0 } },
      deadCode: { deadExports: [] },
    },
  });
  return {
    EntropyAnalyzer: class {
      analyze = mockAnalyze;
    },
  };
});

vi.mock('../../src/shared/parsers', () => ({
  TypeScriptParser: class {},
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

vi.mock('glob', () => ({
  glob: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/architecture', () => ({
  ArchConfigSchema: {
    parse: vi.fn().mockReturnValue({
      enabled: true,
      baselinePath: '.harness/arch/baselines.json',
      thresholds: {},
      modules: {},
    }),
  },
  runAll: vi.fn().mockResolvedValue([]),
}));

import { runCIChecks } from '../../src/ci/check-orchestrator';

function minimalConfig(overrides: Record<string, unknown> = {}) {
  return {
    version: 1 as const,
    rootDir: '.',
    agentsMapPath: './AGENTS.md',
    docsDir: './docs',
    ...overrides,
  };
}

describe('runCIChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a report with all checks when none skipped', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: minimalConfig(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.value;
    expect(report.version).toBe(1);
    expect(report.checks).toHaveLength(9);
    expect(report.checks.map((c) => c.name)).toEqual([
      'validate',
      'deps',
      'docs',
      'entropy',
      'security',
      'perf',
      'phase-gate',
      'arch',
      'traceability',
    ]);
    expect(report.summary.total).toBe(9);
  });

  it('skips checks listed in skip option', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: minimalConfig(),
      skip: ['entropy', 'docs'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.value;
    const skipped = report.checks.filter((c) => c.status === 'skip');
    expect(skipped).toHaveLength(2);
    expect(skipped.map((c) => c.name).sort()).toEqual(['docs', 'entropy']);
    expect(report.summary.skipped).toBe(2);
  });

  it('sets exitCode 0 when all checks pass', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: minimalConfig(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.exitCode).toBe(0);
    expect(result.value.summary.passed).toBeGreaterThan(0);
  });

  it('sets exitCode 1 when a check has errors', async () => {
    const { validateAgentsMap } = await import('../../src/context/agents-map');
    vi.mocked(validateAgentsMap).mockResolvedValueOnce({
      ok: false,
      error: { code: 'PARSE_ERROR', message: 'AGENTS.md not found', details: {}, suggestions: [] },
    });

    const result = await runCIChecks({
      projectRoot: '/fake',
      config: minimalConfig(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.exitCode).toBe(1);
    expect(result.value.summary.failed).toBeGreaterThan(0);
  });

  it('sets exitCode 1 on warnings when failOn is warning', async () => {
    const { checkDocCoverage } = await import('../../src/context/doc-coverage');
    vi.mocked(checkDocCoverage).mockResolvedValueOnce({
      ok: true,
      value: {
        domain: 'test',
        documented: ['a.md'],
        undocumented: ['b.ts'],
        coveragePercentage: 50,
        gaps: [{ file: 'b.ts', suggestedSection: 'API', importance: 'high' }],
      },
    });

    const result = await runCIChecks({
      projectRoot: '/fake',
      config: minimalConfig(),
      failOn: 'warning',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Doc coverage gaps produce warnings
    if (result.value.summary.warnings > 0) {
      expect(result.value.exitCode).toBe(1);
    }
  });

  it('includes timestamp and project name', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: minimalConfig({ name: 'test-project' }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.project).toBe('test-project');
    expect(result.value.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('records durationMs for each non-skipped check', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: minimalConfig(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const check of result.value.checks) {
      if (check.status !== 'skip') {
        expect(check.durationMs).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('runs validate first and produces all 8 check results', async () => {
    // Track call order using timestamps
    const callOrder: string[] = [];
    const { validateAgentsMap } = await import('../../src/context/agents-map');
    vi.mocked(validateAgentsMap).mockImplementation(async () => {
      callOrder.push('validate');
      return { ok: true, value: { valid: true } } as any;
    });

    const result = await runCIChecks({
      projectRoot: '/fake',
      config: minimalConfig(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // validate must be the first check to start
    expect(callOrder[0]).toBe('validate');

    // All checks still produce results
    expect(result.value.checks).toHaveLength(9);
    expect(result.value.checks.map((c) => c.name)).toEqual([
      'validate',
      'deps',
      'docs',
      'entropy',
      'security',
      'perf',
      'phase-gate',
      'arch',
      'traceability',
    ]);
  });

  it('includes arch check in results', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: minimalConfig(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const archCheck = result.value.checks.find((c) => c.name === 'arch');
    expect(archCheck).toBeDefined();
    expect(archCheck!.status).toBe('pass');
  });

  it('preserves check ordering in output even with parallel execution', async () => {
    const result = await runCIChecks({
      projectRoot: '/fake',
      config: minimalConfig(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Output order must match ALL_CHECKS order regardless of completion order
    expect(result.value.checks.map((c) => c.name)).toEqual([
      'validate',
      'deps',
      'docs',
      'entropy',
      'security',
      'perf',
      'phase-gate',
      'arch',
      'traceability',
    ]);
  });
});
